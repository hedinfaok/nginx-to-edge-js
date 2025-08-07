import { NginxParser } from '../src/parser/nginx-parser';
import { isLibUCLAvailable, testLibUCL, getLibUCLInfo } from '../src/parser/ucl-tool';

describe('LibUCL Integration', () => {
  test('should detect libucl availability', () => {
    const available = isLibUCLAvailable();
    console.log('LibUCL available:', available);
    
    if (available) {
      const info = getLibUCLInfo();
      console.log('LibUCL info:', info);
      expect(info.available).toBe(true);
      expect(info.path).toBeDefined();
    }
  });

  test('should test libucl functionality', () => {
    const testResult = testLibUCL();
    console.log('LibUCL test result:', testResult);
    
    if (isLibUCLAvailable()) {
      expect(testResult.success).toBe(true);
      expect(testResult.result).toBeDefined();
      expect(testResult.result.test).toBe('value');
      expect(testResult.result.section.key).toBe(123);
    }
  });

  test('should parse nginx configuration with libucl', async () => {
    const parser = new NginxParser();
    const nginxConfig = `
server {
    listen = 80;
    server_name = "example.com";
    
    location "/" {
        proxy_pass = "http://backend:3000";
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

  test('should handle complex nginx configuration', async () => {
    const parser = new NginxParser();
    const nginxConfig = `
upstream backend {
    server = "backend1.example.com:3000";
    server = "backend2.example.com:3000";
}

server {
    listen = 80;
    listen = 443;
    server_name = "app.example.com";
    
    location "/" {
        proxy_pass = "http://backend";
        proxy_set_header = "Host $host";
        proxy_set_header = "X-Real-IP $remote_addr";
    }
    
    location "/static/" {
        root = "/var/www/";
        expires = "1y";
    }
}`;

    const config = await parser.parseString(nginxConfig);
    
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].listen).toHaveLength(2);
    expect(config.servers[0].locations).toHaveLength(2);
    
    if (config.upstreams) {
      expect(config.upstreams).toHaveLength(1);
      expect(config.upstreams[0].name).toBe('backend');
    }
  });

  test('should validate configuration', async () => {
    const parser = new NginxParser();
    const config = await parser.parseString(`
server {
    listen = 80;
    server_name = "example.com";
    location "/" {
        proxy_pass = "http://backend:3000";
    }
}`);

    const validation = parser.validate(config);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});
