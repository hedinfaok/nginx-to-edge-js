import { BaseGenerator } from './base-generator.js';
import { LocationBlock } from '../core/config-model.js';

export class QuickJSGenerator extends BaseGenerator {
  /**
   * Generate QuickJS-compatible edge code
   */
  generate(): string {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const parts: string[] = [
      this.generateHeader(),
      this.generateQuickJSCode()
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
      // Check for unsupported features in QuickJS environments
      if (server.ssl?.certificate) {
        warnings.push(`Server ${index}: SSL certificates are typically managed by the edge platform, not in QuickJS functions`);
      }

      server.locations.forEach((location, locIndex) => {
        if (location.directives.root || location.directives.alias) {
          warnings.push(`Server ${index}, Location ${locIndex}: Static file serving requires platform-specific configuration`);
        }

        if (location.directives.fastcgi_pass || location.directives.uwsgi_pass) {
          errors.push(`Server ${index}, Location ${locIndex}: FastCGI/uWSGI not supported in QuickJS environments`);
        }

        // Check for Node.js-specific features
        if (location.directives.proxy_pass && location.directives.proxy_pass.includes('fs.')) {
          errors.push(`Server ${index}, Location ${locIndex}: Node.js filesystem APIs not available in QuickJS`);
        }

        // Memory constraints warning
        if (location.directives.proxy_pass) {
          warnings.push(`Server ${index}, Location ${locIndex}: QuickJS has memory constraints - optimize for minimal allocations`);
        }
      });
    });

    return { warnings, errors };
  }

  private generateQuickJSCode(): string {
    const code: string[] = [
      "// QuickJS-compatible edge function",
      "// Optimized for minimal memory usage and fast startup",
      "",
      "function handleRequest(request) {",
      "  const url = new URL(request.url);",
      "  const hostname = url.hostname;",
      "  const pathname = url.pathname;",
      "",
      "  // Request context for QuickJS environments",
      "  const context = {",
      "    url: url,",
      "    hostname: hostname,",
      "    pathname: pathname,",
      "    method: request.method || 'GET',",
      "    headers: request.headers || {}",
      "  };",
      "",
      ...this.generateServerHandlers(),
      "",
      "  // Default response",
      "  return createResponse(404, 'Not Found');",
      "}",
      "",
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
        // Convert wildcard to regex - QuickJS supports basic regex
        const regex = pattern.replace(/\*/g, '.*').replace(/\./g, '\\.');
        return `hostname.match(/^${regex}$/)`;
      } else {
        return `hostname === "${pattern}"`;
      }
    });

    return conditions.join(' || ');
  }

  private generateLocationHandlers(locations: LocationBlock[], indent: string): string[] {
    const handlers: string[] = [];

    locations.forEach((location, _index) => {
      const pathPattern = this.convertNginxPathToJs(location.path);
      
      handlers.push(`${indent}// Location: ${location.path}`);
      handlers.push(`${indent}if (${pathPattern}) {`);
      
      // Handle different directive types
      if (location.directives.return) {
        handlers.push(...this.generateReturnHandler(location.directives.return, indent + '  '));
      } else if (location.directives.proxy_pass) {
        handlers.push(...this.generateProxyHandler(location.directives.proxy_pass, location, indent + '  '));
      } else if (location.directives.rewrite) {
        handlers.push(...this.generateRewriteHandler(location.directives.rewrite, indent + '  '));
      }

      handlers.push(`${indent}}`);
    });

    return handlers;
  }

  private generateReturnHandler(returnDirective: any, indent: string): string[] {
    const code = parseInt(returnDirective.code);
    const url = returnDirective.url;

    if (code >= 300 && code < 400 && url) {
      // Redirect - QuickJS compatible
      return [
        `${indent}// Redirect ${code} to ${url}`,
        `${indent}return createRedirect(${code}, "${url}");`
      ];
    } else {
      // Direct response
      const body = url || this.getStatusDescription(code);
      return [
        `${indent}// Return ${code}`,
        `${indent}return createResponse(${code}, "${body}");`
      ];
    }
  }

  private generateProxyHandler(proxyPass: string, location: LocationBlock, indent: string): string[] {
    const handlers: string[] = [];
    
    handlers.push(`${indent}// Proxy to: ${proxyPass}`);
    
    try {
      const upstreamUrl = new URL(proxyPass.replace(/\$.*/, ''));
      
      // QuickJS-optimized proxy handling
      handlers.push(`${indent}// Upstream configuration`);
      handlers.push(`${indent}const upstream = {`);
      handlers.push(`${indent}  host: '${upstreamUrl.hostname}',`);
      handlers.push(`${indent}  port: ${upstreamUrl.port || (upstreamUrl.protocol === 'https:' ? 443 : 80)},`);
      handlers.push(`${indent}  protocol: '${upstreamUrl.protocol}',`);
      handlers.push(`${indent}  path: '${upstreamUrl.pathname}'`);
      handlers.push(`${indent}};`);
      
      // Generate proxy request with minimal memory allocation
      handlers.push(`${indent}`);
      handlers.push(`${indent}// Build proxy request (QuickJS optimized)`);
      handlers.push(`${indent}const proxyUrl = buildProxyUrl(upstream, context.pathname);`);
      handlers.push(`${indent}const proxyHeaders = Object.assign({}, context.headers);`);

      // Handle proxy headers efficiently
      if (location.directives.proxy_set_header) {
        handlers.push(`${indent}`);
        handlers.push(`${indent}// Set proxy headers`);
        Object.entries(location.directives.proxy_set_header).forEach(([header, value]) => {
          let headerValue = value as string;
          
          // Convert nginx variables to QuickJS equivalents  
          headerValue = headerValue
            .replace(/\$host/g, 'context.hostname')
            .replace(/\$remote_addr/g, 'context.headers["x-forwarded-for"] || "unknown"')
            .replace(/\$proxy_add_x_forwarded_for/g, 'context.headers["x-forwarded-for"] || "unknown"');

          if (headerValue.includes('context.')) {
            handlers.push(`${indent}proxyHeaders["${header.toLowerCase()}"] = ${headerValue};`);
          } else {
            handlers.push(`${indent}proxyHeaders["${header.toLowerCase()}"] = "${headerValue}";`);
          }
        });
      }

      handlers.push(`${indent}`);
      handlers.push(`${indent}// Execute proxy request (platform-specific implementation needed)`);
      handlers.push(`${indent}return proxyRequest(proxyUrl, context.method, proxyHeaders, request.body);`);
      
    } catch (error) {
      // Fallback for invalid URLs
      handlers.push(`${indent}// Invalid proxy URL: ${proxyPass}`);
      handlers.push(`${indent}return createResponse(502, "Bad Gateway - Invalid upstream URL");`);
    }

    return handlers;
  }

  private generateRewriteHandler(rewriteRule: any, indent: string): string[] {
    // QuickJS-optimized rewrite handling
    if (typeof rewriteRule === 'string') {
      return [
        `${indent}// Rewrite rule: ${rewriteRule}`,
        `${indent}// Note: Complex rewrites require regex support - check QuickJS compatibility`,
        `${indent}const rewritten = applyRewrite(context.pathname, "${rewriteRule}");`,
        `${indent}if (rewritten !== context.pathname) {`,
        `${indent}  context.pathname = rewritten;`,
        `${indent}  // Continue processing with rewritten path`,
        `${indent}}`
      ];
    }
    
    return [
      `${indent}// Complex rewrite rule - implement based on platform needs`,
      `${indent}// ${JSON.stringify(rewriteRule)}`
    ];
  }

  private generateHelperFunctions(): string[] {
    return [
      "// QuickJS-optimized helper functions",
      "// Minimal memory allocation, fast execution",
      "",
      "function createResponse(status, body, headers) {",
      "  headers = headers || {};",
      "  return {",
      "    status: status,",
      "    statusText: getStatusText(status),",
      "    headers: headers,",
      "    body: body",
      "  };",
      "}",
      "",
      "function createRedirect(status, location) {",
      "  return {",
      "    status: status,",
      "    statusText: getStatusText(status),",
      "    headers: {",
      "      'location': location",
      "    },",
      "    body: ''",
      "  };",
      "}",
      "",
      "function getStatusText(status) {",
      "  // Minimal status text mapping for QuickJS",
      "  const statusTexts = {",
      "    200: 'OK',",
      "    301: 'Moved Permanently',",
      "    302: 'Found',",
      "    400: 'Bad Request',",
      "    401: 'Unauthorized',",
      "    403: 'Forbidden',",
      "    404: 'Not Found',",
      "    500: 'Internal Server Error',",
      "    502: 'Bad Gateway',",
      "    503: 'Service Unavailable'",
      "  };",
      "  return statusTexts[status] || 'Unknown';",
      "}",
      "",
      "function matchesPath(pathname, pattern) {",
      "  if (pattern === '/') return true;",
      "  if (pattern.endsWith('/')) {",
      "    return pathname.startsWith(pattern);",
      "  }",
      "  return pathname === pattern || pathname.startsWith(pattern + '/');",
      "}",
      "",
      "function buildProxyUrl(upstream, pathname) {",
      "  // Efficient URL building for QuickJS",
      "  let path = upstream.path;",
      "  if (path === '/' || path === '') {",
      "    path = pathname;",
      "  } else {",
      "    path = path + pathname;",
      "  }",
      "  ",
      "  const port = (upstream.port === 80 && upstream.protocol === 'http:') ||",
      "               (upstream.port === 443 && upstream.protocol === 'https:') ? '' : ':' + upstream.port;",
      "  ",
      "  return upstream.protocol + '//' + upstream.host + port + path;",
      "}",
      "",
      "function applyRewrite(pathname, rule) {",
      "  // Basic rewrite implementation - extend based on needs",
      "  // QuickJS has limited regex support, so keep it simple",
      "  try {",
      "    // Handle simple prefix replacements",
      "    if (rule.includes('^')) {",
      "      // This would need platform-specific regex implementation",
      "      return pathname;",
      "    }",
      "    return pathname;",
      "  } catch (e) {",
      "    return pathname;",
      "  }",
      "}",
      "",
      "// Platform-specific proxy implementation placeholder",
      "// Each QuickJS platform (Fastly, Lagon, etc.) would implement this differently",
      "function proxyRequest(url, method, headers, body) {",
      "  // This function should be implemented by the target platform:",
      "  // - Fastly Compute@Edge: use fastly.fetch()",
      "  // - Lagon: use platform fetch API",
      "  // - Supabase Edge Functions: use Deno fetch()",
      "  // - WasmEdge: use WASI HTTP client",
      "  ",
      "  throw new Error('proxyRequest must be implemented by target platform');",
      "}",
      "",
      "// Export the main handler for platform integration",
      "// Platform-specific wrapper would call this function",
      "if (typeof module !== 'undefined' && module.exports) {",
      "  module.exports = { handleRequest };",
      "} else if (typeof globalThis !== 'undefined') {",
      "  globalThis.handleRequest = handleRequest;",
      "}"
    ];
  }

  private convertNginxPathToJs(path: string): string {
    if (path === '/') {
      return 'context.pathname === "/" || context.pathname.startsWith("/")';
    }
    
    // Handle exact matches and prefix matches
    if (path.includes('~')) {
      // Regex location - QuickJS regex support may be limited
      const regex = path.replace('~*', '').replace('~', '').trim();
      return `context.pathname.match(/${regex}/)`;
    } else if (path.startsWith('=')) {
      // Exact match
      const exactPath = path.substring(1);
      return `context.pathname === "${exactPath}"`;
    } else {
      // Prefix match
      return `matchesPath(context.pathname, "${path}")`;
    }
  }

  private getStatusDescription(code: number): string {
    const descriptions: { [key: number]: string } = {
      200: 'OK',
      201: 'Created', 
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    };
    return descriptions[code] || 'Unknown';
  }
}
