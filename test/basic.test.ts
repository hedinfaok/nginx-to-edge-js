import { NginxParser } from '../src/converters/nginx-parser';
import { CloudFlareGenerator } from '../src/generators/cloudflare';
import { convertCrossplaneToConfig } from '../src/core/transformer';

describe('NginxParser', () => {
  let parser: NginxParser;

  beforeEach(() => {
    parser = new NginxParser();
  });

  test('should parse basic nginx configuration with http block', async () => {
    const nginxConfig = `
http {
    server {
        listen 80;
        server_name example.com;
        
        location / {
            proxy_pass http://backend:3000;
        }
        
        location /api {
            proxy_pass http://api-backend:8080;
        }
    }
}`;

    const parseResult = await parser.parseString(nginxConfig);
    const config = convertCrossplaneToConfig(parseResult);
    
    expect(config.servers).toHaveLength(1);
    
    const server = config.servers[0];
    expect(server.listen).toHaveLength(1);
    expect(server.listen[0].port).toBe(80);
    expect(server.server_name).toEqual(['example.com']);
    expect(server.locations).toHaveLength(2);
    
    // Test location details
    expect(server.locations[0].path).toBe('/');
    expect(server.locations[0].directives.proxy_pass).toBe('http://backend:3000');
    
    expect(server.locations[1].path).toBe('/api');
    expect(server.locations[1].directives.proxy_pass).toBe('http://api-backend:8080');
  });

  test('should parse server block at top level', async () => {
    const nginxConfig = `
http {
    server {
        listen 443 ssl;
        server_name secure.example.com;
        
        location / {
            return 301 https://example.com$request_uri;
        }
    }
}`;

    const parseResult = await parser.parseString(nginxConfig);
    const config = convertCrossplaneToConfig(parseResult);
    
    expect(config.servers).toHaveLength(1);
    
    const server = config.servers[0];
    expect(server.listen[0].port).toBe(443);
    expect(server.server_name).toEqual(['secure.example.com']);
    expect(server.locations).toHaveLength(1);
    expect(server.locations[0].directives.return).toEqual({
      code: 301,
      url: 'https://example.com$request_uri'
    });
  });

  test('should handle multiple servers', async () => {
    const nginxConfig = `
http {
    server {
        listen 80;
        server_name site1.com;
        location / {
            root /var/www/site1;
        }
    }
    
    server {
        listen 80;
        server_name site2.com;
        location / {
            root /var/www/site2;
        }
    }
}`;

    const parseResult = await parser.parseString(nginxConfig);
    const config = convertCrossplaneToConfig(parseResult);
    
    expect(config.servers).toHaveLength(2);
    expect(config.servers[0].server_name).toEqual(['site1.com']);
    expect(config.servers[1].server_name).toEqual(['site2.com']);
    expect(config.servers[0].locations[0].directives.root).toBe('/var/www/site1');
    expect(config.servers[1].locations[0].directives.root).toBe('/var/www/site2');
  });

  test('should handle location with add_header directives', async () => {
    const nginxConfig = `
http {
    server {
        listen 80;
        location /static {
            root /var/www;
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header X-Custom-Header "test-value";
        }
    }
}`;

    const parseResult = await parser.parseString(nginxConfig);
    const config = convertCrossplaneToConfig(parseResult);
    
    const location = config.servers[0].locations[0];
    expect(location.path).toBe('/static');
    expect(location.directives.root).toBe('/var/www');
    expect(location.directives.expires).toBe('1y');
    expect(location.directives.add_header).toEqual({
      'Cache-Control': 'public, immutable',
      'X-Custom-Header': 'test-value'
    });
  });

  test('should handle parse errors gracefully', async () => {
    const parser = new NginxParser();
    
    await expect(parser.parseString('invalid nginx config {{{')).rejects.toThrow();
  });

  test('should handle empty configuration', async () => {
    const parser = new NginxParser();
    const parseResult = await parser.parseString('');
    const config = convertCrossplaneToConfig(parseResult);
    
    expect(config.servers).toHaveLength(0);
    expect(config.metadata).toBeDefined();
    expect(config.metadata.parser_version).toBe('crossplane-1.0.0');
  });
});

describe('CloudFlareGenerator', () => {
  test('should generate CloudFlare Workers code from parsed config', async () => {
    const parser = new NginxParser();
    const parseResult = await parser.parseString(`
http {
    server {
        listen 80;
        server_name example.com;
        location / {
            proxy_pass http://backend:3000;
        }
        location /api {
            proxy_pass http://api-backend:8080;
        }
    }
}`);

    const config = convertCrossplaneToConfig(parseResult);
    const generator = new CloudFlareGenerator(config);
    const code = generator.generate();
    
    expect(code).toContain('addEventListener("fetch"');
    expect(code).toContain('handleRequest');
    expect(code).toContain('backend:3000');
    expect(code).toContain('api-backend:8080');
    expect(code).toContain('example.com');
  });

  test('should handle redirects in generated code', async () => {
    const parser = new NginxParser();
    const parseResult = await parser.parseString(`
http {
    server {
        listen 80;
        server_name old-site.com;
        location / {
            return 301 https://new-site.com$request_uri;
        }
    }
}`);

    const config = convertCrossplaneToConfig(parseResult);
    const generator = new CloudFlareGenerator(config);
    const code = generator.generate();
    
    expect(code).toContain('301');
    expect(code).toContain('new-site.com');
    expect(code).toContain('old-site.com');
  });
});
