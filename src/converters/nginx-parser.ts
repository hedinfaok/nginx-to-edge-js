/**
 * nginx Configuration Parser using crossplane
 * 
 * This module provides TypeScript bindings for parsing nginx configurations
 * using the official nginx Inc. crossplane Python library.
 */

import { spawn } from 'child_process';
import { access } from 'fs/promises';
import * as path from 'path';

export interface NginxParseErrorData {
  file: string;
  line: number;
  error: string;
  callback?: string;
}

export interface NginxDirective {
  directive: string;
  line: number;
  args: string[];
  includes?: number[];
  block?: NginxDirective[];
}

export interface NginxConfig {
  file: string;
  status: 'ok' | 'failed';
  errors: NginxParseErrorData[];
  parsed: NginxDirective[];
}

export interface NginxParseResult {
  status: 'ok' | 'failed';
  errors: NginxParseErrorData[];
  config: NginxConfig[];
}

export interface NginxParserOptions {
  singleFile?: boolean;
  includeComments?: boolean;
  strict?: boolean;
  ignoreDirectives?: string[];
  indent?: number;
}

export class NginxParseError extends Error {
  constructor(
    message: string,
    public readonly file?: string,
    public readonly line?: number,
    public readonly originalError?: string
  ) {
    super(message);
    this.name = 'NginxParseError';
  }
}

export class NginxParser {
  private crossplanePath: string = 'crossplane';

  constructor(crossplanePath?: string) {
    if (crossplanePath) {
      this.crossplanePath = crossplanePath;
    }
  }

  /**
   * Check if crossplane is available in the system
   */
  async isCrossplaneAvailable(): Promise<boolean> {
    try {
      const result = await this.runCrossplane(['--version']);
      return result.includes('crossplane');
    } catch {
      return false;
    }
  }

  /**
   * Parse nginx configuration file
   */
  async parseConfig(configPath: string, options: NginxParserOptions = {}): Promise<NginxParseResult> {
    // Verify file exists
    try {
      await access(configPath);
    } catch {
      throw new NginxParseError(`Configuration file not found: ${configPath}`);
    }

    // Build crossplane command
    const args = ['parse'];
    
    if (options.singleFile) {
      args.push('--single-file');
    }
    
    if (options.includeComments) {
      args.push('--include-comments');
    }
    
    if (options.strict) {
      args.push('--strict');
    }
    
    if (options.ignoreDirectives && options.ignoreDirectives.length > 0) {
      args.push('--ignore', options.ignoreDirectives.join(','));
    }
    
    if (options.indent) {
      args.push('--indent', options.indent.toString());
    }

    args.push(configPath);

    try {
      const output = await this.runCrossplane(args);
      const result: NginxParseResult = JSON.parse(output);
      
      if (result.status === 'failed') {
        const errorMessages = result.errors.map(err => 
          `${err.file}:${err.line}: ${err.error}`
        ).join('\n');
        throw new NginxParseError(`nginx configuration parsing failed:\n${errorMessages}`);
      }

      return result;
    } catch (error) {
      if (error instanceof NginxParseError) {
        throw error;
      }
      throw new NginxParseError(
        `Failed to parse nginx configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        configPath
      );
    }
  }

  /**
   * Parse nginx configuration from string content
   */
  async parseString(content: string, options: NginxParserOptions = {}): Promise<NginxParseResult> {
    // Create temporary file for parsing with better uniqueness
    const tmpFile = path.join(process.cwd(), `.tmp_nginx_config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    
    try {
      const fs = await import('fs/promises');
      await fs.writeFile(tmpFile, content, 'utf8');
      
      // Verify file was written successfully
      const stats = await fs.stat(tmpFile);
      if (!stats.isFile()) {
        throw new Error('Failed to create temporary configuration file');
      }
      
      const result = await this.parseConfig(tmpFile, options);
      
      // Clean up temporary file
      await fs.unlink(tmpFile).catch(() => {}); // Ignore cleanup errors
      
      return result;
    } catch (error) {
      // Ensure cleanup on error
      try {
        const fs = await import('fs/promises');
        await fs.unlink(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  /**
   * Validate nginx configuration syntax
   */
  async validateConfig(configPath: string): Promise<{ valid: boolean; errors: NginxParseErrorData[] }> {
    try {
      const result = await this.parseConfig(configPath, { strict: true });
      return {
        valid: result.status === 'ok' && result.errors.length === 0,
        errors: result.errors
      };
    } catch (error) {
      if (error instanceof NginxParseError) {
        return {
          valid: false,
          errors: [{
            file: configPath,
            line: error.line || 0,
            error: error.message
          }]
        };
      }
      return {
        valid: false,
        errors: [{
          file: configPath,
          line: 0,
          error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Get nginx configuration as lexical tokens
   */
  async lexConfig(configPath: string, includeLineNumbers: boolean = false): Promise<string[]> {
    const args = ['lex'];
    
    if (includeLineNumbers) {
      args.push('--line-numbers');
    }
    
    args.push(configPath);

    try {
      const output = await this.runCrossplane(args);
      return JSON.parse(output);
    } catch (error) {
      throw new NginxParseError(
        `Failed to tokenize nginx configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        configPath
      );
    }
  }

  /**
   * Format nginx configuration
   */
  async formatConfig(configPath: string, options: { indent?: number; tabs?: boolean } = {}): Promise<string> {
    const args = ['format'];
    
    if (options.tabs) {
      args.push('--tabs');
    } else if (options.indent) {
      args.push('--indent', options.indent.toString());
    }
    
    args.push(configPath);

    try {
      return await this.runCrossplane(args);
    } catch (error) {
      throw new NginxParseError(
        `Failed to format nginx configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        configPath
      );
    }
  }

  /**
   * Minify nginx configuration
   */
  async minifyConfig(configPath: string): Promise<string> {
    try {
      return await this.runCrossplane(['minify', configPath]);
    } catch (error) {
      throw new NginxParseError(
        `Failed to minify nginx configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        configPath
      );
    }
  }

  /**
   * Run crossplane command and return output
   */
  private async runCrossplane(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.crossplanePath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          const errorMessage = stderr.trim() || `crossplane exited with code ${code}`;
          reject(new Error(errorMessage));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to run crossplane: ${error.message}`));
      });

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('crossplane command timed out'));
      }, 30000); // 30 second timeout

      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }
}

/**
 * Default nginx parser instance
 */
export const nginxParser = new NginxParser();

/**
 * Convenience function to parse nginx configuration
 */
export async function parseNginxConfig(configPath: string, options?: NginxParserOptions): Promise<NginxParseResult> {
  return nginxParser.parseConfig(configPath, options);
}

/**
 * Convenience function to validate nginx configuration
 */
export async function validateNginxConfig(configPath: string): Promise<{ valid: boolean; errors: NginxParseErrorData[] }> {
  return nginxParser.validateConfig(configPath);
}
