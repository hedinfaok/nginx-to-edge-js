import { BaseGenerator } from './base-generator.js';
import { LocationBlock } from '../core/config-model.js';

export class LambdaEdgeGenerator extends BaseGenerator {
  /**
   * Generate AWS Lambda@Edge code
   */
  generate(): string {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const parts: string[] = [
      this.generateHeader(),
      this.generateLambdaCode()
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
        warnings.push(`Server ${index}: SSL certificates are managed by CloudFront, not in Lambda@Edge`);
      }

      server.locations.forEach((location, locIndex) => {
        if (location.directives.root || location.directives.alias) {
          warnings.push(`Server ${index}, Location ${locIndex}: Static file serving requires S3 origin configuration`);
        }

        if (location.directives.fastcgi_pass || location.directives.uwsgi_pass) {
          errors.push(`Server ${index}, Location ${locIndex}: FastCGI/uWSGI not supported in Lambda@Edge`);
        }

        // Check response size limitations
        if (location.directives.proxy_pass) {
          warnings.push(`Server ${index}, Location ${locIndex}: Response size limited to 1MB in Lambda@Edge`);
        }
      });
    });

    return { warnings, errors };
  }

  private generateLambdaCode(): string {
    const code: string[] = [
      "exports.handler = async (event) => {",
      "  const request = event.Records[0].cf.request;",
      "  const response = event.Records[0].cf.response;",
      "  const headers = request.headers;",
      "  const uri = request.uri;",
      "  const hostname = headers.host ? headers.host[0].value : '';",
      "",
      "  // Process based on event type",
      "  switch (event.Records[0].cf.eventType) {",
      "    case 'viewer-request':",
      "      return await handleViewerRequest(request);",
      "    case 'origin-request':",
      "      return await handleOriginRequest(request);", 
      "    case 'origin-response':",
      "      return await handleOriginResponse(response);",
      "    case 'viewer-response':",
      "      return await handleViewerResponse(response);",
      "    default:",
      "      return request;",
      "  }",
      "};",
      "",
      "async function handleViewerRequest(request) {",
      "  const uri = request.uri;",
      "  const hostname = request.headers.host ? request.headers.host[0].value : '';",
      "",
      ...this.generateServerHandlers(),
      "",
      "  return request;",
      "}",
      "",
      "async function handleOriginRequest(request) {",
      "  // Modify request to origin",
      ...this.generateOriginRequestHandlers(),
      "  return request;",
      "}",
      "",
      "async function handleOriginResponse(response) {",
      "  // Modify response from origin",
      ...this.generateOriginResponseHandlers(),
      "  return response;",
      "}",
      "",
      "async function handleViewerResponse(response) {",
      "  // Modify response to viewer",
      ...this.generateViewerResponseHandlers(),
      "  return response;",
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
      // Redirect
      return [
        `${indent}// Redirect ${code} to ${url}`,
        `${indent}const redirectUrl = "${url}";`,
        `${indent}return {`,
        `${indent}  status: '${code}',`,
        `${indent}  statusDescription: '${this.getStatusDescription(code)}',`,
        `${indent}  headers: {`,
        `${indent}    location: [{ key: 'Location', value: redirectUrl }]`,
        `${indent}  }`,
        `${indent}};`
      ];
    } else {
      // Direct response
      return [
        `${indent}// Return ${code}`,
        `${indent}return {`,
        `${indent}  status: '${code}',`,
        `${indent}  statusDescription: '${this.getStatusDescription(code)}',`,
        `${indent}  body: '${url || this.getStatusDescription(code)}'`,
        `${indent}};`
      ];
    }
  }

  private generateProxyHandler(proxyPass: string, location: LocationBlock, indent: string): string[] {
    const handlers: string[] = [];
    
    handlers.push(`${indent}// Proxy to: ${proxyPass}`);
    handlers.push(`${indent}// Modify origin request`);
    
    // Set upstream host
    const upstreamUrl = new URL(proxyPass.replace(/\$.*/, ''));
    handlers.push(`${indent}request.origin = {`);
    handlers.push(`${indent}  custom: {`);
    handlers.push(`${indent}    domainName: '${upstreamUrl.hostname}',`);
    handlers.push(`${indent}    port: ${upstreamUrl.port || (upstreamUrl.protocol === 'https:' ? 443 : 80)},`);
    handlers.push(`${indent}    protocol: '${upstreamUrl.protocol.replace(':', '')}',`);
    handlers.push(`${indent}    path: '${upstreamUrl.pathname}'`);
    handlers.push(`${indent}  }`);
    handlers.push(`${indent}};`);

    // Handle proxy headers
    if (location.directives.proxy_set_header) {
      handlers.push(`${indent}// Set proxy headers`);
      Object.entries(location.directives.proxy_set_header).forEach(([header, value]) => {
        const headerName = header.toLowerCase();
        let headerValue = value as string;
        
        // Convert nginx variables to Lambda@Edge equivalents
        headerValue = headerValue
          .replace(/\$host/g, 'request.headers.host[0].value')
          .replace(/\$remote_addr/g, 'request.headers["cloudfront-viewer-address"][0].value.split(":")[0]')
          .replace(/\$proxy_add_x_forwarded_for/g, 'request.headers["x-forwarded-for"] ? request.headers["x-forwarded-for"][0].value : request.headers["cloudfront-viewer-address"][0].value.split(":")[0]');

        handlers.push(`${indent}request.headers['${headerName}'] = [{ key: '${header}', value: ${this.wrapInQuotesIfNeeded(headerValue)} }];`);
      });
    }

    return handlers;
  }

  private generateRewriteHandler(rewriteRule: any, indent: string): string[] {
    // Basic rewrite support - more complex than CF Workers due to Lambda@Edge structure
    return [
      `${indent}// Rewrite rule: ${rewriteRule}`,
      `${indent}// Note: Complex rewrites should be handled in viewer-request function`
    ];
  }

  private generateOriginRequestHandlers(): string[] {
    return [
      "  // Origin request modifications",
      "  // Add any custom headers or path modifications here",
      ""
    ];
  }

  private generateOriginResponseHandlers(): string[] {
    const handlers: string[] = ["  // Origin response modifications"];
    
    // Generate response header handlers
    this.config.servers.forEach(server => {
      server.locations.forEach(location => {
        if (location.directives.add_header) {
          handlers.push("  // Add custom headers");
          Object.entries(location.directives.add_header).forEach(([header, value]) => {
            handlers.push(`  response.headers['${header.toLowerCase()}'] = [{ key: '${header}', value: '${value}' }];`);
          });
        }
      });
    });
    
    handlers.push("");
    return handlers;
  }

  private generateViewerResponseHandlers(): string[] {
    return [
      "  // Viewer response modifications",
      "  // Final response modifications before sending to client",
      ""
    ];
  }

  private generateHelperFunctions(): string[] {
    return [
      "// Helper functions",
      "",
      "function matchesPath(uri, pattern) {",
      "  if (pattern === '/') return true;",
      "  if (pattern.endsWith('/')) {",
      "    return uri.startsWith(pattern);",
      "  }",
      "  return uri === pattern || uri.startsWith(pattern + '/');",
      "}",
      "",
      "function addHeader(headers, name, value) {",
      "  const key = name.toLowerCase();",
      "  if (!headers[key]) {",
      "    headers[key] = [];",
      "  }",
      "  headers[key].push({ key: name, value: value });",
      "}",
      "",
      "function setHeader(headers, name, value) {",
      "  const key = name.toLowerCase();",
      "  headers[key] = [{ key: name, value: value }];",
      "}"
    ];
  }

  private convertNginxPathToJs(path: string): string {
    if (path === '/') {
      return 'uri === "/" || uri.startsWith("/")';
    }
    
    // Handle exact matches and prefix matches
    if (path.includes('~')) {
      // Regex location
      const regex = path.replace('~*', '').replace('~', '').trim();
      return `uri.match(/${regex}/)`;
    } else if (path.startsWith('=')) {
      // Exact match
      const exactPath = path.substring(1);
      return `uri === "${exactPath}"`;
    } else {
      // Prefix match
      return `matchesPath(uri, "${path}")`;
    }
  }

  private wrapInQuotesIfNeeded(value: string): string {
    if (value.includes('request.headers') || value.includes('[0].value')) {
      return value; // It's already a reference, don't quote
    }
    return `"${value}"`;
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
