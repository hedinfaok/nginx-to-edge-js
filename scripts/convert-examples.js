#!/usr/bin/env node

/**
 * Batch convert all example nginx configurations to edge functions
 * 
 * Usage:
 *   npm run convert-examples                    # Convert all examples to all platforms
 *   npm run convert-examples:cloudflare         # Convert all examples to CloudFlare Workers
 *   npm run convert-examples:nextjs             # Convert all examples to Next.js Middleware
 *   npm run convert-examples:lambda-edge        # Convert all examples to AWS Lambda@Edge
 *   npm run convert-examples:quickjs            # Convert all examples to QuickJS
 */

import { readdir, stat, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const EXAMPLES_DIR = join(__dirname, '..', 'examples');
const OUTPUT_BASE_DIR = join(__dirname, '..', 'out');
const CLI_PATH = join(__dirname, '..', 'dist', 'src', 'cli', 'index.js');

// Platform configuration
const PLATFORMS = {
  'cloudflare': { ext: '.js', name: 'CloudFlare Workers' },
  'nextjs': { ext: '.ts', name: 'Next.js Middleware' },
  'lambda-edge': { ext: '.js', name: 'AWS Lambda@Edge' },
  'quickjs': { ext: '.js', name: 'QuickJS' }
};

/**
 * Get all .conf files in the examples directory
 */
async function getExampleFiles() {
  try {
    const files = await readdir(EXAMPLES_DIR);
    const confFiles = [];
    
    for (const file of files) {
      if (file.endsWith('.conf')) {
        const filePath = join(EXAMPLES_DIR, file);
        const stats = await stat(filePath);
        if (stats.isFile()) {
          confFiles.push(file);
        }
      }
    }
    
    return confFiles.sort();
  } catch (error) {
    console.error('❌ Error reading examples directory:', error.message);
    process.exit(1);
  }
}

/**
 * Run the CLI command to generate edge function code
 */
async function runGeneration(platform, configFile, outputPath) {
  return new Promise((resolve, reject) => {
    const configPath = join(EXAMPLES_DIR, configFile);
    const args = ['generate', platform, configPath, '--output', outputPath];
    
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Generation failed (exit code ${code}): ${stderr || stdout}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Convert all examples for a specific platform
 */
async function convertExamplesForPlatform(platform) {
  console.log(`\n🚀 Converting examples to ${PLATFORMS[platform].name}...`);
  console.log('='.repeat(60));
  
  const files = await getExampleFiles();
  const outputDir = join(OUTPUT_BASE_DIR, platform);
  
  // Create output directory
  await mkdir(outputDir, { recursive: true });
  
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  
  for (const file of files) {
    const baseName = basename(file, extname(file));
    const outputFile = join(outputDir, `${baseName}${PLATFORMS[platform].ext}`);
    
    try {
      console.log(`📄 Processing ${file}...`);
      const result = await runGeneration(platform, file, outputFile);
      
      console.log(`  ✅ Generated: ${outputFile}`);
      results.push({ file, success: true, outputFile });
      successCount++;
      
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      results.push({ file, success: false, error: error.message });
      failureCount++;
    }
  }
  
  // Summary
  console.log(`\n📊 ${platform.toUpperCase()} Conversion Summary:`);
  console.log(`  ✅ Success: ${successCount}/${files.length}`);
  console.log(`  ❌ Failed: ${failureCount}/${files.length}`);
  console.log(`  📁 Output: ${outputDir}`);
  
  if (failureCount > 0) {
    console.log('\n❌ Failed conversions:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.file}: ${r.error}`);
    });
  }
  
  return { successCount, failureCount, results };
}

/**
 * Convert all examples for all platforms
 */
async function convertAllExamples() {
  console.log('🌟 Converting all examples to all edge platforms...');
  console.log('='.repeat(60));
  
  const files = await getExampleFiles();
  console.log(`📋 Found ${files.length} example configuration files:`);
  files.forEach(file => console.log(`  - ${file}`));
  
  const allResults = {};
  let totalSuccess = 0;
  let totalFailure = 0;
  
  for (const platform of Object.keys(PLATFORMS)) {
    try {
      const result = await convertExamplesForPlatform(platform);
      allResults[platform] = result;
      totalSuccess += result.successCount;
      totalFailure += result.failureCount;
    } catch (error) {
      console.error(`❌ Platform ${platform} failed entirely:`, error.message);
      allResults[platform] = { successCount: 0, failureCount: files.length, error: error.message };
      totalFailure += files.length;
    }
  }
  
  // Overall summary
  console.log('\n🎯 OVERALL CONVERSION SUMMARY');
  console.log('='.repeat(60));
  console.log(`📄 Examples processed: ${files.length}`);
  console.log(`🚀 Platforms: ${Object.keys(PLATFORMS).length}`);
  console.log(`✅ Total successful conversions: ${totalSuccess}`);
  console.log(`❌ Total failed conversions: ${totalFailure}`);
  console.log(`📁 Output directory: ${OUTPUT_BASE_DIR}`);
  
  // Platform breakdown
  console.log('\n📊 Platform Results:');
  Object.entries(allResults).forEach(([platform, result]) => {
    const platformInfo = PLATFORMS[platform];
    console.log(`  ${platformInfo.name}: ${result.successCount}/${files.length} success`);
  });
  
  if (totalFailure > 0) {
    console.log('\n⚠️  Some conversions failed. Check the logs above for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All conversions completed successfully!');
  }
}

/**
 * Main execution
 */
async function main() {
  const platform = process.argv[2];
  
  // Check if built CLI exists
  try {
    await stat(CLI_PATH);
  } catch (error) {
    console.error('❌ CLI not built. Please run: npm run build');
    process.exit(1);
  }
  
  if (!platform) {
    // Convert all platforms
    await convertAllExamples();
  } else if (PLATFORMS[platform]) {
    // Convert specific platform
    const files = await getExampleFiles();
    console.log(`📋 Found ${files.length} example configuration files`);
    await convertExamplesForPlatform(platform);
  } else {
    console.error(`❌ Unknown platform: ${platform}`);
    console.error(`Supported platforms: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}
