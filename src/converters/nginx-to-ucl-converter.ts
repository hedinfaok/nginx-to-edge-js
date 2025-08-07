/**
 * nginx-to-UCL Converter
 * 
 * Main converter that combines nginx parsing and UCL transformation
 */

import { NginxParser, NginxParserOptions, parseNginxConfig } from './nginx-parser.js';
import { 
  NginxToUCLTransformer, 
  UCLTransformOptions, 
  transformNginxToUCL,
  nginxToUCLTransformer 
} from './nginx-to-ucl-transformer.js';
import { access, readFile, writeFile } from 'fs/promises';
import * as path from 'path';

export interface ConvertOptions {
  // Parser options
  parser?: NginxParserOptions;
  
  // Transformer options
  transformer?: UCLTransformOptions;
  
  // Output options
  outputFile?: string;
  outputFormat?: 'ucl' | 'json';
  
  // Validation options
  validateInput?: boolean;
  validateOutput?: boolean;
  
  // Processing options
  verbose?: boolean;
  dryRun?: boolean;
}

export interface ConvertResult {
  success: boolean;
  ucl?: string;
  inputFiles: string[];
  outputFile?: string;
  stats: {
    inputSize: number;
    outputSize: number;
    directives: number;
    files: number;
    processingTime: number;
  };
  errors?: string[];
  warnings?: string[];
}

/**
 * nginx-to-UCL Converter
 */
export class NginxToUCLConverter {
  private parser: NginxParser;
  private transformer: NginxToUCLTransformer;

  constructor() {
    this.parser = new NginxParser();
    this.transformer = new NginxToUCLTransformer();
  }

  /**
   * Convert nginx configuration file to UCL
   */
  async convertFile(configPath: string, options: ConvertOptions = {}): Promise<ConvertResult> {
    const startTime = Date.now();
    const result: ConvertResult = {
      success: false,
      inputFiles: [],
      stats: {
        inputSize: 0,
        outputSize: 0,
        directives: 0,
        files: 0,
        processingTime: 0
      },
      errors: [],
      warnings: []
    };

    try {
      // Validate input file exists
      await access(configPath);
      const inputContent = await readFile(configPath, 'utf8');
      result.inputFiles.push(configPath);
      result.stats.inputSize = inputContent.length;

      if (options.verbose) {
        console.log(`Converting nginx config: ${configPath}`);
      }

      // Validate input configuration if requested
      if (options.validateInput) {
        const validation = await this.parser.validateConfig(configPath);
        if (!validation.valid) {
          result.errors = validation.errors.map(e => `${e.file}:${e.line}: ${e.error}`);
          return result;
        }
      }

      // Parse nginx configuration
      const parseResult = await this.parser.parseConfig(configPath, options.parser);
      
      // Collect all files processed
      result.inputFiles = parseResult.config.map(c => c.file);
      result.stats.files = result.inputFiles.length;
      
      // Count directives
      result.stats.directives = parseResult.config.reduce(
        (sum, config) => sum + this.countDirectives(config.parsed),
        0
      );

      if (options.verbose) {
        console.log(`Parsed ${result.stats.directives} directives from ${result.stats.files} files`);
      }

      // Transform to UCL
      const uclOutput = await this.transformer.transform(parseResult, options.transformer);
      result.ucl = uclOutput;
      result.stats.outputSize = uclOutput.length;

      // Handle output
      if (options.outputFile && !options.dryRun) {
        await this.writeOutput(uclOutput, options.outputFile, options.outputFormat);
        result.outputFile = options.outputFile;
        
        if (options.verbose) {
          console.log(`Output written to: ${options.outputFile}`);
        }
      }

      result.success = true;
      
    } catch (error) {
      result.errors?.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      result.stats.processingTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Convert nginx configuration string to UCL
   */
  async convertString(
    nginxConfig: string, 
    options: ConvertOptions = {}
  ): Promise<{ ucl: string; stats: ConvertResult['stats'] }> {
    const startTime = Date.now();
    
    // Parse nginx configuration from string
    const parseResult = await this.parser.parseString(nginxConfig, options.parser);
    
    // Transform to UCL
    const ucl = await this.transformer.transform(parseResult, options.transformer);
    
    // Calculate stats
    const stats = {
      inputSize: nginxConfig.length,
      outputSize: ucl.length,
      directives: parseResult.config.reduce(
        (sum, config) => sum + this.countDirectives(config.parsed),
        0
      ),
      files: parseResult.config.length,
      processingTime: Date.now() - startTime
    };

    return { ucl, stats };
  }

  /**
   * Batch convert multiple nginx files
   */
  async convertBatch(
    configPaths: string[], 
    options: ConvertOptions = {}
  ): Promise<ConvertResult[]> {
    const results: ConvertResult[] = [];
    
    for (const configPath of configPaths) {
      if (options.verbose) {
        console.log(`\nProcessing: ${configPath}`);
      }
      
      // Generate output file name if not specified
      let outputFile = options.outputFile;
      if (!outputFile && configPaths.length > 1) {
        const dir = path.dirname(configPath);
        const basename = path.basename(configPath, path.extname(configPath));
        outputFile = path.join(dir, `${basename}.ucl`);
      }
      
      const result = await this.convertFile(configPath, {
        ...options,
        outputFile
      });
      
      results.push(result);
    }
    
    return results;
  }

  /**
   * Validate conversion by round-trip testing
   */
  async validateConversion(configPath: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Parse original nginx config
      const originalParse = await this.parser.parseConfig(configPath);
      
      // Convert to UCL
      const ucl = await this.transformer.transform(originalParse);
      
      // TODO: We could parse the UCL back and compare structures
      // For now, just check that the transformation completed successfully
      
      return { valid: true, errors: [] };
      
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown validation error');
      return { valid: false, errors };
    }
  }

  /**
   * Get conversion statistics for a file
   */
  async getStats(configPath: string): Promise<{
    files: number;
    directives: number;
    size: number;
    complexity: 'low' | 'medium' | 'high';
  }> {
    const parseResult = await this.parser.parseConfig(configPath);
    const directives = parseResult.config.reduce(
      (sum, config) => sum + this.countDirectives(config.parsed),
      0
    );
    
    const content = await readFile(configPath, 'utf8');
    const size = content.length;
    
    // Determine complexity based on directive count and nesting
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (directives > 20) complexity = 'medium';
    if (directives > 100) complexity = 'high';
    
    return {
      files: parseResult.config.length,
      directives,
      size,
      complexity
    };
  }

  /**
   * Preview conversion without writing files
   */
  async preview(configPath: string, options: ConvertOptions = {}): Promise<{
    ucl: string;
    stats: ConvertResult['stats'];
    warnings: string[];
  }> {
    const result = await this.convertFile(configPath, {
      ...options,
      dryRun: true,
      verbose: false
    });
    
    return {
      ucl: result.ucl || '',
      stats: result.stats,
      warnings: result.warnings || []
    };
  }

  /**
   * Count directives recursively
   */
  private countDirectives(directives: any[]): number {
    let count = directives.length;
    for (const directive of directives) {
      if (directive.block) {
        count += this.countDirectives(directive.block);
      }
    }
    return count;
  }

  /**
   * Write output to file
   */
  private async writeOutput(content: string, outputFile: string, format: 'ucl' | 'json' = 'ucl'): Promise<void> {
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    try {
      const fs = await import('fs/promises');
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    if (format === 'json') {
      // Parse UCL back to JSON for JSON output format
      // For now, just wrap in JSON structure
      const jsonOutput = {
        format: 'nginx-to-ucl',
        generated: new Date().toISOString(),
        ucl: content
      };
      await writeFile(outputFile, JSON.stringify(jsonOutput, null, 2), 'utf8');
    } else {
      await writeFile(outputFile, content, 'utf8');
    }
  }
}

/**
 * Default converter instance
 */
export const nginxToUCLConverter = new NginxToUCLConverter();

/**
 * Convenience function to convert nginx file to UCL
 */
export async function convertNginxToUCL(
  configPath: string, 
  options?: ConvertOptions
): Promise<ConvertResult> {
  return nginxToUCLConverter.convertFile(configPath, options);
}

/**
 * Convenience function to convert nginx string to UCL
 */
export async function convertNginxStringToUCL(
  nginxConfig: string,
  options?: ConvertOptions
): Promise<string> {
  const { ucl } = await nginxToUCLConverter.convertString(nginxConfig, options);
  return ucl;
}
