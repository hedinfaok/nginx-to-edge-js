import koffi from 'koffi';
import * as fs from 'fs';
import * as path from 'path';

// UCL emitter types enum
export const UCL_EMIT_JSON = 0;
export const UCL_EMIT_JSON_COMPACT = 1;
export const UCL_EMIT_CONFIG = 2;
export const UCL_EMIT_YAML = 3;

// UCL object types
export const UCL_OBJECT = 0;
export const UCL_ARRAY = 1;
export const UCL_INT = 2;
export const UCL_FLOAT = 3;
export const UCL_STRING = 4;
export const UCL_BOOLEAN = 5;
export const UCL_TIME = 6;
export const UCL_USERDATA = 7;
export const UCL_NULL = 8;

// Platform-specific library discovery
const getLibraryPath = (): string => {
  const searchPaths = [
    '/opt/homebrew/lib/libucl.dylib',
    '/opt/homebrew/Cellar/libucl/*/lib/libucl.dylib',
    '/usr/local/lib/libucl.dylib',
    '/usr/lib/x86_64-linux-gnu/libucl.so',  // Ubuntu/Debian x86_64
    '/usr/lib/aarch64-linux-gnu/libucl.so', // Ubuntu/Debian ARM64
    '/usr/lib64/libucl.so',                  // CentOS/RHEL/Fedora
    '/usr/lib/libucl.so',
    '/usr/local/lib/libucl.so'
  ];

  for (const searchPath of searchPaths) {
    if (searchPath.includes('*')) {
      // Handle glob patterns
      const basePath = searchPath.split('*')[0];
      try {
        const entries = fs.readdirSync(basePath);
        for (const entry of entries) {
          const fullPath = path.join(basePath, entry, 'lib/libucl.dylib');
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }
      } catch {
        continue;
      }
    } else if (fs.existsSync(searchPath)) {
      return searchPath;
    }
  }

  // Fallback to system library resolution
  switch (process.platform) {
    case 'darwin':
      return 'libucl.dylib';
    case 'linux':
      return 'libucl.so';
    case 'win32':
      return 'ucl.dll';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
};

// Load the library
const libraryPath = getLibraryPath();
let libucl: any;

try {
  libucl = koffi.load(libraryPath);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to load libucl from ${libraryPath}: ${errorMessage}`);
}

// Define types
const ucl_parser_t = 'void*';
const ucl_object_t = 'void*';
const charPtr = 'char*';

// FFI function bindings
export const ucl_parser_new = libucl.func('ucl_parser_new', ucl_parser_t, ['int']);
export const ucl_parser_add_string = libucl.func('ucl_parser_add_string', 'bool', [ucl_parser_t, charPtr, 'size_t']);
export const ucl_parser_add_file = libucl.func('ucl_parser_add_file', 'bool', [ucl_parser_t, charPtr]);
export const ucl_parser_get_object = libucl.func('ucl_parser_get_object', ucl_object_t, [ucl_parser_t]);
export const ucl_parser_get_error = libucl.func('ucl_parser_get_error', charPtr, [ucl_parser_t]);
export const ucl_parser_free = libucl.func('ucl_parser_free', 'void', [ucl_parser_t]);

export const ucl_object_emit = libucl.func('ucl_object_emit', charPtr, [ucl_object_t, 'int']);
export const ucl_object_unref = libucl.func('ucl_object_unref', 'void', [ucl_object_t]);

export const ucl_object_type = libucl.func('ucl_object_type', 'int', [ucl_object_t]);
export const ucl_object_tostring = libucl.func('ucl_object_tostring', charPtr, [ucl_object_t]);
export const ucl_object_toint = libucl.func('ucl_object_toint', 'int64', [ucl_object_t]);
export const ucl_object_todouble = libucl.func('ucl_object_todouble', 'double', [ucl_object_t]);
export const ucl_object_toboolean = libucl.func('ucl_object_toboolean', 'bool', [ucl_object_t]);

// Test library availability
export function isLibraryAvailable(): boolean {
  try {
    const parser = ucl_parser_new(0);
    if (parser) {
      ucl_parser_free(parser);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
