import {
  ucl_parser_new,
  ucl_parser_add_string,
  ucl_parser_add_file,
  ucl_parser_get_object,
  ucl_parser_get_error,
  ucl_parser_free,
  ucl_object_emit,
  ucl_object_unref,
  UCL_EMIT_JSON,
  isLibraryAvailable
} from './libucl-ffi.js';

export interface UCLParseResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class UCLParser {
  private parser: any = null;

  constructor() {
    this.parser = ucl_parser_new(0);
    if (!this.parser) {
      throw new Error('Failed to create UCL parser');
    }
  }

  parseString(content: string): UCLParseResult {
    if (!this.parser) {
      return { success: false, error: 'Parser not initialized' };
    }

    const buffer = Buffer.from(content, 'utf8');
    const success = ucl_parser_add_string(this.parser, buffer, buffer.length);

    if (!success) {
      const errorPtr = ucl_parser_get_error(this.parser);
      const error = errorPtr ? errorPtr.toString() : 'Unknown parse error';
      return { success: false, error };
    }

    return this.getResult();
  }

  parseFile(filename: string): UCLParseResult {
    if (!this.parser) {
      return { success: false, error: 'Parser not initialized' };
    }

    const success = ucl_parser_add_file(this.parser, filename);
    
    if (!success) {
      const errorPtr = ucl_parser_get_error(this.parser);
      const error = errorPtr ? errorPtr.toString() : 'Unknown file parse error';
      return { success: false, error };
    }

    return this.getResult();
  }

  private getResult(): UCLParseResult {
    const obj = ucl_parser_get_object(this.parser);
    if (!obj) {
      return { success: false, error: 'No object returned from parser' };
    }

    try {
      const jsonPtr = ucl_object_emit(obj, UCL_EMIT_JSON);
      if (!jsonPtr) {
        ucl_object_unref(obj);
        return { success: false, error: 'Failed to emit JSON' };
      }

      let jsonString = jsonPtr.toString();
      
      // Clean up trailing commas that libucl sometimes generates
      jsonString = this.cleanupJSON(jsonString);
      
      const result = JSON.parse(jsonString);
      
      // Cleanup
      ucl_object_unref(obj);
      
      return { success: true, result };
    } catch (err) {
      ucl_object_unref(obj);
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: `JSON parse error: ${errorMessage}` };
    }
  }

  private cleanupJSON(jsonString: string): string {
    // Remove trailing commas before closing braces and brackets
    return jsonString
      .replace(/,(\s*[\]}])/g, '$1')  // Remove trailing commas before } or ]
      .replace(/,(\s*,)/g, ',');      // Remove duplicate commas
  }

  destroy(): void {
    if (this.parser) {
      ucl_parser_free(this.parser);
      this.parser = null;
    }
  }
}

export function isLibUCLAvailable(): boolean {
  return isLibraryAvailable();
}

export function getLibUCLInfo() {
  return {
    available: isLibUCLAvailable(),
    method: 'FFI',
    version: 'native',
    path: 'libucl (FFI)'
  };
}
