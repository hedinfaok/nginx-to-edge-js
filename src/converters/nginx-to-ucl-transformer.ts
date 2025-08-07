/**
 * nginx-to-UCL Transformer
 * 
 * Transforms parsed nginx configuration (from crossplane) into UCL format.
 * This module handles the AST transformation and UCL formatting.
 */

import { NginxDirective, NginxConfig, NginxParseResult } from './nginx-parser.js';

export interface UCLTransformOptions {
  // Output formatting options
  indent?: string;
  multiline?: boolean;
  sortKeys?: boolean;
  
  // Transformation options
  preserveComments?: boolean;
  includeLineNumbers?: boolean;
  generateMetadata?: boolean;
  
  // Directive mapping options
  customMappings?: Record<string, DirectiveMapping>;
  skipDirectives?: string[];
}

export interface DirectiveMapping {
  // How to transform this directive
  transform: 'object' | 'array' | 'value' | 'custom';
  
  // Custom transformation function
  handler?: (directive: NginxDirective, context: TransformContext) => any;
  
  // UCL key name (if different from directive name)
  uclKey?: string;
  
  // Whether this directive can have multiple values
  allowMultiple?: boolean;
}

export interface TransformContext {
  // Current nesting level
  level: number;
  
  // Parent directive context
  parent?: NginxDirective;
  
  // Accumulated UCL object
  ucl: any;
  
  // Transform options
  options: UCLTransformOptions;
  
  // Source file information
  sourceFile?: string;
}

export interface UCLMetadata {
  source: string;
  generated: string;
  directives: number;
  files: string[];
  nginx_version?: string;
}

/**
 * nginx-to-UCL Configuration Transformer
 */
export class NginxToUCLTransformer {
  private defaultMappings: Record<string, DirectiveMapping> = {
    // Core directives
    'server': {
      transform: 'object',
      allowMultiple: true
    },
    'location': {
      transform: 'object',
      allowMultiple: true,
      handler: this.transformLocation.bind(this)
    },
    'upstream': {
      transform: 'object',
      allowMultiple: true
    },
    'events': {
      transform: 'object'
    },
    'http': {
      transform: 'object'
    },
    'stream': {
      transform: 'object'
    },
    'mail': {
      transform: 'object'
    },
    
    // Listen directive (special handling)
    'listen': {
      transform: 'array',
      allowMultiple: true,
      handler: this.transformListen.bind(this)
    },
    
    // Server name
    'server_name': {
      transform: 'array',
      allowMultiple: false
    },
    
    // Proxy directives
    'proxy_pass': {
      transform: 'value'
    },
    'proxy_set_header': {
      transform: 'object',
      allowMultiple: true,
      handler: this.transformProxySetHeader.bind(this)
    },
    
    // SSL directives
    'ssl_certificate': {
      transform: 'value'
    },
    'ssl_certificate_key': {
      transform: 'value'
    },
    'ssl_protocols': {
      transform: 'array'
    },
    'ssl_ciphers': {
      transform: 'value'
    },
    
    // Access control
    'allow': {
      transform: 'array',
      allowMultiple: true
    },
    'deny': {
      transform: 'array',
      allowMultiple: true
    },
    
    // Logging
    'access_log': {
      transform: 'value'
    },
    'error_log': {
      transform: 'value'
    },
    
    // Rate limiting
    'limit_req': {
      transform: 'value'
    },
    'limit_conn': {
      transform: 'value'
    },
    
    // Generic value directives
    'root': { transform: 'value' },
    'index': { transform: 'array' },
    'try_files': { transform: 'array' },
    'return': { 
      transform: 'custom',
      handler: this.transformReturn.bind(this)
    },
    'rewrite': {
      transform: 'custom',
      handler: this.transformRewrite.bind(this)
    },
    
    // Worker directives
    'worker_processes': { transform: 'value' },
    'worker_connections': { transform: 'value' },
    'worker_rlimit_nofile': { transform: 'value' },
    
    // Timeouts and buffers
    'client_max_body_size': { transform: 'value' },
    'client_body_timeout': { transform: 'value' },
    'client_header_timeout': { transform: 'value' },
    'keepalive_timeout': { transform: 'value' },
    'send_timeout': { transform: 'value' },
    
    // Gzip
    'gzip': { transform: 'value' },
    'gzip_types': { transform: 'array' },
    'gzip_comp_level': { transform: 'value' },
    
    // Include
    'include': {
      transform: 'array',
      allowMultiple: true
    }
  };

  /**
   * Transform nginx configuration to UCL
   */
  async transform(
    parseResult: NginxParseResult, 
    options: UCLTransformOptions = {}
  ): Promise<string> {
    if (parseResult.status === 'failed') {
      throw new Error(`Cannot transform failed nginx parse: ${parseResult.errors.map(e => e.error).join(', ')}`);
    }

    const context: TransformContext = {
      level: 0,
      ucl: {},
      options: {
        indent: '  ',
        multiline: true,
        sortKeys: false,
        preserveComments: false,
        includeLineNumbers: false,
        generateMetadata: true,
        ...options
      }
    };

    // Process all configuration files
    for (const config of parseResult.config) {
      context.sourceFile = config.file;
      this.transformConfig(config, context);
    }

    // Add metadata if requested
    if (context.options.generateMetadata) {
      context.ucl._metadata = this.generateMetadata(parseResult);
    }

    // Convert to UCL string
    return this.formatUCL(context.ucl, context.options);
  }

  /**
   * Transform a single nginx configuration
   */
  private transformConfig(config: NginxConfig, context: TransformContext): void {
    for (const directive of config.parsed) {
      this.transformDirective(directive, context);
    }
  }

  /**
   * Transform a single nginx directive
   */
  private transformDirective(directive: NginxDirective, context: TransformContext): void {
    const mapping = this.getDirectiveMapping(directive.directive, context.options);
    
    if (!mapping) {
      // Skip unknown directives or add as generic
      if (!context.options.skipDirectives?.includes(directive.directive)) {
        this.addGenericDirective(directive, context);
      }
      return;
    }

    const uclKey = mapping.uclKey || directive.directive;
    
    switch (mapping.transform) {
      case 'object':
        this.transformToObject(directive, uclKey, mapping, context);
        break;
      case 'array':
        this.transformToArray(directive, uclKey, mapping, context);
        break;
      case 'value':
        this.transformToValue(directive, uclKey, mapping, context);
        break;
      case 'custom':
        if (mapping.handler) {
          const result = mapping.handler(directive, context);
          if (result !== undefined) {
            this.setUCLValue(context.ucl, uclKey, result, mapping.allowMultiple);
          }
        }
        break;
    }
  }

  /**
   * Transform directive to UCL object
   */
  private transformToObject(
    directive: NginxDirective, 
    uclKey: string, 
    mapping: DirectiveMapping, 
    context: TransformContext
  ): void {
    const objValue: any = {};
    
    // Add arguments as properties if any
    if (directive.args.length > 0) {
      if (directive.args.length === 1) {
        objValue._name = directive.args[0];
      } else {
        objValue._args = directive.args;
      }
    }

    // Process nested directives
    if (directive.block) {
      const nestedContext = { ...context, level: context.level + 1, ucl: objValue, parent: directive };
      for (const nestedDirective of directive.block) {
        this.transformDirective(nestedDirective, nestedContext);
      }
    }

    // Add line number if requested
    if (context.options.includeLineNumbers) {
      objValue._line = directive.line;
    }

    this.setUCLValue(context.ucl, uclKey, objValue, mapping.allowMultiple);
  }

  /**
   * Transform directive to UCL array
   */
  private transformToArray(
    directive: NginxDirective, 
    uclKey: string, 
    mapping: DirectiveMapping, 
    context: TransformContext
  ): void {
    const arrayValue = directive.args.length > 0 ? directive.args : [];
    this.setUCLValue(context.ucl, uclKey, arrayValue, mapping.allowMultiple);
  }

  /**
   * Transform directive to UCL value
   */
  private transformToValue(
    directive: NginxDirective, 
    uclKey: string, 
    mapping: DirectiveMapping, 
    context: TransformContext
  ): void {
    let value: any;
    
    if (directive.args.length === 0) {
      value = true; // Boolean directive
    } else if (directive.args.length === 1) {
      value = this.parseValue(directive.args[0]);
    } else {
      value = directive.args; // Multiple arguments as array
    }

    this.setUCLValue(context.ucl, uclKey, value, mapping.allowMultiple);
  }

  /**
   * Custom transformer for location directive
   */
  private transformLocation(directive: NginxDirective, context: TransformContext): any {
    const location: any = {};
    
    // Location pattern and modifier
    if (directive.args.length > 0) {
      if (directive.args.length === 1) {
        location.pattern = directive.args[0];
      } else {
        location.modifier = directive.args[0];
        location.pattern = directive.args[1];
      }
    }

    // Process nested directives
    if (directive.block) {
      const nestedContext = { ...context, level: context.level + 1, ucl: location, parent: directive };
      for (const nestedDirective of directive.block) {
        this.transformDirective(nestedDirective, nestedContext);
      }
    }

    return location;
  }

  /**
   * Custom transformer for listen directive
   */
  private transformListen(directive: NginxDirective, context: TransformContext): any {
    if (directive.args.length === 0) return null;

    const listen: any = {};
    const firstArg = directive.args[0];

    // Parse address:port or port
    if (firstArg.includes(':')) {
      const [address, port] = firstArg.split(':');
      listen.address = address;
      listen.port = this.parseValue(port);
    } else if (/^\d+$/.test(firstArg)) {
      listen.port = this.parseValue(firstArg);
    } else {
      listen.address = firstArg;
    }

    // Parse additional parameters
    for (let i = 1; i < directive.args.length; i++) {
      const param = directive.args[i];
      if (param === 'ssl') {
        listen.ssl = true;
      } else if (param === 'http2') {
        listen.http2 = true;
      } else if (param === 'default_server') {
        listen.default_server = true;
      } else if (param.startsWith('backlog=')) {
        listen.backlog = this.parseValue(param.split('=')[1]);
      } else {
        // Store unknown parameters
        if (!listen.options) listen.options = [];
        listen.options.push(param);
      }
    }

    return listen;
  }

  /**
   * Custom transformer for proxy_set_header directive
   */
  private transformProxySetHeader(directive: NginxDirective, context: TransformContext): any {
    if (directive.args.length < 2) return null;

    const headerName = directive.args[0];
    const headerValue = directive.args.slice(1).join(' ');
    
    return { [headerName]: headerValue };
  }

  /**
   * Custom transformer for return directive
   */
  private transformReturn(directive: NginxDirective, context: TransformContext): any {
    if (directive.args.length === 0) return null;

    const returnObj: any = {
      code: this.parseValue(directive.args[0])
    };

    if (directive.args.length > 1) {
      returnObj.url = directive.args.slice(1).join(' ');
    }

    return returnObj;
  }

  /**
   * Custom transformer for rewrite directive
   */
  private transformRewrite(directive: NginxDirective, context: TransformContext): any {
    if (directive.args.length < 2) return null;

    const rewrite: any = {
      regex: directive.args[0],
      replacement: directive.args[1]
    };

    if (directive.args.length > 2) {
      rewrite.flag = directive.args[2];
    }

    return rewrite;
  }

  /**
   * Add generic directive for unknown types
   */
  private addGenericDirective(directive: NginxDirective, context: TransformContext): void {
    let value: any;
    
    if (directive.block && directive.block.length > 0) {
      // Block directive
      value = {};
      const nestedContext = { ...context, level: context.level + 1, ucl: value, parent: directive };
      for (const nestedDirective of directive.block) {
        this.transformDirective(nestedDirective, nestedContext);
      }
    } else if (directive.args.length === 0) {
      value = true;
    } else if (directive.args.length === 1) {
      value = this.parseValue(directive.args[0]);
    } else {
      value = directive.args;
    }

    this.setUCLValue(context.ucl, directive.directive, value, true);
  }

  /**
   * Get directive mapping
   */
  private getDirectiveMapping(directive: string, options: UCLTransformOptions): DirectiveMapping | undefined {
    return options.customMappings?.[directive] || this.defaultMappings[directive];
  }

  /**
   * Set UCL value, handling multiple values
   */
  private setUCLValue(ucl: any, key: string, value: any, allowMultiple?: boolean): void {
    if (allowMultiple && ucl[key] !== undefined) {
      // Convert to array if not already
      if (!Array.isArray(ucl[key])) {
        ucl[key] = [ucl[key]];
      }
      ucl[key].push(value);
    } else {
      ucl[key] = value;
    }
  }

  /**
   * Parse string value to appropriate type
   */
  private parseValue(value: string): any {
    // Try to parse as number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Check for size suffixes (1M, 1k, etc.)
    if (/^\d+[kmgKMG]$/.test(value)) {
      return value; // Keep as string for now
    }

    // Check for time suffixes (1s, 1m, 1h, etc.)
    if (/^\d+[smhdSMHD]$/.test(value)) {
      return value; // Keep as string for now
    }

    // Boolean values
    if (value === 'on' || value === 'true') {
      return true;
    }
    if (value === 'off' || value === 'false') {
      return false;
    }

    // Return as string
    return value;
  }

  /**
   * Generate metadata for the UCL output
   */
  private generateMetadata(parseResult: NginxParseResult): UCLMetadata {
    const files = parseResult.config.map(c => c.file);
    const totalDirectives = parseResult.config.reduce(
      (sum, config) => sum + this.countDirectives(config.parsed), 
      0
    );

    return {
      source: 'nginx-to-edge-js',
      generated: new Date().toISOString(),
      directives: totalDirectives,
      files: files
    };
  }

  /**
   * Count total directives recursively
   */
  private countDirectives(directives: NginxDirective[]): number {
    let count = directives.length;
    for (const directive of directives) {
      if (directive.block) {
        count += this.countDirectives(directive.block);
      }
    }
    return count;
  }

  /**
   * Format UCL object to string
   */
  private formatUCL(ucl: any, options: UCLTransformOptions): string {
    const indent = options.indent || '  ';
    
    if (options.sortKeys) {
      ucl = this.sortObjectKeys(ucl);
    }

    return this.stringifyUCL(ucl, 0, indent, options.multiline);
  }

  /**
   * Sort object keys recursively
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    if (obj !== null && typeof obj === 'object') {
      const sorted: any = {};
      const keys = Object.keys(obj).sort();
      for (const key of keys) {
        sorted[key] = this.sortObjectKeys(obj[key]);
      }
      return sorted;
    }
    
    return obj;
  }

  /**
   * Stringify UCL object to string format
   */
  private stringifyUCL(obj: any, level: number, indent: string, multiline?: boolean): string {
    if (obj === null) return 'null';
    if (obj === undefined) return 'null';
    if (typeof obj === 'boolean') return obj ? 'true' : 'false';
    if (typeof obj === 'number') return obj.toString();
    if (typeof obj === 'string') {
      // Quote strings that need quoting
      if (this.needsQuoting(obj)) {
        return `"${this.escapeString(obj)}"`;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      
      if (!multiline) {
        return '[' + obj.map(item => this.stringifyUCL(item, level, indent, multiline)).join(', ') + ']';
      }

      const currentIndent = indent.repeat(level);
      const itemIndent = indent.repeat(level + 1);
      const items = obj.map(item => itemIndent + this.stringifyUCL(item, level + 1, indent, multiline));
      
      return '[\n' + items.join(',\n') + '\n' + currentIndent + ']';
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';

      if (!multiline) {
        const pairs = keys.map(key => `${key}: ${this.stringifyUCL(obj[key], level, indent, multiline)}`);
        return '{' + pairs.join(', ') + '}';
      }

      const currentIndent = indent.repeat(level);
      const propIndent = indent.repeat(level + 1);
      const properties = keys.map(key => {
        const value = this.stringifyUCL(obj[key], level + 1, indent, multiline);
        return `${propIndent}${key}: ${value}`;
      });

      return '{\n' + properties.join(',\n') + '\n' + currentIndent + '}';
    }

    return String(obj);
  }

  /**
   * Check if string needs quoting in UCL
   */
  private needsQuoting(str: string): boolean {
    // UCL requires quoting for strings with spaces, special characters, etc.
    return /[\s"'{}[\],=]/.test(str) || str === '' || /^[0-9]/.test(str);
  }

  /**
   * Escape string for UCL
   */
  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  }
}

/**
 * Default transformer instance
 */
export const nginxToUCLTransformer = new NginxToUCLTransformer();

/**
 * Convenience function to transform nginx to UCL
 */
export async function transformNginxToUCL(
  parseResult: NginxParseResult, 
  options?: UCLTransformOptions
): Promise<string> {
  return nginxToUCLTransformer.transform(parseResult, options);
}
