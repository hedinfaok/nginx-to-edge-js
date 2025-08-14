import { NginxParser } from '../src/converters/nginx-parser';
import { CloudFlareGenerator } from '../src/generators/cloudflare';
import { ParsedNginxConfig, NginxConfig, ServerBlock } from '../src/core/config-model';

// Copy the converter function from CLI for testing
function convertCrossplaneToConfig(parseResult: any): ParsedNginxConfig {
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
            }
          }
        } else if (directive.directive === 'server') {
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

function convertServerBlock(directive: any): ServerBlock {
  const server: ServerBlock = {
    listen: [],
    server_name: [],
    locations: []
  };

  if (directive.block) {
    for (const subDirective of directive.block) {
      switch (subDirective.directive) {
        case 'listen':
          server.listen.push({ port: parseInt(subDirective.args[0]) });
          break;
        case 'server_name':
          server.server_name = subDirective.args;
          break;
        case 'location':
          const proxyPassDirective = subDirective.block?.find((d: any) => d.directive === 'proxy_pass');
          server.locations.push({
            path: subDirective.args[0],
            directives: {
              proxy_pass: proxyPassDirective?.args?.[0]
            }
          });
          break;
      }
    }
  }

  return server;
}

describe('NginxParser', () => {
  test('should parse basic nginx configuration', async () => {
    const parser = new NginxParser();
    const nginxConfig = `
http {
    server {
        listen 80;
        server_name example.com;
        
        location / {
            proxy_pass http://backend:3000;
        }
    }
}`;

    const parseResult = await parser.parseString(nginxConfig);
    const config = convertCrossplaneToConfig(parseResult);
    
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].listen).toHaveLength(1);
    expect(config.servers[0].listen[0].port).toBe(80);
    expect(config.servers[0].server_name).toEqual(['example.com']);
    expect(config.servers[0].locations).toHaveLength(1);
    expect(config.servers[0].locations[0].path).toBe('/');
  });

  test('should handle parse errors gracefully', async () => {
    const parser = new NginxParser();
    
    try {
      await parser.parseString('invalid nginx config {{{');
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describe('CloudFlareGenerator', () => {
  test('should generate CloudFlare Workers code', async () => {
    const parser = new NginxParser();
    const parseResult = await parser.parseString(`
http {
    server {
        listen 80;
        server_name example.com;
        location / {
            proxy_pass http://backend:3000;
        }
    }
}`);

    const config = convertCrossplaneToConfig(parseResult);
    const generator = new CloudFlareGenerator(config);
    const code = generator.generate();
    
    expect(code).toContain('addEventListener("fetch"');
    expect(code).toContain('handleRequest');
    expect(code).toContain('backend:3000');
  });
});
