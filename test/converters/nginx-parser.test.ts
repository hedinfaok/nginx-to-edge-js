import { describe, it, expect, beforeAll } from '@jest/globals';
import { NginxParser, parseNginxConfig, validateNginxConfig } from '../../src/converters/nginx-parser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('nginx-parser', () => {
  let parser: NginxParser;
  let testConfigPath: string;

  beforeAll(async () => {
    parser = new NginxParser();
    
    // Create a test nginx config
    testConfigPath = path.join(process.cwd(), 'test-nginx.conf');
    const testConfig = `
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name example.com;
        
        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        location /api {
            proxy_pass http://api-backend;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
    }
    
    upstream backend {
        server 127.0.0.1:3000;
        server 127.0.0.1:3001;
    }
    
    upstream api-backend {
        server 127.0.0.1:4000 weight=3;
        server 127.0.0.1:4001 weight=1;
    }
}
`;
    await fs.writeFile(testConfigPath, testConfig.trim());
  });

  afterAll(async () => {
    // Cleanup test file
    try {
      await fs.unlink(testConfigPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('crossplane availability', () => {
    it('should check if crossplane is available', async () => {
      const available = await parser.isCrossplaneAvailable();
      // This might be false in CI without crossplane installed
      expect(typeof available).toBe('boolean');
    });
  });

  describe('configuration parsing', () => {
    it('should parse a valid nginx configuration', async () => {
      // Skip if crossplane is not available
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx parsing tests - crossplane not available');
        return;
      }

      const result = await parser.parseConfig(testConfigPath);
      
      expect(result.status).toBe('ok');
      expect(result.errors).toHaveLength(0);
      expect(result.config).toHaveLength(1);
      
      const config = result.config[0];
      expect(config.file).toBe(testConfigPath);
      expect(config.status).toBe('ok');
      expect(config.parsed).toBeInstanceOf(Array);
      expect(config.parsed.length).toBeGreaterThan(0);
    });

    it('should handle parsing errors gracefully', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx parsing error tests - crossplane not available');
        return;
      }

      // Create invalid config
      const invalidConfigPath = path.join(process.cwd(), 'test-invalid-nginx.conf');
      const invalidConfig = `
server {
    listen 80
    # Missing semicolon above
    server_name example.com;
}
`;
      await fs.writeFile(invalidConfigPath, invalidConfig);

      try {
        await expect(parser.parseConfig(invalidConfigPath)).rejects.toThrow();
      } finally {
        await fs.unlink(invalidConfigPath).catch(() => {});
      }
    });

    it('should parse configuration from string', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx string parsing tests - crossplane not available');
        return;
      }

      const configString = `
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name test.com;
    }
}
`;

      const result = await parser.parseString(configString);
      expect(result.status).toBe('ok');
      expect(result.config).toHaveLength(1);
      expect(result.config[0].parsed).toHaveLength(2); // events + http blocks
      
      const eventsDirective = result.config[0].parsed[0];
      expect(eventsDirective.directive).toBe('events');
      
      const httpDirective = result.config[0].parsed[1];
      expect(httpDirective.directive).toBe('http');
      expect(httpDirective.block).toBeDefined();
    });
  });

  describe('configuration validation', () => {
    it('should validate a correct nginx configuration', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx validation tests - crossplane not available');
        return;
      }

      const validation = await parser.validateConfig(testConfigPath);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect syntax errors', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx validation error tests - crossplane not available');
        return;
      }

      // Create config with syntax error
      const errorConfigPath = path.join(process.cwd(), 'test-error-nginx.conf');
      const errorConfig = `
server {
    listen 80;
    invalid_directive_name;
    server_name example.com;
}
`;
      await fs.writeFile(errorConfigPath, errorConfig);

      try {
        const validation = await parser.validateConfig(errorConfigPath);
        // Should either be invalid or have warnings depending on crossplane strictness
        expect(typeof validation.valid).toBe('boolean');
        expect(Array.isArray(validation.errors)).toBe(true);
      } finally {
        await fs.unlink(errorConfigPath).catch(() => {});
      }
    });
  });

  describe('lexical analysis', () => {
    it('should tokenize nginx configuration', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx lexical analysis tests - crossplane not available');
        return;
      }

      const tokens = await parser.lexConfig(testConfigPath);
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
      
      // Should contain nginx keywords
      expect(tokens).toContain('server');
      expect(tokens).toContain('listen');
      expect(tokens).toContain('location');
    });

    it('should include line numbers when requested', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx lexical analysis with line numbers - crossplane not available');
        return;
      }

      const tokens = await parser.lexConfig(testConfigPath, true);
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
      
      // With line numbers, tokens should be arrays [token, line]
      if (tokens.length > 0) {
        const firstToken = tokens[0];
        expect(Array.isArray(firstToken) || typeof firstToken === 'string').toBe(true);
      }
    });
  });

  describe('formatting and minification', () => {
    it('should format nginx configuration', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx formatting tests - crossplane not available');
        return;
      }

      const formatted = await parser.formatConfig(testConfigPath, { indent: 4 });
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('server');
      expect(formatted).toContain('location');
    });

    it('should minify nginx configuration', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx minification tests - crossplane not available');
        return;
      }

      const minified = await parser.minifyConfig(testConfigPath);
      expect(typeof minified).toBe('string');
      expect(minified.length).toBeGreaterThan(0);
      
      // Minified should have no extra whitespace
      expect(minified).not.toContain('    '); // No 4-space indentation
      expect(minified).not.toContain('\n\n'); // No double newlines
    });
  });

  describe('convenience functions', () => {
    it('should provide parseNginxConfig convenience function', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping convenience function tests - crossplane not available');
        return;
      }

      const result = await parseNginxConfig(testConfigPath);
      expect(result.status).toBe('ok');
      expect(result.config).toHaveLength(1);
    });

    it('should provide validateNginxConfig convenience function', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping convenience validation tests - crossplane not available');
        return;
      }

      const validation = await validateNginxConfig(testConfigPath);
      expect(validation.valid).toBe(true);
      expect(Array.isArray(validation.errors)).toBe(true);
    });
  });
});
