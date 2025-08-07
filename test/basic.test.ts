import { NginxParser } from '../src/parser/nginx-parser';
import { CloudFlareGenerator } from '../src/generators/cloudflare';

describe('NginxParser', () => {
  test('should parse basic nginx configuration', async () => {
    const parser = new NginxParser();
    const nginxConfig = `
server {
    listen 80;
    server_name example.com;
    
    location / {
        proxy_pass http://backend:3000;
    }
}`;

    const config = await parser.parseString(nginxConfig);
    
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].listen).toHaveLength(1);
    expect(config.servers[0].listen[0].port).toBe(80);
    expect(config.servers[0].server_name).toEqual(['example.com']);
    expect(config.servers[0].locations).toHaveLength(1);
    expect(config.servers[0].locations[0].path).toBe('/');
  });

  test('should validate configuration', async () => {
    const parser = new NginxParser();
    const config = await parser.parseString(`
server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://backend:3000;
    }
}`);

    const validation = parser.validate(config);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe('CloudFlareGenerator', () => {
  test('should generate CloudFlare Workers code', async () => {
    const parser = new NginxParser();
    const config = await parser.parseString(`
server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://backend:3000;
    }
}`);

    const generator = new CloudFlareGenerator(config);
    const code = generator.generate();
    
    expect(code).toContain('addEventListener("fetch"');
    expect(code).toContain('handleRequest');
    expect(code).toContain('backend:3000');
  });
});
