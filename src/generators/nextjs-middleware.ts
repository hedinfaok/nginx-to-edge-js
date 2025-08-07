import { BaseGenerator } from './base-generator.js';
import { LocationBlock } from '../core/config-model.js';

export class NextJSGenerator extends BaseGenerator {
  /**
   * Generate Next.js middleware TypeScript code
   */
  generate(): string {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const parts: string[] = [
      this.generateHeader(),
      this.generateImports(),
      '',
      this.generateMiddlewareFunction(),
      '',
      this.generateConfig()
    ];

    return parts.join('\n');
  }

  getFileExtension(): string {
    return '.ts';
  }

  protected validatePlatformSpecific(): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    this.config.servers.forEach((server, index) => {
      // Check for features that need special handling in Next.js
      if (server.ssl) {
        warnings.push(`Server ${index}: SSL configuration is handled by deployment platform (Vercel, etc.)`);
      }

      server.locations.forEach((location, locIndex) => {
        if (location.directives.root || location.directives.alias) {
          warnings.push(`Server ${index}, Location ${locIndex}: Static files should be in the 'public' directory`);
        }

        if (location.directives.proxy_pass) {
          const backend = location.directives.proxy_pass;
          if (!backend.startsWith('http')) {
            warnings.push(`Server ${index}, Location ${locIndex}: Proxy backend should be a full URL for Next.js`);
          }
        }
      });
    });

    return { warnings, errors };
  }

  private generateImports(): string {
    return [
      'import { NextRequest, NextResponse } from "next/server";',
      'import type { NextFetchEvent } from "next/server";'
    ].join('\n');
  }

  private generateMiddlewareFunction(): string {
    const code: string[] = [
      'export function middleware(request: NextRequest, event: NextFetchEvent) {',
      '  const url = request.nextUrl.clone();',
      '  const hostname = request.headers.get("host") || "";',
      '',
      ...this.generateServerHandlers(),
      '',
      '  // Continue to next middleware or page',
      '  return NextResponse.next();',
      '}'
    ];

    return code.join('\n');
  }

  private generateServerHandlers(): string[] {
    const handlers: string[] = [];

    this.config.servers.forEach((server, index) => {
      const hostPatterns = this.extractHostPatterns(server);
      const condition = this.generateHostCondition(hostPatterns);

      handlers.push(`  // Server block ${index + 1}`);
      handlers.push(`  if (${condition}) {`);
      handlers.push(...this.generateLocationHandlers(server.locations, '    '));
      handlers.push('  }');
      handlers.push('');
    });

    return handlers;
  }

  private generateHostCondition(hostPatterns: string[]): string {
    if (hostPatterns.includes('*') || hostPatterns.length === 0) {
      return 'true';
    }

    const conditions = hostPatterns.map(pattern => {
      if (pattern.includes('*')) {
        // Convert wildcard to regex
        const regex = pattern.replace(/\*/g, '.*');
        return `hostname.match(/^${regex}$/)`;
      } else {
        return `hostname === "${pattern}"`;
      }
    });

    return conditions.join(' || ');
  }

  private generateLocationHandlers(locations: LocationBlock[], indent: string): string[] {
    const handlers: string[] = [];

    // Sort locations by specificity
    const sortedLocations = [...locations].sort((a, b) => {
      if (a.modifier === '=' && b.modifier !== '=') return -1;
      if (b.modifier === '=' && a.modifier !== '=') return 1;
      return b.path.length - a.path.length;
    });

    sortedLocations.forEach((location, index) => {
      handlers.push(`${indent}// Location: ${location.path}`);
      handlers.push(`${indent}if (${this.generateLocationCondition(location)}) {`);
      handlers.push(...this.generateLocationAction(location, indent + '  '));
      handlers.push(`${indent}}`);
      
      if (index < sortedLocations.length - 1) {
        handlers.push('');
      }
    });

    return handlers;
  }

  private generateLocationCondition(location: LocationBlock): string {
    const path = location.path;
    
    switch (location.modifier) {
      case '=':
        return `url.pathname === "${path}"`;
      case '~':
        return `url.pathname.match(/${this.convertNginxRegex(path)}/)`;
      case '~*':
        return `url.pathname.match(/${this.convertNginxRegex(path)}/i)`;
      case '^~':
        return `url.pathname.startsWith("${path}")`;
      default:
        if (path.endsWith('/')) {
          return `url.pathname.startsWith("${path}")`;
        } else {
          return `url.pathname === "${path}" || url.pathname.startsWith("${path}/")`;
        }
    }
  }

  private generateLocationAction(location: LocationBlock, indent: string): string[] {
    const actions: string[] = [];

    // Handle redirects
    if (location.directives.return) {
      const returnDir = location.directives.return;
      if (returnDir.code >= 300 && returnDir.code < 400) {
        const redirectUrl = returnDir.url || returnDir.text || '/';
        actions.push(`${indent}url.pathname = "${redirectUrl}";`);
        actions.push(`${indent}return NextResponse.redirect(url, ${returnDir.code});`);
        return actions;
      }
    }

    // Handle rewrites
    if (location.directives.rewrite) {
      location.directives.rewrite.forEach(rule => {
        if (rule.flags?.includes('redirect') || rule.flags?.includes('permanent')) {
          const code = rule.flags.includes('permanent') ? 301 : 302;
          actions.push(`${indent}if (url.pathname.match(/${rule.regex}/)) {`);
          actions.push(`${indent}  url.pathname = url.pathname.replace(/${rule.regex}/, "${rule.replacement}");`);
          actions.push(`${indent}  return NextResponse.redirect(url, ${code});`);
          actions.push(`${indent}}`);
        } else {
          // Internal rewrite
          actions.push(`${indent}if (url.pathname.match(/${rule.regex}/)) {`);
          actions.push(`${indent}  url.pathname = url.pathname.replace(/${rule.regex}/, "${rule.replacement}");`);
          actions.push(`${indent}  return NextResponse.rewrite(url);`);
          actions.push(`${indent}}`);
        }
      });
    }

    // Handle proxy_pass (rewrite to external URL)
    if (location.directives.proxy_pass) {
      const backend = location.directives.proxy_pass;
      actions.push(`${indent}// Proxy to: ${backend}`);
      actions.push(`${indent}const backendUrl = new URL("${backend}");`);
      actions.push(`${indent}backendUrl.pathname = url.pathname;`);
      actions.push(`${indent}backendUrl.search = url.search;`);
      actions.push(`${indent}return NextResponse.rewrite(backendUrl);`);
      return actions;
    }

    // Handle static files (Next.js automatically serves from /public)
    if (this.isStaticLocation(location)) {
      actions.push(`${indent}// Static files served from /public directory`);
      actions.push(`${indent}return NextResponse.next();`);
      return actions;
    }

    // Handle custom headers
    if (location.directives.add_header) {
      actions.push(`${indent}const response = NextResponse.next();`);
      Object.entries(location.directives.add_header).forEach(([header, value]) => {
        actions.push(`${indent}response.headers.set("${header}", "${value}");`);
      });
      actions.push(`${indent}return response;`);
      return actions;
    }

    // Default action
    actions.push(`${indent}return NextResponse.next();`);
    return actions;
  }

  private generateConfig(): string {
    // Extract all paths that should be matched by middleware
    const paths = new Set<string>();
    
    this.config.servers.forEach(server => {
      server.locations.forEach(location => {
        // Convert nginx paths to Next.js matcher patterns
        let path = location.path;
        
        if (location.modifier === '~' || location.modifier === '~*') {
          // Regex locations are complex, use broad matching
          paths.add('/((?!api|_next/static|_next/image|favicon.ico).*)');
        } else if (path === '/') {
          paths.add('/');
        } else {
          // Exact or prefix matches
          if (path.endsWith('/')) {
            paths.add(`${path}:path*`);
          } else {
            paths.add(path);
            paths.add(`${path}/:path*`);
          }
        }
      });
    });

    const matchers = Array.from(paths).map(path => `"${path}"`).join(',\n    ');

    return [
      'export const config = {',
      '  matcher: [',
      `    ${matchers}`,
      '  ]',
      '};'
    ].join('\n');
  }
}
