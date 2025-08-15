import { describe, it, expect } from '@jest/globals';
import { validateNginxConfig } from '../../src/converters/nginx-parser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Example Configuration Files', () => {
  const examplesDir = path.join(process.cwd(), 'examples');
  
  // Get all .conf files in the examples directory
  const getExampleFiles = async (): Promise<string[]> => {
    const files = await fs.readdir(examplesDir);
    return files.filter(file => file.endsWith('.conf')).sort();
  };

  describe('Crossplane Parsing Validation', () => {
    it('should successfully parse all example configuration files', async () => {
      const exampleFiles = await getExampleFiles();
      expect(exampleFiles.length).toBeGreaterThan(0);
      
      const results: Array<{ file: string; success: boolean; error?: string }> = [];
      
      for (const file of exampleFiles) {
        const filePath = path.join(examplesDir, file);
        try {
          const validation = await validateNginxConfig(filePath);
          results.push({ file, success: validation.valid });
        } catch (error) {
          results.push({ 
            file, 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Report results
      const failed = results.filter(r => !r.success);
      
      if (failed.length > 0) {
        console.log('❌ Failed configurations:');
        failed.forEach(f => {
          console.log(`  - ${f.file}: ${f.error || 'Validation failed'}`);
        });
      }
      
      const passed = results.filter(r => r.success);
      console.log(`✅ Passed: ${passed.length}/${results.length} configuration files`);
      
      // All files should pass validation
      expect(failed).toHaveLength(0);
      expect(passed.length).toBe(exampleFiles.length);
    });
  });

  describe('Configuration File Quality', () => {
    it('should ensure all example files have proper documentation headers', async () => {
      const exampleFiles = await getExampleFiles();
      
      for (const file of exampleFiles) {
        const filePath = path.join(examplesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // First line should be a comment with "Example:"
        expect(lines[0]).toMatch(/^#.*Example:/);
        
        // Second line should be a comment with "Demonstrates" (flexible format)
        expect(lines[1]).toMatch(/^#.*(Demonstrates|demonstrates)/);
        
        // Should have at least 3 lines of content
        expect(lines.length).toBeGreaterThan(10);
      }
    });

    it('should ensure configuration files follow consistent formatting', async () => {
      const exampleFiles = await getExampleFiles();
      
      for (const file of exampleFiles) {
        const filePath = path.join(examplesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Should not have trailing whitespace on lines
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          expect(lines[i]).not.toMatch(/\s+$/);
        }
        
        // Should not have tabs (should use spaces)
        expect(content).not.toMatch(/\t/);
        
        // Should end with a newline
        expect(content).toMatch(/\n$/);
      }
    });
  });
});
