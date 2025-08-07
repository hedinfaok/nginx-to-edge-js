import { describe, it, expect } from '@jest/globals';
import { NginxToUCLTransformer } from '../../src/converters/nginx-to-ucl-transformer.js';
import type { NginxDirective, NginxParseResult } from '../../src/converters/nginx-parser.js';

describe('nginx-to-ucl-transformer', () => {
  let transformer: NginxToUCLTransformer;

  beforeAll(() => {
    transformer = new NginxToUCLTransformer();
  });

  // Helper function to create a mock parse result
  const createParseResult = (directives: NginxDirective[]): NginxParseResult => ({
    status: 'ok',
    errors: [],
    config: [{
      file: 'test.conf',
      status: 'ok',
      errors: [],
      parsed: directives
    }]
  });

  describe('basic directive transformation', () => {
    it('should transform simple directives', async () => {
      const directives: NginxDirective[] = [
        {
          directive: 'worker_processes',
          args: ['auto'],
          line: 1
        },
        {
          directive: 'worker_connections',
          args: ['1024'],
          line: 2
        }
      ];

      const parseResult = createParseResult(directives);
      const result = await transformer.transform(parseResult);
      expect(result).toContain('worker_processes');
      expect(result).toContain('worker_connections');
    });

    it('should handle directives with multiple arguments', async () => {
      const directives: NginxDirective[] = [
        {
          directive: 'listen',
          args: ['80', 'default_server'],
          line: 1
        }
      ];

      const parseResult = createParseResult(directives);
      const result = await transformer.transform(parseResult);
      expect(result).toContain('listen');
      expect(result).toContain('80');
      expect(result).toContain('default_server');
    });
  });

  describe('block directive transformation', () => {
    it('should transform server block', async () => {
      const directives: NginxDirective[] = [
        {
          directive: 'server',
          args: [],
          line: 1,
          block: [
            {
              directive: 'listen',
              args: ['80'],
              line: 2
            },
            {
              directive: 'server_name',
              args: ['example.com'],
              line: 3
            }
          ]
        }
      ];

      const parseResult = createParseResult(directives);
      const result = await transformer.transform(parseResult);
      expect(result).toContain('server');
      expect(result).toContain('listen');
      expect(result).toContain('server_name');
      expect(result).toContain('example.com');
    });

    it('should transform location block with URI', async () => {
      const directives: NginxDirective[] = [
        {
          directive: 'location',
          args: ['/api'],
          line: 1,
          block: [
            {
              directive: 'proxy_pass',
              args: ['http://backend'],
              line: 2
            }
          ]
        }
      ];

      const parseResult = createParseResult(directives);
      const result = await transformer.transform(parseResult);
      expect(result).toContain('location');
      expect(result).toContain('/api');
      expect(result).toContain('proxy_pass');
      expect(result).toContain('http://backend');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty directive list', async () => {
      const parseResult = createParseResult([]);
      const result = await transformer.transform(parseResult);
      expect(typeof result).toBe('string');
    });

    it('should handle directives with no arguments', async () => {
      const directives: NginxDirective[] = [
        {
          directive: 'gzip',
          args: [],
          line: 1
        }
      ];

      const parseResult = createParseResult(directives);
      const result = await transformer.transform(parseResult);
      expect(result).toContain('gzip');
    });

    it('should handle failed parse results', async () => {
      const failedParseResult: NginxParseResult = {
        status: 'failed',
        errors: [{
          file: 'test.conf',
          line: 1,
          error: 'syntax error'
        }],
        config: []
      };

      await expect(transformer.transform(failedParseResult)).rejects.toThrow('Cannot transform failed nginx parse');
    });
  });

  describe('formatting options', () => {
    it('should respect indentation settings', async () => {
      const directives: NginxDirective[] = [
        {
          directive: 'server',
          args: [],
          line: 1,
          block: [
            {
              directive: 'listen',
              args: ['80'],
              line: 2
            }
          ]
        }
      ];

      const parseResult = createParseResult(directives);
      const result = await transformer.transform(parseResult, { indent: '  ' });
      expect(result).toContain('server');
      expect(result).toContain('listen');
    });
  });
});
