#!/usr/bin/env node

import { Command } from 'commander';
import { NginxParser } from '../parser/nginx-parser.js';
import { CloudFlareGenerator } from '../generators/cloudflare.js';
import { NextJSGenerator } from '../generators/nextjs-middleware.js';
import { ParsedNginxConfig } from '../core/config-model.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

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
  .description('Convert nginx.conf (UCL format) to JSON and generate edge server configurations')
  .version('1.0.0');

// Parse command
program
  .command('parse')
  .description('Parse nginx.conf to JSON')
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

// Validate command
program
  .command('validate')
  .description('Validate nginx configuration file')
  .argument('<nginx-config>', 'Path to nginx configuration file')
  .action(async (configPath: string) => {
    try {
      const parser = new NginxParser();
      const config = await parser.parseFile(configPath);
      
      const validation = parser.validate(config);
      
      if (validation.valid) {
        console.log('✅ Configuration is valid');
      } else {
        console.error('❌ Configuration is invalid:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️  Warnings:');
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }

      process.exit(validation.valid ? 0 : 1);
    } catch (error) {
      console.error('❌ Error validating configuration:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

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
