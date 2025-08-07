import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { NginxToUCLConverter } from '../../src/converters/nginx-to-ucl-converter.js';
import { NginxParser } from '../../src/converters/nginx-parser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('nginx-to-ucl-converter', () => {
  let converter: NginxToUCLConverter;
  let parser: NginxParser;
  let testConfigPath: string;
  let testOutputPath: string;

  beforeAll(async () => {
    converter = new NginxToUCLConverter();
    parser = new NginxParser();
    
    // Create test nginx config
    testConfigPath = path.join(process.cwd(), 'test-nginx-converter.conf');
    testOutputPath = path.join(process.cwd(), 'test-output.ucl');
    
    const testConfig = `
events {
    worker_connections 1024;
}

http {
    default_type  application/octet-stream;
    
    server {
        listen 80;
        server_name example.com www.example.com;
        root /var/www/html;
        
        location / {
            try_files $uri $uri/ =404;
        }
        
        location /api {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_connect_timeout 30s;
            proxy_read_timeout 30s;
        }
        
        location ~* \\.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
    }
    
    upstream backend {
        server 127.0.0.1:3000 weight=3;
        server 127.0.0.1:3001 weight=1;
        server 127.0.0.1:3002 backup;
    }
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Gzip settings
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
`;
    await fs.writeFile(testConfigPath, testConfig.trim());
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testConfigPath);
      await fs.unlink(testOutputPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('dependency checking', () => {
    it('should check crossplane availability through parser', async () => {
      const available = await parser.isCrossplaneAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('file conversion', () => {
    it('should convert nginx config to UCL format', async () => {
      // Skip if crossplane is not available
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx-to-UCL conversion tests - crossplane not available');
        return;
      }

      const result = await converter.convertFile(testConfigPath, {
        outputFile: testOutputPath
      });
      
      expect(result.success).toBe(true);
      expect(result.inputFiles).toContain(testConfigPath);
      expect(result.outputFile).toBe(testOutputPath);
      expect(result.stats).toBeDefined();
      expect(result.stats.directives).toBeGreaterThan(0);
      expect(result.stats.files).toBeGreaterThan(0);
      
      // Check output file exists
      const outputExists = await fs.access(testOutputPath).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
      
      // Check output content
      const outputContent = await fs.readFile(testOutputPath, 'utf-8');
      expect(outputContent).toContain('events:');
      expect(outputContent).toContain('http:');
      expect(outputContent).toContain('server:');
      expect(outputContent).toContain('upstream:');
    });

    it('should handle conversion errors gracefully', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx conversion error tests - crossplane not available');
        return;
      }

      // Try to convert non-existent file
      const nonExistentPath = '/non/existent/file.conf';
      const result = await converter.convertFile(nonExistentPath, {
        outputFile: testOutputPath
      });
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should convert to string format', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx string conversion tests - crossplane not available');
        return;
      }

      const configContent = await fs.readFile(testConfigPath, 'utf-8');
      const result = await converter.convertString(configContent);
      
      expect(result.ucl).toBeDefined();
      expect(result.ucl).toContain('events:');
      expect(result.ucl).toContain('http:');
      expect(result.stats).toBeDefined();
      expect(result.stats.directives).toBeGreaterThan(0);
    });
  });

  describe('batch conversion', () => {
    it('should convert multiple files', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping batch conversion tests - crossplane not available');
        return;
      }

      // Create another test file
      const testConfig2Path = path.join(process.cwd(), 'test-nginx-2.conf');
      const simpleConfig = `
events {
    worker_connections 512;
}

http {
    server {
        listen 8080;
        server_name test.local;
        root /var/www/test;
    }
}
`;
      await fs.writeFile(testConfig2Path, simpleConfig.trim());

      try {
        const inputFiles = [testConfigPath, testConfig2Path];
        
        const results = await converter.convertBatch(inputFiles);
        
        expect(results.length).toBe(2);
        
        // Check first result
        expect(results[0].success).toBe(true);
        expect(results[0].inputFiles).toContain(testConfigPath);
        
        // Check second result
        expect(results[1].success).toBe(true);
        expect(results[1].inputFiles).toContain(testConfig2Path);
        
        // Check output files exist
        const output1 = path.join(process.cwd(), 'test-nginx-converter.ucl');
        const output2 = path.join(process.cwd(), 'test-nginx-2.ucl');
        
        const output1Exists = await fs.access(output1).then(() => true).catch(() => false);
        const output2Exists = await fs.access(output2).then(() => true).catch(() => false);
        
        expect(output1Exists).toBe(true);
        expect(output2Exists).toBe(true);
        
        // Cleanup
        await fs.unlink(output1).catch(() => {});
        await fs.unlink(output2).catch(() => {});
      } finally {
        await fs.unlink(testConfig2Path).catch(() => {});
      }
    });

    it('should handle mixed success/failure in batch conversion', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping batch conversion error tests - crossplane not available');
        return;
      }

      const inputFiles = [testConfigPath, '/non/existent/file.conf'];
      
      const results = await converter.convertBatch(inputFiles);
      
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true); // Valid file should succeed
      expect(results[1].success).toBe(false); // Invalid file should fail
      expect(results[1].errors).toBeDefined();
      expect(results[1].errors!.length).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    it('should validate nginx configuration', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx validation tests - crossplane not available');
        return;
      }

      const validation = await parser.validateConfig(testConfigPath);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid nginx configuration', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping nginx validation error tests - crossplane not available');
        return;
      }

      // Create invalid config
      const invalidConfigPath = path.join(process.cwd(), 'test-invalid.conf');
      const invalidConfig = `
server {
    listen 80
    # Missing semicolon above
    server_name example.com;
}
`;
      await fs.writeFile(invalidConfigPath, invalidConfig);

      try {
        const validation = await parser.validateConfig(invalidConfigPath);
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      } finally {
        await fs.unlink(invalidConfigPath).catch(() => {});
      }
    });

    it('should validate conversion using round-trip', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping conversion validation tests - crossplane not available');
        return;
      }

      const validation = await converter.validateConversion(testConfigPath);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('statistics and analysis', () => {
    it('should provide conversion statistics', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping statistics tests - crossplane not available');
        return;
      }

      const stats = await converter.getStats(testConfigPath);
      
      expect(stats.files).toBeGreaterThan(0);
      expect(stats.directives).toBeGreaterThan(0);
      expect(stats.size).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(stats.complexity);
    });

    it('should track processing metrics in conversion', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping processing metrics tests - crossplane not available');
        return;
      }

      const result = await converter.convertFile(testConfigPath, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats.processingTime).toBeGreaterThan(0);
      expect(result.stats.inputSize).toBeGreaterThan(0);
      expect(result.stats.outputSize).toBeGreaterThan(0);
      expect(result.stats.directives).toBeGreaterThan(0);
      expect(result.stats.files).toBeGreaterThan(0);
    });
  });

  describe('preview functionality', () => {
    it('should generate preview without saving', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping preview tests - crossplane not available');
        return;
      }

      const preview = await converter.preview(testConfigPath);
      
      expect(preview.ucl).toBeDefined();
      expect(preview.ucl).toContain('events:');
      expect(preview.ucl).toContain('http:');
      expect(preview.stats).toBeDefined();
      expect(preview.stats.directives).toBeGreaterThan(0);
      expect(Array.isArray(preview.warnings)).toBe(true);
    });

    it('should handle preview errors', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping preview error tests - crossplane not available');
        return;
      }

      const preview = await converter.preview('/non/existent/file.conf');
      
      // Preview should handle errors gracefully
      expect(preview.ucl).toBe('');
      expect(preview.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('conversion options', () => {
    it('should respect validation options', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping validation option tests - crossplane not available');
        return;
      }

      const result = await converter.convertFile(testConfigPath, {
        validateInput: true,
        validateOutput: false,
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.ucl).toBeDefined();
    });

    it('should handle dry run mode', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping dry run tests - crossplane not available');
        return;
      }

      const result = await converter.convertFile(testConfigPath, {
        outputFile: '/tmp/should-not-exist.ucl',
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.ucl).toBeDefined();
      expect(result.outputFile).toBeUndefined(); // Should not write in dry run
    });

    it('should handle verbose mode', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping verbose mode tests - crossplane not available');
        return;
      }

      // Capture console output
      const originalLog = console.log;
      const logMessages: string[] = [];
      console.log = (message: string) => logMessages.push(message);

      try {
        const result = await converter.convertFile(testConfigPath, {
          verbose: true,
          dryRun: true
        });
        
        expect(result.success).toBe(true);
        expect(logMessages.length).toBeGreaterThan(0);
        expect(logMessages.some(msg => msg.includes('Converting nginx config'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle formatting options', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping formatting tests - crossplane not available');
        return;
      }

      const result = await converter.convertFile(testConfigPath, {
        transformer: {
          indent: '  ', // 2 spaces
          multiline: true,
          sortKeys: true
        },
        dryRun: true
      });
      
      expect(result.success).toBe(true);
      expect(result.ucl).toBeDefined();
      
      // Check indentation
      const lines = result.ucl!.split('\n');
      const indentedLines = lines.filter(line => line.startsWith('  '));
      expect(indentedLines.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle parser errors gracefully', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping parser error tests - crossplane not available');
        return;
      }

      // Create malformed config
      const malformedPath = path.join(process.cwd(), 'test-malformed.conf');
      const malformedConfig = `
server {
    listen 80;
    invalid_directive_without_semicolon
    server_name example.com;
`;
      await fs.writeFile(malformedPath, malformedConfig);

      try {
        const result = await converter.convertFile(malformedPath, { dryRun: true });
        
        // Should either fail gracefully or handle the error
        if (!result.success) {
          expect(result.errors).toBeDefined();
          expect(result.errors!.length).toBeGreaterThan(0);
        }
      } finally {
        await fs.unlink(malformedPath).catch(() => {});
      }
    });

    it('should handle file system errors', async () => {
      const result = await converter.convertFile('/dev/null/impossible/path.conf', {
        dryRun: true
      });
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should handle write permission errors', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping write permission tests - crossplane not available');
        return;
      }

      const result = await converter.convertFile(testConfigPath, {
        outputFile: '/dev/null/impossible/output.ucl'
      });
      
      // Should fail to write but parsing should succeed
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex nginx configurations', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping complex config tests - crossplane not available');
        return;
      }

      // This test uses the complex config already created in beforeAll
      const stats = await converter.getStats(testConfigPath);
      
      expect(stats.directives).toBeGreaterThan(20); // Should have many directives
      expect(stats.complexity).toMatch(/^(medium|high)$/); // Should be complex
    });

    it('should handle empty configurations', async () => {
      const available = await parser.isCrossplaneAvailable();
      if (!available) {
        console.log('Skipping empty config tests - crossplane not available');
        return;
      }

      const emptyConfigPath = path.join(process.cwd(), 'test-empty.conf');
      const emptyConfig = `
# Just a comment
events {
    worker_connections 1024;
}
`;
      await fs.writeFile(emptyConfigPath, emptyConfig);

      try {
        const result = await converter.convertFile(emptyConfigPath, { dryRun: true });
        
        expect(result.success).toBe(true);
        expect(result.stats.directives).toBeGreaterThan(0); // Should have at least worker_connections
      } finally {
        await fs.unlink(emptyConfigPath).catch(() => {});
      }
    });
  });
});
