# API Reference

## Programmatic Usage

The nginx-to-edge-js library can be used programmatically in your Node.js applications.

### Installation

```bash
npm install nginx-to-edge-js
```

### Basic Usage

```typescript
import { 
  NginxParser,
  CloudFlareGenerator,
  NextJSGenerator 
} from 'nginx-to-edge-js';

// Parse nginx configuration
const parser = new NginxParser();
const parsedConfig = await parser.parseFile('nginx.conf');

// Generate CloudFlare Worker
const cfGenerator = new CloudFlareGenerator(parsedConfig);
const workerCode = cfGenerator.generate();

// Generate Next.js middleware
const nextGenerator = new NextJSGenerator(parsedConfig);
const middlewareCode = nextGenerator.generate();
```

### Advanced Usage

#### Custom Output Options

```typescript
import { CloudFlareGenerator } from 'nginx-to-edge-js';

const generator = new CloudFlareGenerator(parsedConfig, {
  outputPath: './custom-worker.js',
  minify: true,
  addComments: false
});

const code = generator.generate();
```

#### Error Handling

```typescript
try {
  const parser = new NginxParser();
  const config = await parser.parseFile('nginx.conf');
} catch (error) {
  if (error instanceof NginxParseError) {
    console.error(`Parse error at line ${error.line}: ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Core Classes

### NginxParser

Parses nginx configurations using the crossplane library.

```typescript
class NginxParser {
  async parseFile(filePath: string): Promise<ParsedConfig>
  async parseString(content: string): Promise<ParsedConfig>
  validate(config: ParsedConfig): ValidationResult
}
```

### CloudFlareGenerator

Generates CloudFlare Workers code from parsed nginx configurations.

```typescript
class CloudFlareGenerator extends BaseGenerator {
  constructor(config: ParsedConfig, options?: GeneratorOptions)
  generate(): string
  generateToFile(outputPath: string): Promise<void>
}
```

### NextJSGenerator

Generates Next.js middleware code from parsed nginx configurations.

```typescript
class NextJSGenerator extends BaseGenerator {
  constructor(config: ParsedConfig, options?: GeneratorOptions)
  generate(): string
  generateToFile(outputPath: string): Promise<void>
}
```

## Type Definitions

### ParsedConfig

```typescript
interface ParsedConfig {
  servers: ServerBlock[]
  upstreams: UpstreamBlock[]
  globals: GlobalDirective[]
}

interface ServerBlock {
  listen: ListenDirective[]
  serverName: string[]
  locations: LocationBlock[]
  ssl: SSLConfig
  // ... other directives
}

interface LocationBlock {
  path: string
  modifier?: 'exact' | 'regex' | 'prefix'
  proxyPass?: string
  rewrite?: RewriteRule[]
  headers: HeaderDirective[]
  // ... other directives
}
```

### Generator Options

```typescript
interface GeneratorOptions {
  outputPath?: string
  minify?: boolean
  addComments?: boolean
  target?: 'es2020' | 'es2022'
  includeTypes?: boolean
}
```

## Error Types

### NginxParseError

Thrown when nginx configuration parsing fails.

```typescript
class NginxParseError extends Error {
  line: number
  column: number
  directive: string
}
```

### GenerationError

Thrown when code generation fails.

```typescript
class GenerationError extends Error {
  platform: string
  directive: string
  reason: string
}
```

## Examples

### Batch Processing

```typescript
import { glob } from 'glob';
import { NginxParser, CloudFlareGenerator } from 'nginx-to-edge-js';

async function processConfigs() {
  const parser = new NginxParser();
  const files = await glob('configs/*.conf');
  
  for (const file of files) {
    try {
      const config = await parser.parseFile(file);
      const generator = new CloudFlareGenerator(config);
      const outputFile = file.replace('.conf', '.worker.js');
      await generator.generateToFile(outputFile);
      console.log(`Generated: ${outputFile}`);
    } catch (error) {
      console.error(`Failed to process ${file}:`, error);
    }
  }
}
```

### Custom Platform Support

```typescript
import { BaseGenerator } from 'nginx-to-edge-js';

class CustomPlatformGenerator extends BaseGenerator {
  generate(): string {
    // Implement custom generation logic
    return this.generateCustomCode();
  }
  
  private generateCustomCode(): string {
    // Transform parsed config to custom platform code
    return '/* Custom platform code */';
  }
}
```

### Validation and Linting

```typescript
import { NginxParser } from 'nginx-to-edge-js';

async function validateConfig(filePath: string) {
  const parser = new NginxParser();
  
  try {
    const config = await parser.parseFile(filePath);
    const validation = parser.validate(config);
    
    if (validation.errors.length > 0) {
      console.error('Validation errors:');
      validation.errors.forEach(error => {
        console.error(`  ${error.line}: ${error.message}`);
      });
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Validation warnings:');
      validation.warnings.forEach(warning => {
        console.warn(`  ${warning.line}: ${warning.message}`);
      });
    }
    
    return validation.isValid;
  } catch (error) {
    console.error('Parse failed:', error);
    return false;
  }
}
```
