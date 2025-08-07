import { readFileSync } from 'fs';
import { ParsedNginxConfig } from '../core/config-model';
import { ConfigTransformer } from '../core/transformer';
import { parseUCL, isLibUCLAvailable, getLibUCLInfo } from './ucl-tool';

export class NginxParser {
  private transformer: ConfigTransformer;

  constructor() {
    this.transformer = new ConfigTransformer();
    
    if (!isLibUCLAvailable()) {
      throw new Error('libucl is required but not available. Please install libucl:\n' +
        '  macOS: brew install libucl\n' +
        '  Ubuntu/Debian: apt-get install libucl-dev\n' +
        '  CentOS/RHEL: yum install libucl-devel');
    }
    
    const info = getLibUCLInfo();
    console.log(`✅ Using libucl ${info.version || 'unknown'} at ${info.path}`);
  }

  /**
   * Parse an nginx configuration file using libucl
   */
  async parseFile(filePath: string): Promise<ParsedNginxConfig> {
    const content = readFileSync(filePath, 'utf8');
    return this.parseString(content, filePath);
  }

  /**
   * Parse nginx configuration from string content
   */
  async parseString(content: string, sourceFile?: string): Promise<ParsedNginxConfig> {
    try {
      // Preprocess nginx config to be UCL-compliant
      const uclContent = this.preprocessNginxToUCL(content);
      
      // Parse using libucl
      const rawConfig = parseUCL(uclContent);
      
      if (!rawConfig) {
        throw new Error('Failed to parse UCL content');
      }

      // Transform the raw UCL object to our structured model
      const nginxConfig = this.transformer.transformUCLToNginx(rawConfig);

      return {
        ...nginxConfig,
        metadata: {
          source_file: sourceFile,
          parsed_at: new Date(),
          parser_version: '1.0.0',
          warnings: []
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse nginx configuration: ${errorMessage}`);
    }
  }

  /**
   * Preprocess nginx configuration to make it UCL-compliant
   * This handles nginx-specific syntax that needs to be converted to UCL format
   */
  private preprocessNginxToUCL(content: string): string {
    let processed = content;

    // Handle nginx variables (convert $var to ${var}) but preserve quoted strings
    // This replacement is more careful about not breaking strings
    processed = processed.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, '\\${$1}');

    // Convert nginx location blocks to UCL format
    processed = this.convertLocationBlocks(processed);

    // Convert nginx server blocks to UCL format
    processed = this.convertServerBlocks(processed);

    // Convert nginx upstream blocks to UCL format
    processed = this.convertUpstreamBlocks(processed);

    // Handle nginx directives without values
    processed = this.handleDirectivesWithoutValues(processed);

    // Ensure proper UCL structure
    if (!processed.trim().startsWith('{')) {
      processed = '{\n' + processed + '\n}';
    }

    return processed;
  }

  private convertLocationBlocks(content: string): string {
    // Simple approach: just convert location declarations, let the block parser handle the rest
    return content.replace(
      /location\s+(~\*?|=|\^~)?\s*([^\s{]+)\s*{/g,
      (match, modifier, path) => {
        const mod = modifier || '';
        const quotedPath = path.startsWith('"') ? path : `"${path}"`;
        
        return `location {
        modifier = "${mod}";
        path = ${quotedPath};`;
      }
    );
  }

  private convertServerBlocks(content: string): string {
    // Convert server blocks to be UCL-compliant
    return content.replace(/server\s*{/g, 'server {');
  }

  private convertUpstreamBlocks(content: string): string {
    // Convert upstream blocks to be UCL-compliant
    return content.replace(/upstream\s+([^\s{]+)\s*{/g, 'upstream "$1" {');
  }

  private handleDirectivesWithoutValues(content: string): string {
    // Handle directives like 'sendfile on;' -> 'sendfile = on;'
    const lines = content.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      // Skip lines that already have assignment operators
      if (trimmed.includes('=') || trimmed.includes('{') || trimmed.includes('}')) {
        return line;
      }

      // Convert directive value; to directive = value;
      const directiveMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+);$/);
      if (directiveMatch) {
        const [, directive, value] = directiveMatch;
        const indent = line.match(/^\s*/)?.[0] || '';
        return `${indent}${directive} = ${value};`;
      }

      return line;
    });

    return processedLines.join('\n');
  }

  /**
   * Export configuration as JSON
   */
  toJSON(config: ParsedNginxConfig, pretty: boolean = true): string {
    return JSON.stringify(config, null, pretty ? 2 : 0);
  }

  /**
   * Validate parsed configuration
   */
  validate(config: ParsedNginxConfig): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation rules
    if (!config.servers || config.servers.length === 0) {
      errors.push('Configuration must contain at least one server block');
    }

    config.servers.forEach((server, index) => {
      if (!server.listen || server.listen.length === 0) {
        errors.push(`Server block ${index} must have at least one listen directive`);
      }

      server.locations.forEach((location, locIndex) => {
        if (!location.path) {
          errors.push(`Location block ${locIndex} in server ${index} must have a path`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

}
