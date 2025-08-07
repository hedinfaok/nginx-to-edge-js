#!/usr/bin/env node

import { Command } from 'commander';
import { NginxParser } from '../parser/nginx-parser.js';
import { CloudFlareGenerator } from '../generators/cloudflare.js';
import { NextJSGenerator } from '../generators/nextjs-middleware.js';
import { ParsedNginxConfig } from '../core/config-model.js';
import { parseUCL, testLibUCL, isLibUCLAvailable } from '../parser/ucl-tool.js';
import { 
  convertNginxToUCL, 
  nginxToUCLConverter, 
  type ConvertOptions 
} from '../converters/nginx-to-ucl-converter.js';
import { nginxParser } from '../converters/nginx-parser.js';
import { writeFileSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import { dirname, join } from 'path';
import * as path from 'path';

interface ParseOptions {
  output?: string;
  pretty?: boolean;
}

interface GenerateOptions {
  output?: string;
  outputDir?: string;
  platform: string;
}

const program = new Command();

program
  .name('nginx-to-edge-js')
  .description('Comprehensive nginx configuration toolkit: parse, convert, and generate edge server configurations')
  .version('1.0.0');

// === UCL PARSING COMMANDS ===

// Parse UCL command
program
  .command('parse-ucl')
  .description('Parse UCL configuration file using FFI')
  .argument('<file>', 'UCL file to parse')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .option('--validate', 'Validate UCL syntax only', false)
  .action(async (file: string, options: { format: string; validate: boolean }) => {
    try {
      console.log(`Parsing UCL file: ${file}`);
      
      if (options.validate) {
        // Just validate syntax
        const content = await fs.readFile(file, 'utf8');
        const isValid = parseUCL(content) !== null;
        console.log(`Validation: ${isValid ? 'VALID' : 'INVALID'}`);
        process.exit(isValid ? 0 : 1);
      }
      
      const content = await fs.readFile(file, 'utf8');
      const result = parseUCL(content);
      
      if (result === null) {
        console.error('Failed to parse UCL file');
        process.exit(1);
      }
      
      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('UCL Parse Result:');
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Original parse command (for nginx UCL format)
program
  .command('parse')
  .description('Parse nginx.conf (UCL format) to JSON')
  .argument('<nginx-config>', 'Path to nginx configuration file')
  .option('-o, --output <file>', 'Output JSON file path')
  .option('-p, --pretty', 'Pretty print JSON output', false)
  .action(async (configPath: string, options: ParseOptions) => {
    try {
      const parser = new NginxParser();
      const config = await parser.parseFile(configPath);
      
      if (options.output) {
        mkdirSync(dirname(options.output), { recursive: true });
        writeFileSync(options.output, JSON.stringify(config, null, options.pretty ? 2 : 0));
        console.log(`✅ Configuration parsed and saved to ${options.output}`);
      } else {
        console.log(JSON.stringify(config, null, options.pretty ? 2 : 0));
      }
    } catch (error) {
      console.error('❌ Error parsing nginx configuration:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// === NGINX-TO-UCL CONVERSION COMMANDS ===

// Convert standard nginx to UCL command
program
  .command('nginx-to-ucl')
  .description('Convert standard nginx configuration to UCL format')
  .argument('<nginx-config>', 'nginx configuration file to convert')
  .option('-o, --output <file>', 'Output file (default: <input>.ucl)')
  .option('-f, --format <format>', 'Output format (ucl|json)', 'ucl')
  .option('--single-file', 'Parse only the main file, ignore includes', false)
  .option('--include-comments', 'Include comments in the output', false)
  .option('--strict', 'Strict parsing mode', false)
  .option('--ignore <directives>', 'Comma-separated list of directives to ignore')
  .option('--indent <spaces>', 'Number of spaces for indentation', '2')
  .option('--no-multiline', 'Output in compact format')
  .option('--sort-keys', 'Sort object keys alphabetically', false)
  .option('--no-metadata', 'Exclude metadata from output')
  .option('--validate-input', 'Validate nginx configuration before conversion', false)
  .option('--dry-run', 'Show output without writing files', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (nginxConfig: string, options: any) => {
    try {
      if (options.verbose) {
        console.log('nginx-to-UCL Converter');
        console.log('=====================');
        console.log(`Input: ${nginxConfig}`);
      }

      // Check if crossplane is available
      const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
      if (!crossplaneAvailable) {
        console.error('Error: crossplane is not installed or not in PATH');
        console.error('Install with: pip install crossplane');
        process.exit(1);
      }

      // Prepare conversion options
      const convertOptions: ConvertOptions = {
        parser: {
          singleFile: options.singleFile,
          includeComments: options.includeComments,
          strict: options.strict,
          ignoreDirectives: options.ignore ? options.ignore.split(',') : undefined,
          indent: parseInt(options.indent, 10)
        },
        transformer: {
          indent: ' '.repeat(parseInt(options.indent, 10)),
          multiline: !options.noMultiline,
          sortKeys: options.sortKeys,
          generateMetadata: !options.noMetadata
        },
        outputFormat: options.format as 'ucl' | 'json',
        validateInput: options.validateInput,
        dryRun: options.dryRun,
        verbose: options.verbose
      };

      // Determine output file
      let outputFile = options.output;
      if (!outputFile && !options.dryRun) {
        const ext = options.format === 'json' ? '.json' : '.ucl';
        outputFile = path.join(
          path.dirname(nginxConfig),
          path.basename(nginxConfig, path.extname(nginxConfig)) + ext
        );
      }

      if (outputFile && !options.dryRun) {
        convertOptions.outputFile = outputFile;
      }

      // Perform conversion
      const result = await nginxToUCLConverter.convertFile(nginxConfig, convertOptions);

      if (result.success) {
        if (options.dryRun) {
          console.log('Conversion Preview:');
          console.log('==================');
          console.log(result.ucl);
          
          if (options.verbose && result.stats) {
            console.log('\nConversion Statistics:');
            console.log(`Directives: ${result.stats.directives}`);
            console.log(`Files: ${result.stats.files}`);
            console.log(`Processing time: ${result.stats.processingTime}ms`);
          }
        } else {
          console.log(`✅ Conversion successful: ${outputFile}`);
          
          if (options.verbose && result.stats) {
            console.log(`📊 Processed ${result.stats.directives} directives from ${result.stats.files} file(s)`);
            console.log(`⏱️  Processing time: ${result.stats.processingTime}ms`);
          }
        }
      } else {
        console.error('❌ Conversion failed:');
        if (result.errors) {
          result.errors.forEach(error => console.error(`  - ${error}`));
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during conversion:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Batch convert command
program
  .command('batch-convert')
  .description('Convert multiple nginx configuration files to UCL')
  .argument('<files...>', 'nginx configuration files to convert')
  .option('-d, --output-dir <dir>', 'Output directory (default: same as input files)')
  .option('-f, --format <format>', 'Output format (ucl|json)', 'ucl')
  .option('--single-file', 'Parse only the main files, ignore includes', false)
  .option('--include-comments', 'Include comments in the output', false)
  .option('--strict', 'Strict parsing mode', false)
  .option('--ignore <directives>', 'Comma-separated list of directives to ignore')
  .option('--indent <spaces>', 'Number of spaces for indentation', '2')
  .option('--no-multiline', 'Output in compact format')
  .option('--sort-keys', 'Sort object keys alphabetically', false)
  .option('--no-metadata', 'Exclude metadata from output')
  .option('--validate-input', 'Validate nginx configuration before conversion', false)
  .option('--dry-run', 'Show output without writing files', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (files: string[], options: any) => {
    try {
      // Check if crossplane is available
      const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
      if (!crossplaneAvailable) {
        console.error('Error: crossplane is not installed or not in PATH');
        console.error('Install with: pip install crossplane');
        process.exit(1);
      }

      console.log(`Converting ${files.length} file(s)...`);

      // Prepare conversion options
      const convertOptions: ConvertOptions = {
        parser: {
          singleFile: options.singleFile,
          includeComments: options.includeComments,
          strict: options.strict,
          ignoreDirectives: options.ignore ? options.ignore.split(',') : undefined,
          indent: parseInt(options.indent, 10)
        },
        transformer: {
          indent: ' '.repeat(parseInt(options.indent, 10)),
          multiline: !options.noMultiline,
          sortKeys: options.sortKeys,
          generateMetadata: !options.noMetadata
        },
        outputFormat: options.format as 'ucl' | 'json',
        validateInput: options.validateInput,
        dryRun: options.dryRun,
        verbose: options.verbose
      };

      // Process each file
      const results = await nginxToUCLConverter.convertBatch(files, convertOptions);
      
      let successCount = 0;
      let failureCount = 0;

      for (const result of results) {
        if (result.success) {
          successCount++;
          if (options.verbose) {
            console.log(`✅ ${result.inputFiles[0]} → ${result.outputFile || 'preview'}`);
          }
        } else {
          failureCount++;
          console.error(`❌ Failed to convert ${result.inputFiles[0]}:`);
          if (result.errors) {
            result.errors.forEach(error => console.error(`  - ${error}`));
          }
        }
      }

      console.log(`\nBatch conversion complete: ${successCount} succeeded, ${failureCount} failed`);
      
      if (failureCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during batch conversion:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// === ADDITIONAL CONVERSION COMMANDS ===

// Preview conversion command
program
  .command('preview')
  .description('Preview nginx to UCL conversion without writing files')
  .argument('<nginx-config>', 'nginx configuration file to preview')
  .option('--single-file', 'Parse only the main file, ignore includes', false)
  .option('--include-comments', 'Include comments in the output', false)
  .option('--strict', 'Strict parsing mode', false)
  .option('--ignore <directives>', 'Comma-separated list of directives to ignore')
  .option('--indent <spaces>', 'Number of spaces for indentation', '2')
  .option('--no-multiline', 'Output in compact format')
  .option('--sort-keys', 'Sort object keys alphabetically', false)
  .option('-f, --format <format>', 'Output format (ucl|json)', 'ucl')
  .action(async (nginxConfig: string, options: any) => {
    try {
      // Check if crossplane is available
      const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
      if (!crossplaneAvailable) {
        console.error('Error: crossplane is not installed or not in PATH');
        console.error('Install with: pip install crossplane');
        process.exit(1);
      }

      const convertOptions: ConvertOptions = {
        parser: {
          singleFile: options.singleFile,
          includeComments: options.includeComments,
          strict: options.strict,
          ignoreDirectives: options.ignore ? options.ignore.split(',') : undefined,
          indent: parseInt(options.indent, 10)
        },
        transformer: {
          indent: ' '.repeat(parseInt(options.indent, 10)),
          multiline: !options.noMultiline,
          sortKeys: options.sortKeys
        },
        outputFormat: options.format as 'ucl' | 'json',
        dryRun: true,
        verbose: false
      };

      const preview = await nginxToUCLConverter.preview(nginxConfig, convertOptions);
      
      console.log('Conversion Preview:');
      console.log('==================');
      console.log(preview.ucl);
      
      console.log('\nStatistics:');
      console.log(`Directives: ${preview.stats.directives}`);
      console.log(`Files: ${preview.stats.files}`);
      console.log(`Processing time: ${preview.stats.processingTime}ms`);
      
      if (preview.warnings.length > 0) {
        console.log('\nWarnings:');
        preview.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
      }
    } catch (error) {
      console.error('❌ Error generating preview:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Statistics command
program
  .command('stats')
  .description('Show statistics for nginx configuration')
  .argument('<nginx-config>', 'nginx configuration file to analyze')
  .option('--single-file', 'Parse only the main file, ignore includes', false)
  .action(async (nginxConfig: string, options: any) => {
    try {
      // Check if crossplane is available
      const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
      if (!crossplaneAvailable) {
        console.error('Error: crossplane is not installed or not in PATH');
        console.error('Install with: pip install crossplane');
        process.exit(1);
      }

      const stats = await nginxToUCLConverter.getStats(nginxConfig);
      
      console.log('nginx Configuration Statistics:');
      console.log('===============================');
      console.log(`Files: ${stats.files}`);
      console.log(`Total directives: ${stats.directives}`);
      console.log(`Configuration size: ${stats.size} bytes`);
      console.log(`Complexity: ${stats.complexity.toUpperCase()}`);
      
      // Additional analysis
      if (stats.complexity === 'high') {
        console.log('\n💡 Tips for high complexity configurations:');
        console.log('  - Consider breaking into smaller files');
        console.log('  - Review for duplicate directives');
        console.log('  - Use includes for common configurations');
      }
    } catch (error) {
      console.error('❌ Error analyzing configuration:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Validate command - supports both nginx and UCL files
program
  .command('validate')
  .description('Validate nginx or UCL configuration files')
  .argument('<file>', 'Configuration file to validate')
  .option('--type <type>', 'File type (nginx|ucl|auto)', 'auto')
  .action(async (file: string, options: { type: string }) => {
    try {
      const ext = path.extname(file).toLowerCase();
      let fileType = options.type;
      
      // Auto-detect file type if not specified
      if (fileType === 'auto') {
        if (ext === '.ucl') {
          fileType = 'ucl';
        } else if (ext === '.conf' || path.basename(file).includes('nginx')) {
          fileType = 'nginx';
        } else {
          // Try to detect by content
          const content = await fs.readFile(file, 'utf8');
          if (content.includes('{') && content.includes('=')) {
            fileType = 'ucl';
          } else {
            fileType = 'nginx';
          }
        }
      }

      console.log(`Validating ${fileType.toUpperCase()} file: ${file}`);

      if (fileType === 'ucl') {
        // Validate UCL file
        const content = await fs.readFile(file, 'utf8');
        const result = parseUCL(content);
        
        if (result !== null) {
          console.log('✅ UCL file is valid');
        } else {
          console.log('❌ UCL file has syntax errors');
          process.exit(1);
        }
      } else if (fileType === 'nginx') {
        // Validate nginx file
        const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
        if (!crossplaneAvailable) {
          console.error('Error: crossplane is not installed or not in PATH');
          console.error('Install with: pip install crossplane');
          process.exit(1);
        }

        const validation = await nginxParser.validateConfig(file);
        
        if (validation.valid) {
          console.log('✅ nginx configuration is valid');
        } else {
          console.log('❌ nginx configuration has errors:');
          validation.errors.forEach(error => {
            console.log(`  Line ${error.line}: ${error.error}`);
          });
          process.exit(1);
        }
      } else {
        console.error('❌ Unsupported file type. Use --type nginx or --type ucl');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error validating file:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// === SYSTEM COMMANDS ===

// Test command
program
  .command('test')
  .description('Test system integrations (FFI libucl, crossplane)')
  .option('--libucl-only', 'Test only libucl FFI integration', false)
  .option('--crossplane-only', 'Test only crossplane integration', false)
  .action(async (options: { libuclOnly: boolean; crossplaneOnly: boolean }) => {
    console.log('System Integration Test');
    console.log('======================');
    
    let allPassed = true;

    // Test libucl FFI
    if (!options.crossplaneOnly) {
      console.log('\n🔧 Testing libucl FFI integration...');
      
      const libuclAvailable = isLibUCLAvailable();
      console.log(`LibUCL availability: ${libuclAvailable ? '✅' : '❌'}`);
      
      if (libuclAvailable) {
        const testResult = testLibUCL();
        console.log(`LibUCL test: ${testResult.success ? '✅' : '❌'}`);
        
        if (!testResult.success) {
          console.error(`Error: ${testResult.error}`);
          allPassed = false;
        } else {
          console.log('Sample parse result:', JSON.stringify(testResult.result, null, 2));
        }
      } else {
        allPassed = false;
      }
    }

    // Test crossplane
    if (!options.libuclOnly) {
      console.log('\n🔧 Testing crossplane integration...');
      
      const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
      console.log(`Crossplane availability: ${crossplaneAvailable ? '✅' : '❌'}`);
      
      if (!crossplaneAvailable) {
        console.log('💡 Install crossplane with: pip install crossplane');
        allPassed = false;
      } else {
        try {
          // Test basic crossplane functionality
          const testConfig = `
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name example.com;
    }
}
`;
          const result = await nginxParser.parseString(testConfig);
          console.log(`Crossplane test: ${result.status === 'ok' ? '✅' : '❌'}`);
          
          if (result.status !== 'ok') {
            allPassed = false;
          }
        } catch (error) {
          console.log('Crossplane test: ❌');
          console.error('Error:', error instanceof Error ? error.message : String(error));
          allPassed = false;
        }
      }
    }

    console.log(`\n${allPassed ? '✅' : '❌'} Overall status: ${allPassed ? 'All tests passed' : 'Some tests failed'}`);
    process.exit(allPassed ? 0 : 1);
  });

// Check command
program
  .command('check')
  .description('Check system dependencies and installation status')
  .action(async () => {
    console.log('System Dependencies Check:');
    console.log('=========================');
    
    // Check libucl FFI
    const libuclAvailable = isLibUCLAvailable();
    console.log(`libucl FFI: ${libuclAvailable ? '✅' : '❌'} ${libuclAvailable ? 'Available' : 'Not available'}`);
    
    if (!libuclAvailable) {
      console.log('\nTo install libucl:');
      console.log('  macOS: brew install libucl');
      console.log('  Ubuntu: apt-get install libucl-dev');
      console.log('  CentOS/RHEL: yum install libucl-devel');
    }

    // Check crossplane
    const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
    console.log(`crossplane: ${crossplaneAvailable ? '✅' : '❌'} ${crossplaneAvailable ? 'Available' : 'Not available'}`);
    
    if (!crossplaneAvailable) {
      console.log('\nTo install crossplane:');
      console.log('  pip install crossplane');
    }

    const allGood = libuclAvailable && crossplaneAvailable;
    console.log(`\nOverall status: ${allGood ? '✅' : '❌'} ${allGood ? 'All dependencies available' : 'Missing dependencies'}`);
    
    process.exit(allGood ? 0 : 1);
  });

// === EDGE SERVER GENERATION COMMANDS ===

// Generate command
program
  .command('generate')
  .description('Generate edge server configuration from nginx.conf')
  .argument('<platform>', 'Target platform (cloudflare, nextjs, lambda-edge, all)')
  .argument('<nginx-config>', 'Path to nginx configuration file')
  .option('-o, --output <file>', 'Output file path')
  .option('-d, --output-dir <dir>', 'Output directory for multiple files')
  .action(async (platform: string, configPath: string, options: GenerateOptions) => {
    try {
      const parser = new NginxParser();
      const config = await parser.parseFile(configPath);
      
      const validation = parser.validate(config);
      if (!validation.valid) {
        console.error('❌ Validation failed:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      if (platform === 'all') {
        await generateAll(config, options.outputDir || './edge-configs');
      } else {
        await generateSingle(platform, config, options.output);
      }
    } catch (error) {
      console.error('❌ Error generating configuration:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// === HELPER FUNCTIONS ===

async function generateSingle(platform: string, config: ParsedNginxConfig, outputPath?: string): Promise<void> {
  let generator;
  let defaultFilename: string;

  switch (platform.toLowerCase()) {
    case 'cloudflare':
    case 'cf':
      generator = new CloudFlareGenerator(config);
      defaultFilename = 'worker.js';
      break;
    
    case 'nextjs':
    case 'next':
      generator = new NextJSGenerator(config);
      defaultFilename = 'middleware.ts';
      break;
    
    case 'lambda-edge':
    case 'lambda':
      throw new Error('Lambda@Edge generator not yet implemented');
    
    default:
      throw new Error(`Unknown platform: ${platform}. Supported: cloudflare, nextjs, lambda-edge`);
  }

  const validation = generator.validate();
  if (!validation.valid) {
    console.error('❌ Platform validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Platform validation failed');
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  Platform warnings:');
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  const code = generator.generate();
  const output = outputPath || defaultFilename;
  
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, code);
  
  console.log(`✅ ${platform} configuration written to: ${output}`);
}

async function generateAll(config: ParsedNginxConfig, outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  const platforms = [
    { name: 'cloudflare', generator: CloudFlareGenerator, filename: 'worker.js' },
    { name: 'nextjs', generator: NextJSGenerator, filename: 'middleware.ts' }
  ];

  console.log(`📁 Generating all configurations in: ${outputDir}`);

  for (const platform of platforms) {
    try {
      const generator = new platform.generator(config);
      
      const validation = generator.validate();
      if (validation.warnings.length > 0) {
        console.warn(`⚠️  ${platform.name} warnings:`);
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }

      if (validation.valid) {
        const code = generator.generate();
        const outputPath = join(outputDir, platform.filename);
        writeFileSync(outputPath, code);
        console.log(`✅ ${platform.name}: ${platform.filename}`);
      } else {
        console.error(`❌ ${platform.name} validation failed:`);
        validation.errors.forEach(error => console.error(`  - ${error}`));
      }
    } catch (error) {
      console.error(`❌ Error generating ${platform.name}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

// Parse command line arguments
program.parse();
