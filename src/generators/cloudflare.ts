import { BaseGenerator } from './base-generator.js';
import { LocationBlock } from '../core/config-model.js';

export class CloudFlareGenerator extends BaseGenerator {
  /**
   * Generate CloudFlare Workers code
   */
  generate(): string {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const parts: string[] = [
      this.generateHeader(),
      this.generateWorkerCode()
    ];

    return parts.join('\n');
  }

  getFileExtension(): string {
    return '.js';
  }

  protected validatePlatformSpecific(): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    this.config.servers.forEach((server, index) => {
      // Check for unsupported features
      if (server.ssl?.certificate) {
        warnings.push(`Server ${index}: SSL certificates are managed by CloudFlare, not in Workers`);
      }

      server.locations.forEach((location, locIndex) => {
        if (location.directives.root || location.directives.alias) {
          warnings.push(`Server ${index}, Location ${locIndex}: Static file serving requires CloudFlare Pages or R2 integration`);
        }

        if (location.directives.expires) {
          warnings.push(`Server ${index}, Location ${locIndex}: Cache-Control headers should be set in CF dashboard or using CF-specific headers`);
        }
      });
    });

    return { warnings, errors };
  }

  private generateWorkerCode(): string {
    const code: string[] = [
      'addEventListener("fetch", event => {',
      '  event.respondWith(handleRequest(event.request));',
      '});',
      '',
      'async function handleRequest(request) {',
      '  const url = new URL(request.url);',
      '  const hostname = url.hostname;',
      '',
      ...this.generateServerHandlers(),
      '',
      '  // Default response',
      '  return new Response("Not Found", { status: 404 });',
      '}',
      '',
      ...this.generateHelperFunctions()
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

    // Sort locations by specificity (exact matches first, then by length)
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

    // Handle redirects first
    if (location.directives.return) {
      const returnDir = location.directives.return;
      if (returnDir.code >= 300 && returnDir.code < 400) {
        const redirectUrl = returnDir.url || returnDir.text || '/';
        actions.push(`${indent}const redirectUrl = "${redirectUrl}";`);
        actions.push(`${indent}return Response.redirect(redirectUrl, ${returnDir.code});`);
        return actions;
      }
    }

    // Handle rewrites
    if (location.directives.rewrite) {
      location.directives.rewrite.forEach(rule => {
        if (rule.flags?.includes('redirect') || rule.flags?.includes('permanent')) {
          const code = rule.flags.includes('permanent') ? 301 : 302;
          actions.push(`${indent}if (url.pathname.match(/${rule.regex}/)) {`);
          actions.push(`${indent}  const newUrl = url.pathname.replace(/${rule.regex}/, "${rule.replacement}");`);
          actions.push(`${indent}  return Response.redirect(newUrl, ${code});`);
          actions.push(`${indent}}`);
        }
      });
    }

    // Handle proxy_pass
    if (location.directives.proxy_pass) {
      const backend = location.directives.proxy_pass;
      actions.push(`${indent}// Proxy to: ${backend}`);
      actions.push(`${indent}return await proxyRequest(request, "${backend}", url);`);
      return actions;
    }

    // Handle static files
    if (this.isStaticLocation(location)) {
      actions.push(`${indent}// Static file serving - requires CloudFlare Pages or R2`);
      actions.push(`${indent}return new Response("Static file serving not implemented", { status: 501 });`);
      return actions;
    }

    // Default action
    actions.push(`${indent}return new Response("Location matched but no action defined", { status: 500 });`);
    return actions;
  }

  private generateHelperFunctions(): string[] {
    return [
      '// Helper function to proxy requests',
      'async function proxyRequest(request, backend, url) {',
      '  const backendUrl = new URL(backend);',
      '  const proxyUrl = new URL(url.pathname + url.search, backendUrl);',
      '',
      '  // Copy headers',
      '  const headers = new Headers(request.headers);',
      '  headers.set("Host", backendUrl.hostname);',
      '  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");',
      '  headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");',
      '',
      '  const response = await fetch(proxyUrl, {',
      '    method: request.method,',
      '    headers: headers,',
      '    body: request.body',
      '  });',
      '',
      '  // Copy response headers',
      '  const responseHeaders = new Headers(response.headers);',
      '  ',
      '  return new Response(response.body, {',
      '    status: response.status,',
      '    statusText: response.statusText,',
      '    headers: responseHeaders',
      '  });',
      '}'
    ];
  }
}
