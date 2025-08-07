/**
 * UCL integration using child_process to call native ucl_tool
 * This provides access to the official libucl without complex FFI bindings
 */

import { execSync } from 'child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export enum UCLEmitterType {
  JSON = 'json',
  JSON_COMPACT = 'json',
  CONFIG = 'ucl', 
  YAML = 'yaml',
  MSGPACK = 'msgpack'
}

export enum UCLParserFlags {
  DEFAULT = 0,
  NO_TIME = 1,
  NO_IMPLICIT_ARRAYS = 2,
  ZEROCOPY = 4,
  NO_FILEVARS = 8,
  DISABLE_MACRO = 16,
  NO_INCLUDES = 32
}

/**
 * Find ucl_tool executable
 */
function findUCLTool(): string {
  const possiblePaths = [
    '/opt/homebrew/bin/ucl_tool',     // macOS Homebrew ARM64
    '/usr/local/bin/ucl_tool',        // macOS Homebrew x86_64
    '/usr/bin/ucl_tool',              // Linux system
    'ucl_tool'                        // PATH fallback
  ];

  for (const path of possiblePaths) {
    try {
      if (existsSync(path)) {
        return path;
      }
    } catch {
      // Continue checking
    }
  }

  // Try to find in PATH
  try {
    execSync('which ucl_tool', { stdio: 'pipe' });
    return 'ucl_tool';
  } catch {
    throw new Error('ucl_tool not found. Please install libucl:\n' +
      '  macOS: brew install libucl\n' +
      '  Ubuntu/Debian: apt-get install libucl-dev\n' +
      '  CentOS/RHEL: yum install libucl-devel');
  }
}

/**
 * UCL Parser class using native ucl_tool
 */
export class UCLParser {
  private uclTool: string;
  private tempDir: string;

  constructor() {
    this.uclTool = findUCLTool();
    this.tempDir = mkdtempSync(join(tmpdir(), 'ucl-parser-'));
  }

  /**
   * Parse UCL string and return JavaScript object
   */
  parse(content: string): any {
    const jsonString = this.parseToJSON(content, false);
    
    // Clean up any trailing commas that might cause JSON.parse to fail
    let cleanJson = jsonString.replace(/,(\s*[}\]])/g, '$1');
    // Also remove standalone commas (like ",\n" patterns)
    cleanJson = cleanJson.replace(/,\s*,/g, ',');
    cleanJson = cleanJson.replace(/,\s*\n\s*,/g, ',');
    // Remove commas followed by newlines and then closing braces/brackets
    cleanJson = cleanJson.replace(/,\s*\n\s*([}\]])/g, '\n$1');
    
    return JSON.parse(cleanJson);
  }

  /**
   * Parse UCL string and return JSON string
   */
  parseToJSON(content: string, compact: boolean = false): string {
    return this.convertUCL(content, UCLEmitterType.JSON, compact);
  }

  /**
   * Parse UCL and convert to specified format
   */
  convertUCL(content: string, outputFormat: UCLEmitterType, compact: boolean = false): string {
    // Create temporary files
    const inputFile = join(this.tempDir, 'input.ucl');
    const outputFile = join(this.tempDir, 'output.' + outputFormat);

    try {
      // Write input content to file
      writeFileSync(inputFile, content, 'utf8');

      // Build ucl_tool command
      const args = ['-i', inputFile, '-f', outputFormat];
      if (compact && outputFormat === UCLEmitterType.JSON) {
        args.push('-c'); // compact JSON
      }
      args.push('-o', outputFile);

      // Execute ucl_tool
      execSync(`"${this.uclTool}" ${args.join(' ')}`, {
        stdio: 'pipe',
        timeout: 30000 // 30 second timeout
      });

      // Read output
      if (!existsSync(outputFile)) {
        throw new Error('ucl_tool did not produce output file');
      }

      return readFileSync(outputFile, 'utf8');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`UCL parsing failed: ${errorMessage}`);
    } finally {
      // Clean up temporary files
      try {
        if (existsSync(inputFile)) rmSync(inputFile);
        if (existsSync(outputFile)) rmSync(outputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Validate UCL syntax without parsing to object
   */
  validate(content: string): { valid: boolean; error?: string } {
    const inputFile = join(this.tempDir, 'validate.ucl');

    try {
      writeFileSync(inputFile, content, 'utf8');

      // Just try to parse, don't output anything
      execSync(`"${this.uclTool}" -i "${inputFile}" -f json -o /dev/null`, {
        stdio: 'pipe',
        timeout: 10000
      });

      return { valid: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return { valid: false, error: errorMessage };
    } finally {
      try {
        if (existsSync(inputFile)) rmSync(inputFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Clean up temporary directory
   */
  cleanup(): void {
    try {
      if (existsSync(this.tempDir)) {
        rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Destructor - automatically clean up
   */
  [Symbol.dispose](): void {
    this.cleanup();
  }
}

/**
 * Convenience function to parse UCL string directly
 */
export function parseUCL(content: string): any {
  const parser = new UCLParser();
  try {
    return parser.parse(content);
  } finally {
    parser.cleanup();
  }
}

/**
 * Convenience function to parse UCL string to JSON
 */
export function parseUCLToJSON(content: string, compact: boolean = false): string {
  const parser = new UCLParser();
  try {
    return parser.parseToJSON(content, compact);
  } finally {
    parser.cleanup();
  }
}

/**
 * Check if libucl ucl_tool is available
 */
export function isLibUCLAvailable(): boolean {
  try {
    findUCLTool();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get libucl tool information
 */
export function getLibUCLInfo(): { available: boolean; path?: string; version?: string; error?: string } {
  try {
    const toolPath = findUCLTool();
    
    // Try to get version
    let version: string | undefined;
    try {
      const versionOutput = execSync(`"${toolPath}" -h`, { 
        stdio: 'pipe', 
        encoding: 'utf8',
        timeout: 5000 
      });
      
      // Extract version from help output
      const versionMatch = versionOutput.match(/version\s+(\d+\.\d+\.\d+)/i);
      version = versionMatch ? versionMatch[1] : 'unknown';
    } catch {
      version = 'unknown';
    }

    return { available: true, path: toolPath, version };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: errorMessage };
  }
}

/**
 * Test libucl functionality with a simple example
 */
export function testLibUCL(): { success: boolean; error?: string; result?: any } {
  try {
    const testContent = `
# Test UCL content
test = "value";
section {
  key = 123;
  flag = true;
}
`;

    const result = parseUCL(testContent);
    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Test failed';
    return { success: false, error: errorMessage };
  }
}
