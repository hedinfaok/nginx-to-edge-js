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
      ''
    ];

    // Generate map functions if they exist
    const mapFunctions = this.generateMapFunctions();
    if (mapFunctions.length > 0) {
      parts.push('// Map functions');
      parts.push(...mapFunctions);
      parts.push('');
    }

    parts.push(
      this.generateMiddlewareFunction(),
      '',
      this.generateConfig()
    );

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
      
      // Handle proxy headers
      const proxyHeaders = this.generateProxyHeaders(location, indent);
      if (proxyHeaders.length > 0) {
        actions.push(`${indent}const modifiedRequest = new Request(backendUrl, {`);
        actions.push(`${indent}  method: request.method,`);
        actions.push(`${indent}  headers: new Headers(request.headers),`);
        actions.push(`${indent}  body: request.body`);
        actions.push(`${indent}});`);
        actions.push(...proxyHeaders);
        actions.push(`${indent}return NextResponse.rewrite(modifiedRequest.url);`);
      } else {
        actions.push(`${indent}return NextResponse.rewrite(backendUrl);`);
      }
      return actions;
    }

    // Handle if directives (conditional logic)
    if (location.directives.if) {
      location.directives.if.forEach(conditionalDirective => {
        const condition = this.convertNginxCondition(conditionalDirective.condition);
        actions.push(`${indent}// Conditional: ${conditionalDirective.condition}`);
        actions.push(`${indent}if (${condition}) {`);
        
        // Generate actions for the conditional block
        const conditionalActions = this.generateConditionalActions(conditionalDirective, indent + '  ');
        actions.push(...conditionalActions);
        
        actions.push(`${indent}}`);
      });
    }

    // Handle static files (Next.js automatically serves from /public)
    if (this.isStaticLocation(location)) {
      const staticActions = this.generateStaticFileActions(location, indent);
      actions.push(...staticActions);
      return actions;
    }

    // Handle variable assignments (set directive)
    if (location.directives.set) {
      actions.push(`${indent}// Variable assignments`);
      Object.entries(location.directives.set).forEach(([variable, value]) => {
        const processedValue = this.processNginxVariables(value);
        const varName = variable.replace('$', '');
        actions.push(`${indent}const ${varName} = ${processedValue};`);
      });
    }

    // Handle custom headers
    if (location.directives.add_header) {
      actions.push(`${indent}const response = NextResponse.next();`);
      Object.entries(location.directives.add_header).forEach(([header, value]) => {
        const processedValue = this.processNginxVariables(value);
        actions.push(`${indent}response.headers.set("${header}", ${processedValue});`);
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

  private generateProxyHeaders(location: LocationBlock, indent: string): string[] {
    const headers: string[] = [];
    
    if (location.directives.proxy_set_header) {
      headers.push(`${indent}// Set proxy headers`);
      Object.entries(location.directives.proxy_set_header).forEach(([header, value]) => {
        const processedValue = this.processNginxVariables(value);
        headers.push(`${indent}modifiedRequest.headers.set("${header}", ${processedValue});`);
      });
    }

    if (location.directives.proxy_hide_header) {
      headers.push(`${indent}// Hide proxy headers`);
      location.directives.proxy_hide_header.forEach(header => {
        headers.push(`${indent}modifiedRequest.headers.delete("${header}");`);
      });
    }

    return headers;
  }

  private processNginxVariables(value: string, processedVars = new Set<string>()): string {
    // Convert nginx variables to JavaScript expressions
    let processedValue = value;
    
    // Handle common nginx variables
    processedValue = processedValue.replace(/\$remote_addr/g, 'request.ip || request.headers.get("x-forwarded-for") || "unknown"');
    processedValue = processedValue.replace(/\$request_uri/g, 'url.pathname + url.search');
    processedValue = processedValue.replace(/\$host/g, 'url.hostname');
    processedValue = processedValue.replace(/\$server_name/g, 'url.hostname');
    processedValue = processedValue.replace(/\$scheme/g, 'url.protocol.replace(":", "")');
    
    // Handle $http_* variables
    processedValue = processedValue.replace(/\$http_([a-zA-Z_-]+)/g, (match, headerName) => {
      const jsHeaderName = headerName.toLowerCase().replace(/_/g, '-');
      return `request.headers.get("${jsHeaderName}") || ""`;
    });
    
    // Handle map variables if they exist
    if (this.config.maps) {
      this.config.maps.forEach(mapDirective => {
        const varName = mapDirective.output_variable.replace('$', '');
        
        // Prevent infinite recursion by tracking processed variables
        if (!processedVars.has(varName)) {
          processedVars.add(varName);
          const functionName = this.getFunctionNameFromVariable(varName);
          
          // Process input variable only if it's different and not already processed
          let inputProcessed = mapDirective.input_variable;
          if (mapDirective.input_variable !== mapDirective.output_variable) {
            inputProcessed = this.processNginxVariables(mapDirective.input_variable, processedVars);
          }
          
          processedValue = processedValue.replace(
            new RegExp(`\\$${varName}`, 'g'),
            `${functionName}(${inputProcessed})`
          );
        }
      });
    }
    
    // If no variables found, treat as literal string
    if (!processedValue.includes('request.') && !processedValue.includes('url.') && !processedValue.includes('(')) {
      return `"${processedValue}"`;
    }
    
    return processedValue;
  }

  private getFunctionNameFromVariable(varName: string): string {
    // Convert variable names to camelCase function names
    return varName.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  private generateMapFunctions(): string[] {
    if (!this.config.maps || this.config.maps.length === 0) {
      return [];
    }

    const functions: string[] = [];

    this.config.maps.forEach(mapDirective => {
      const varName = mapDirective.output_variable.replace('$', '');
      const functionName = this.getFunctionNameFromVariable(varName);
      
      functions.push(`function ${functionName}(input: string): string {`);
      
      mapDirective.mappings.forEach(mapping => {
        if (mapping.is_regex) {
          const regexPattern = mapping.pattern.replace(/^~\*?/, '');
          functions.push(`  if (input.match(/${regexPattern}/)) {`);
          
          if (mapping.capture_groups && mapping.capture_groups.length > 0) {
            functions.push(`    const match = input.match(/${regexPattern}/);`);
            functions.push(`    if (match) {`);
            let replacement = mapping.value;
            mapping.capture_groups.forEach((group, index) => {
              replacement = replacement.replace(group, `\${match[${index + 1}]}`);
            });
            functions.push(`      return \`${replacement}\`;`);
            functions.push(`    }`);
          } else {
            functions.push(`    return "${mapping.value}";`);
          }
          
          functions.push(`  }`);
        } else {
          functions.push(`  if (input === "${mapping.pattern}") return "${mapping.value}";`);
        }
      });
      
      const defaultValue = mapDirective.default_value || '';
      functions.push(`  return "${defaultValue}";`);
      functions.push(`}`);
      functions.push('');
    });

    return functions;
  }

  private generateConditionalActions(conditionalDirective: any, indent: string): string[] {
    const actions: string[] = [];
    const directives = conditionalDirective.directives;
    
    // Handle return directive in if block
    if (directives.return) {
      const returnDir = directives.return;
      
      if (returnDir.code >= 300 && returnDir.code < 400) {
        // Redirect
        const redirectUrl = this.processNginxVariables(returnDir.url || returnDir.text || '/');
        actions.push(`${indent}const redirectUrl = ${redirectUrl};`);
        actions.push(`${indent}return NextResponse.redirect(new URL(redirectUrl, request.url), ${returnDir.code});`);
      } else {
        // Response with status
        const text = returnDir.text || returnDir.url || '';
        actions.push(`${indent}return new NextResponse("${text}", { status: ${returnDir.code} });`);
      }
    }
    
    return actions;
  }

  private generateStaticFileActions(location: LocationBlock, indent: string): string[] {
    const actions: string[] = [];
    const directives = location.directives;
    
    actions.push(`${indent}// Static file serving`);
    
    // Handle try_files directive
    if (directives.try_files) {
      actions.push(`${indent}// try_files: ${directives.try_files.join(' ')}`);
      actions.push(`${indent}const tryFiles = ${JSON.stringify(directives.try_files)};`);
      actions.push(`${indent}for (const tryFile of tryFiles) {`);
      actions.push(`${indent}  if (tryFile === '$uri') {`);
      actions.push(`${indent}    // Try the requested URI`);
      actions.push(`${indent}    return NextResponse.next();`);
      actions.push(`${indent}  } else if (tryFile === '$uri/') {`);
      actions.push(`${indent}    // Try the URI with trailing slash`);
      actions.push(`${indent}    if (!url.pathname.endsWith('/')) {`);
      actions.push(`${indent}      url.pathname += '/';`);
      actions.push(`${indent}      return NextResponse.rewrite(url);`);
      actions.push(`${indent}    }`);
      actions.push(`${indent}  } else if (!tryFile.startsWith('$')) {`);
      actions.push(`${indent}    // Try the fallback file`);
      actions.push(`${indent}    url.pathname = tryFile;`);
      actions.push(`${indent}    return NextResponse.rewrite(url);`);
      actions.push(`${indent}  }`);
      actions.push(`${indent}}`);
    }
    
    // Handle alias directive
    if (directives.alias) {
      actions.push(`${indent}// alias: ${directives.alias}`);
      actions.push(`${indent}// Note: In Next.js, use public directory or custom rewrites`);
      actions.push(`${indent}const aliasPath = "${directives.alias}" + url.pathname.substring("${location.path}".length);`);
      actions.push(`${indent}url.pathname = aliasPath;`);
      actions.push(`${indent}return NextResponse.rewrite(url);`);
    }
    
    // Handle root directive
    if (directives.root) {
      actions.push(`${indent}// root: ${directives.root}`);
      actions.push(`${indent}// Note: In Next.js, static files should be in /public directory`);
    }
    
    // Handle index files
    if (directives.index) {
      actions.push(`${indent}// index files: ${directives.index}`);
      actions.push(`${indent}if (url.pathname.endsWith('/')) {`);
      actions.push(`${indent}  const indexFiles = ${JSON.stringify(directives.index.split(' '))};`);
      actions.push(`${indent}  url.pathname += indexFiles[0]; // Use first index file`);
      actions.push(`${indent}  return NextResponse.rewrite(url);`);
      actions.push(`${indent}}`);
    }
    
    // Default static file handling
    actions.push(`${indent}// Static files served from /public directory`);
    actions.push(`${indent}return NextResponse.next();`);
    
    return actions;
  }

  private convertNginxCondition(condition: string): string {
    let jsCondition = condition;
    
    // Handle nginx variable comparisons
    jsCondition = jsCondition.replace(/\$([a-zA-Z_]+)\s*([!=]=?)\s*"([^"]*)"/, (match, varName, operator, value) => {
      const jsVar = this.processNginxVariables(`$${varName}`);
      return `${jsVar} ${operator} "${value}"`;
    });
    
    // Handle empty string comparison
    if (jsCondition.endsWith(' !== ') || jsCondition.endsWith(' === ')) {
      jsCondition += '""';
    }
    
    return jsCondition;
  }
}
