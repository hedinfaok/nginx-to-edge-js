#!/usr/bin/env node

import { Command } from 'commander';
import { nginxParser } from '../converters/nginx-parser.js';
import { CloudFlareGenerator } from '../generators/cloudflare.js';
import { NextJSGenerator } from '../generators/nextjs-middleware.js';
import { LambdaEdgeGenerator } from '../generators/lambda-edge.js';
import { QuickJSGenerator } from '../generators/quickjs.js';
import { ParsedNginxConfig, NginxConfig, ServerBlock, LocationBlock } from '../core/config-model.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

interface ParseOptions {
  output?: string;
  pretty?: boolean;
}

interface GenerateOptions {
  output?: string;
  outputDir?: string;
}

const program = new Command();

program
  .name('nginx-to-edge-js')
  .description('Convert nginx configurations to edge server code using crossplane')
  .version('1.0.0');

// Check crossplane availability
async function checkCrossplane(): Promise<boolean> {
  const available = await nginxParser.isCrossplaneAvailable();
  if (!available) {
    console.error('❌ crossplane is not installed or not in PATH');
    console.error('Install with: pip install crossplane');
    console.error('Or via pipx: pipx install crossplane');
    process.exit(1);
  }
  return true;
}

// Convert crossplane parse result to ParsedNginxConfig
function convertCrossplaneToConfig(parseResult: any): ParsedNginxConfig {
  const config: NginxConfig = {
    servers: [],
    upstreams: [],
    global: {}
  };

  if (parseResult.config && parseResult.config.length > 0) {
    const nginxConfig = parseResult.config[0];
    if (nginxConfig.parsed) {
      for (const directive of nginxConfig.parsed) {
        if (directive.directive === 'http' && directive.block) {
          for (const httpDirective of directive.block) {
            if (httpDirective.directive === 'server') {
              const server = convertServerBlock(httpDirective);
              config.servers.push(server);
            } else if (httpDirective.directive === 'upstream') {
              // Handle upstream blocks later if needed
            }
          }
        } else if (directive.directive === 'server') {
          // Server block at top level
          const server = convertServerBlock(directive);
          config.servers.push(server);
        }
      }
    }
  }

  return {
    ...config,
    metadata: {
      parsed_at: new Date(),
      parser_version: 'crossplane-1.0.0',
      warnings: []
    }
  };
}

function convertServerBlock(directive: any): ServerBlock {
  const server: ServerBlock = {
    listen: [],
    locations: []
  };

  if (directive.block) {
    for (const serverDirective of directive.block) {
      switch (serverDirective.directive) {
        case 'listen': {
          const port = parseInt(serverDirective.args[0] || '80', 10);
          server.listen.push({ port });
          break;
        }
        case 'server_name':
          server.server_name = serverDirective.args;
          break;
        case 'location': {
          const location = convertLocationBlock(serverDirective);
          server.locations.push(location);
          break;
        }
      }
    }
  }

  return server;
}

function convertLocationBlock(directive: any): LocationBlock {
  const path = directive.args[0] || '/';
  const location: LocationBlock = {
    path,
    directives: {}
  };

  if (directive.block) {
    for (const locationDirective of directive.block) {
      switch (locationDirective.directive) {
        case 'proxy_pass':
          location.directives.proxy_pass = locationDirective.args[0];
          break;
        case 'return':
          location.directives.return = {
            code: parseInt(locationDirective.args[0], 10),
            url: locationDirective.args[1]
          };
          break;
        case 'root':
          location.directives.root = locationDirective.args[0];
          break;
        case 'expires':
          location.directives.expires = locationDirective.args[0];
          break;
        case 'add_header':
          if (!location.directives.add_header) {
            location.directives.add_header = {};
          }
          location.directives.add_header[locationDirective.args[0]] = locationDirective.args[1];
          break;
      }
    }
  }

  return location;
}

// Parse command
program
  .command('parse')
  .description('Parse nginx configuration to JSON using crossplane')
  .argument('<file>', 'nginx configuration file')
  .option('-o, --output <file>', 'output JSON file')
  .option('--pretty', 'pretty print JSON output')
  .action(async (file: string, options: ParseOptions) => {
    try {
      await checkCrossplane();
      
      console.log(`📄 Parsing ${file} with crossplane...`);
      
      const result = await nginxParser.parseConfig(file);
      
      if (result.status === 'failed') {
        console.error('❌ Parsing failed:');
        result.errors.forEach((error: any) => {
          console.error(`  ${error.file}:${error.line}: ${error.error}`);
        });
        process.exit(1);
      }
      
      const jsonOutput = options.pretty 
        ? JSON.stringify(result, null, 2)
        : JSON.stringify(result);
        
      if (options.output) {
        const outputDir = dirname(options.output);
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(options.output, jsonOutput);
        console.log(`✅ Parsed configuration saved to ${options.output}`);
      } else {
        console.log(jsonOutput);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate nginx configuration using crossplane')
  .argument('<file>', 'nginx configuration file')
  .action(async (file: string) => {
    try {
      await checkCrossplane();
      
      console.log(`📄 Validating ${file} with crossplane...`);
      
      const result = await nginxParser.validateConfig(file);
      
      if (result.valid) {
        console.log('✅ Configuration is valid');
      } else {
        console.error('❌ Configuration validation failed:');
        result.errors.forEach((error: any) => {
          console.error(`  ${error.file}:${error.line}: ${error.error}`);
        });
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Generate command
program
  .command('generate')
  .description('Generate edge platform code from nginx configuration')
  .argument('<platform>', 'target platform (cloudflare, nextjs, lambda-edge, quickjs, all)')
  .argument('<file>', 'nginx configuration file')
  .option('-o, --output <file>', 'output file path')
  .option('-d, --output-dir <dir>', 'output directory (for "all" platform)')
  .action(async (platform: string, file: string, options: GenerateOptions) => {
    try {
      await checkCrossplane();
      
      console.log(`📄 Parsing ${file} with crossplane...`);
      
      // Parse nginx config
      const parseResult = await nginxParser.parseConfig(file);
      
      if (parseResult.status === 'failed') {
        // Filter out non-critical errors for generation purposes
        const criticalErrors = parseResult.errors.filter((error: any) => 
          !error.error.includes('No such file or directory') &&
          !error.error.includes('mime.types') &&
          !error.error.includes('unknown directive') &&
          !error.error.includes('more_set_headers')
        );
        
        if (criticalErrors.length > 0) {
          console.error('❌ Critical parsing errors:');
          criticalErrors.forEach((error: any) => {
            console.error(`  ${error.file}:${error.line}: ${error.error}`);
          });
          process.exit(1);
        }
        
        // If only non-critical errors, continue with generation
        console.log('⚠️  Non-critical parsing warnings (continuing with generation):');
        parseResult.errors.forEach((error: any) => {
          console.log(`  ${error.file}:${error.line}: ${error.error}`);
        });
      }
      
      // Transform crossplane JSON to our config model
      const transformedConfig = convertCrossplaneToConfig(parseResult);
      
      if (platform === 'all') {
        // Generate all platforms
        const outputDir = options.outputDir || './output';
        mkdirSync(outputDir, { recursive: true });
        
        console.log(`🚀 Generating all platforms...`);
        
        // CloudFlare Workers
        try {
          const cfGenerator = new CloudFlareGenerator(transformedConfig);
          const cfCode = cfGenerator.generate();
          const cfPath = join(outputDir, 'worker.js');
          writeFileSync(cfPath, cfCode);
          console.log(`✅ CloudFlare Workers: ${cfPath}`);
        } catch (error) {
          console.error(`❌ CloudFlare generation failed: ${error instanceof Error ? error.message : error}`);
        }
        
        // Next.js Middleware
        try {
          const nextGenerator = new NextJSGenerator(transformedConfig);
          const nextCode = nextGenerator.generate();
          const nextPath = join(outputDir, 'middleware.ts');
          writeFileSync(nextPath, nextCode);
          console.log(`✅ Next.js Middleware: ${nextPath}`);
        } catch (error) {
          console.error(`❌ Next.js generation failed: ${error instanceof Error ? error.message : error}`);
        }
        
        // AWS Lambda@Edge
        try {
          const lambdaGenerator = new LambdaEdgeGenerator(transformedConfig);
          const lambdaCode = lambdaGenerator.generate();
          const lambdaPath = join(outputDir, 'lambda-edge.js');
          writeFileSync(lambdaPath, lambdaCode);
          console.log(`✅ AWS Lambda@Edge: ${lambdaPath}`);
        } catch (error) {
          console.error(`❌ Lambda@Edge generation failed: ${error instanceof Error ? error.message : error}`);
        }
        
        // QuickJS
        try {
          const quickjsGenerator = new QuickJSGenerator(transformedConfig);
          const quickjsCode = quickjsGenerator.generate();
          const quickjsPath = join(outputDir, 'quickjs.js');
          writeFileSync(quickjsPath, quickjsCode);
          console.log(`✅ QuickJS: ${quickjsPath}`);
        } catch (error) {
          console.error(`❌ QuickJS generation failed: ${error instanceof Error ? error.message : error}`);
        }
        
      } else if (platform === 'cloudflare') {
        // Generate CloudFlare Workers
        console.log(`🚀 Generating CloudFlare Workers...`);
        
        const generator = new CloudFlareGenerator(transformedConfig);
        const code = generator.generate();
        
        const outputPath = options.output || 'worker.js';
        const outputDir = dirname(outputPath);
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputPath, code);
        
        console.log(`✅ CloudFlare Workers code generated: ${outputPath}`);
        
      } else if (platform === 'nextjs') {
        // Generate Next.js Middleware
        console.log(`🚀 Generating Next.js Middleware...`);
        
        const generator = new NextJSGenerator(transformedConfig);
        const code = generator.generate();
        
        const outputPath = options.output || 'middleware.ts';
        const outputDir = dirname(outputPath);
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputPath, code);
        
        console.log(`✅ Next.js Middleware code generated: ${outputPath}`);
        
      } else if (platform === 'lambda-edge') {
        // Generate AWS Lambda@Edge
        console.log(`🚀 Generating AWS Lambda@Edge...`);
        
        const generator = new LambdaEdgeGenerator(transformedConfig);
        const code = generator.generate();
        
        const outputPath = options.output || 'lambda-edge.js';
        const outputDir = dirname(outputPath);
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputPath, code);
        
        console.log(`✅ AWS Lambda@Edge code generated: ${outputPath}`);
        
      } else if (platform === 'quickjs') {
        // Generate QuickJS
        console.log(`🚀 Generating QuickJS code...`);
        
        const generator = new QuickJSGenerator(transformedConfig);
        const code = generator.generate();
        
        const outputPath = options.output || 'quickjs.js';
        const outputDir = dirname(outputPath);
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputPath, code);
        
        console.log(`✅ QuickJS code generated: ${outputPath}`);
        
      } else {
        console.error(`❌ Unknown platform: ${platform}`);
        console.error('Supported platforms: cloudflare, nextjs, lambda-edge, quickjs, all');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Check command
program
  .command('check')
  .description('Check system dependencies')
  .action(async () => {
    console.log('🔍 Checking dependencies...\n');
    
    // Check Node.js
    console.log(`✅ Node.js: ${process.version}`);
    
    // Check crossplane
    const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
    if (crossplaneAvailable) {
      console.log('✅ crossplane: Available');
    } else {
      console.log('❌ crossplane: Not found');
      console.log('   Install with: pip install crossplane');
    }
    
    console.log('\n📋 System Status:');
    if (crossplaneAvailable) {
      console.log('✅ Ready to process nginx configurations');
    } else {
      console.log('❌ Please install crossplane to continue');
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Test crossplane integration')
  .action(async () => {
    console.log('🧪 Testing crossplane integration...\n');
    
    const crossplaneAvailable = await nginxParser.isCrossplaneAvailable();
    if (!crossplaneAvailable) {
      console.log('❌ crossplane not available');
      process.exit(1);
    }
    
    try {
      const testConfig = `
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name example.com;
        
        location / {
            proxy_pass http://backend:3000;
        }
    }
}`;

      console.log('📄 Testing nginx configuration parsing...');
      const result = await nginxParser.parseString(testConfig);
      
      if (result.status === 'ok') {
        console.log('✅ crossplane parsing test passed');
        console.log(`   Parsed ${result.config.length} configuration block(s)`);
      } else {
        console.log('❌ crossplane parsing test failed');
        result.errors.forEach((error: any) => {
          console.log(`   Error: ${error.error}`);
        });
      }
      
    } catch (error) {
      console.log('❌ Test failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
