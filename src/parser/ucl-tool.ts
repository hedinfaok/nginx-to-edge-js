/**
 * UCL parser wrapper using direct FFI bindings to libucl
 */

import { UCLParser } from '../bindings/libucl-wrapper.js';
import { isLibraryAvailable } from '../bindings/libucl-ffi.js';

/**
 * Parse UCL content from a string
 */
export function parseUCL(content: string): any {
  const parser = new UCLParser();
  try {
    const result = parser.parseString(content);
    if (result.success) {
      return result.result;
    } else {
      throw new Error(result.error || 'Unknown parsing error');
    }
  } finally {
    parser.destroy();
  }
}

/**
 * Parse UCL content from a file
 */
export function parseUCLFile(filePath: string): any {
  const parser = new UCLParser();
  try {
    const result = parser.parseFile(filePath);
    if (result.success) {
      return result.result;
    } else {
      throw new Error(result.error || 'Unknown file parsing error');
    }
  } finally {
    parser.destroy();
  }
}

/**
 * Check if libucl is available
 */
export function isLibUCLAvailable(): boolean {
  return isLibraryAvailable();
}

/**
 * Get libucl library information
 */
export function getLibUCLInfo(): { available: boolean; version?: string; path?: string } {
  const available = isLibraryAvailable();
  return {
    available,
    version: available ? 'FFI-based' : undefined,
    path: available ? 'Direct FFI binding' : undefined
  };
}

/**
 * Test the libucl FFI implementation
 */
export function testLibUCL(): { success: boolean; result?: any; error?: string } {
  try {
    const testContent = `{
      test = "value";
      section {
        key = 123;
      }
    }`;
    
    const result = parseUCL(testContent);
    const success = result && typeof result === 'object' && result.test === 'value';
    
    return {
      success,
      result: success ? result : undefined,
      error: success ? undefined : 'Parsing failed'
    };
  } catch (error) {
    console.error('LibUCL test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
