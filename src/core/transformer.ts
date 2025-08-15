/**
 * Transformer module for converting crossplane parse results
 * to the unified configuration model.
 */

import { NginxConfig, ServerBlock, LocationBlock, ParsedNginxConfig, MapDirective, MapRule } from './config-model.js';

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
            } else if (httpDirective.directive === 'map') {
              const mapDirective = convertMapDirective(httpDirective);
              if (!config.maps) {
                config.maps = [];
              }
              config.maps.push(mapDirective);
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
        case 'proxy_set_header':
          if (!location.directives.proxy_set_header) {
            location.directives.proxy_set_header = {};
          }
          location.directives.proxy_set_header[locationDirective.args[0]] = locationDirective.args[1];
          break;
        case 'proxy_hide_header':
          if (!location.directives.proxy_hide_header) {
            location.directives.proxy_hide_header = [];
          }
          location.directives.proxy_hide_header.push(locationDirective.args[0]);
          break;
        case 'set':
          if (!location.directives.set) {
            location.directives.set = {};
          }
          // nginx set directive: set $variable value;
          // args[0] is the variable name (with $), args[1] is the value
          const varName = locationDirective.args[0].replace(/^\$/, ''); // Remove leading $
          location.directives.set[varName] = locationDirective.args[1];
          break;
      }
    }
  }

  return location;
}

/**
 * Convert a map directive from crossplane to MapDirective
 */
export function convertMapDirective(directive: any): MapDirective {
  // map directive format: map $input_var $output_var { ... }
  const inputVariable = directive.args[0];
  const outputVariable = directive.args[1];
  
  const mapDirective: MapDirective = {
    input_variable: inputVariable,
    output_variable: outputVariable,
    mappings: []
  };

  if (directive.block) {
    for (const mapRule of directive.block) {
      const pattern = mapRule.directive;
      const value = mapRule.args[0];
      
      if (pattern === 'default') {
        mapDirective.default_value = value;
      } else {
        const isRegex = pattern.startsWith('~');
        const cleanPattern = isRegex ? pattern.substring(1) : pattern;
        
        // Extract capture groups from value (e.g., $1, $2)
        const captureGroups = value.match(/\$\d+/g) || [];
        
        mapDirective.mappings.push({
          pattern: cleanPattern,
          value: value,
          is_regex: isRegex,
          capture_groups: captureGroups
        });
      }
    }
  }

  return mapDirective;
}
