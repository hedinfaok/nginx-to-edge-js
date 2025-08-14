/**
 * Transformer module for converting crossplane parse results
 * to the unified configuration model.
 */

import { ParsedNginxConfig, NginxConfig, ServerBlock, LocationBlock } from './config-model.js';

/**
 * Convert crossplane parse result to ParsedNginxConfig
 */
export function convertCrossplaneToConfig(parseResult: any): ParsedNginxConfig {
  const config: NginxConfig = {
    servers: [],
    upstreams: [],
    global: {}
  };

  if (parseResult.config && parseResult.config.length > 0) {
    const nginxConfig = parseResult.config[0];
    if (nginxConfig.parsed) {
      for (const directive of nginxConfig.parsed) {
        if (directive.directive === 'http' && directive.block) {
          for (const httpDirective of directive.block) {
            if (httpDirective.directive === 'server') {
              const server = convertServerBlock(httpDirective);
              config.servers.push(server);
            } else if (httpDirective.directive === 'upstream') {
              // Handle upstream blocks later if needed
            }
          }
        } else if (directive.directive === 'server') {
          // Server block at top level
          const server = convertServerBlock(directive);
          config.servers.push(server);
        }
      }
    }
  }

  return {
    ...config,
    metadata: {
      parsed_at: new Date(),
      parser_version: 'crossplane-1.0.0',
      warnings: []
    }
  };
}

/**
 * Convert a server block directive from crossplane to ServerBlock
 */
export function convertServerBlock(directive: any): ServerBlock {
  const server: ServerBlock = {
    listen: [],
    locations: []
  };

  if (directive.block) {
    for (const serverDirective of directive.block) {
      switch (serverDirective.directive) {
        case 'listen': {
          const port = parseInt(serverDirective.args[0] || '80', 10);
          server.listen.push({ port });
          break;
        }
        case 'server_name':
          server.server_name = serverDirective.args;
          break;
        case 'location': {
          const location = convertLocationBlock(serverDirective);
          server.locations.push(location);
          break;
        }
      }
    }
  }

  return server;
}

/**
 * Convert a location block directive from crossplane to LocationBlock
 */
export function convertLocationBlock(directive: any): LocationBlock {
  const path = directive.args[0] || '/';
  const location: LocationBlock = {
    path,
    directives: {}
  };

  if (directive.block) {
    for (const locationDirective of directive.block) {
      switch (locationDirective.directive) {
        case 'proxy_pass':
          location.directives.proxy_pass = locationDirective.args[0];
          break;
        case 'return':
          location.directives.return = {
            code: parseInt(locationDirective.args[0], 10),
            url: locationDirective.args[1]
          };
          break;
        case 'root':
          location.directives.root = locationDirective.args[0];
          break;
        case 'expires':
          location.directives.expires = locationDirective.args[0];
          break;
        case 'add_header':
          if (!location.directives.add_header) {
            location.directives.add_header = {};
          }
          location.directives.add_header[locationDirective.args[0]] = locationDirective.args[1];
          break;
      }
    }
  }

  return location;
}
