# Development Guide

## Development Environment Setup

### Prerequisites

- **Node.js 18+** - For TypeScript compilation and runtime
- **Python 3.8+** - For crossplane nginx parser
- **Git** - For version control

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/hedinfaok/nginx-to-edge-js.git
cd nginx-to-edge-js

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install crossplane

# Build the project
npm run build

# Run tests to verify setup
npm test
```

### Development Tools

```bash
# Start development with watch mode
npm run dev

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint -- --fix

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
nginx-to-edge-js/
├── src/
│   ├── converters/          # nginx parsing logic
│   │   └── nginx-parser.ts  # crossplane integration
│   ├── core/                # Core data models
│   │   ├── config-model.ts  # Configuration interfaces
│   │   └── transformer.ts   # JSON to model transformation
│   ├── generators/          # Platform code generators
│   │   ├── base-generator.ts    # Abstract base class
│   │   ├── cloudflare.ts        # CloudFlare Workers
│   │   └── nextjs-middleware.ts # Next.js middleware
│   ├── cli/                 # Command-line interface
│   │   └── index.ts
│   └── index.ts             # Main exports
├── test/                    # Test files
│   ├── basic.test.ts
│   └── converters/
├── examples/                # Sample nginx configurations
├── docs/                    # Developer documentation
└── dist/                    # Compiled JavaScript output
```

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/awesome-feature

# Make changes
# ... edit files ...

# Run tests frequently
npm test

# Check linting
npm run lint

# Build to verify compilation
npm run build
```

### 2. Testing Strategy

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "nginx-parser"
npm test -- --grep "cloudflare"

# Run tests with coverage
npm run test:coverage

# Test against real nginx configs
npm test test/integration/
```

### 3. Code Quality

```bash
# TypeScript type checking
npm run type-check

# ESLint validation
npm run lint

# Format code
npm run format

# Pre-commit checks (runs automatically)
npm run pre-commit
```

## Adding New Features

### 1. Adding nginx Directive Support

When adding support for a new nginx directive:

```typescript
// 1. Add to config model (src/core/config-model.ts)
interface LocationBlock {
  // ... existing properties
  customDirective?: CustomDirectiveConfig;
}

// 2. Update transformer (src/core/transformer.ts)
export class Transformer {
  private parseLocationBlock(block: any): LocationBlock {
    return {
      // ... existing parsing
      customDirective: this.parseCustomDirective(block.custom_directive)
    };
  }
}

// 3. Update generators (src/generators/*.ts)
export class CloudFlareGenerator {
  private generateLocationHandling(location: LocationBlock): string {
    // Handle the new directive
    if (location.customDirective) {
      return this.generateCustomDirective(location.customDirective);
    }
  }
}
```

### 2. Adding New Platform Generator

```typescript
// 1. Create new generator file (src/generators/new-platform.ts)
import { BaseGenerator } from './base-generator';
import { ParsedConfig } from '../core/config-model';

export class NewPlatformGenerator extends BaseGenerator {
  constructor(config: ParsedConfig) {
    super(config);
  }

  generate(): string {
    return this.generatePlatformCode();
  }

  private generatePlatformCode(): string {
    // Implement platform-specific generation
    return '/* New platform code */';
  }
}

// 2. Add to main exports (src/index.ts)
export { NewPlatformGenerator } from './generators/new-platform';

// 3. Add CLI support (src/cli/index.ts)
program
  .command('generate')
  .option('-p, --platform <platform>', 'Target platform', 'cloudflare')
  .action((options) => {
    if (options.platform === 'new-platform') {
      const generator = new NewPlatformGenerator(config);
      // ... handle generation
    }
  });
```

### 3. Adding Tests

```typescript
// Create test file: test/generators/new-platform.test.ts
import { describe, it, expect } from '@jest/globals';
import { NewPlatformGenerator } from '../../src/generators/new-platform';
import { mockParsedConfig } from '../fixtures/mock-config';

describe('NewPlatformGenerator', () => {
  it('should generate valid platform code', () => {
    const generator = new NewPlatformGenerator(mockParsedConfig);
    const result = generator.generate();
    
    expect(result).toContain('/* New platform code */');
    expect(result).toMatch(/valid platform syntax/);
  });

  it('should handle complex configurations', () => {
    // Test with complex nginx configurations
  });
});
```

## Code Style Guidelines

### TypeScript Standards

- **Strict TypeScript** - All code must pass `tsc --strict`
- **No `any` types** - Use proper typing or `unknown`
- **Interfaces over types** - Prefer interfaces for object shapes
- **Async/await** - Use modern async patterns, avoid callbacks

### Naming Conventions

```typescript
// Classes: PascalCase
class NginxParser { }

// Interfaces: PascalCase with descriptive names
interface ParsedConfig { }

// Functions/variables: camelCase
const parseConfiguration = () => { };

// Constants: UPPER_SNAKE_CASE
const DEFAULT_PORT = 80;

// Files: kebab-case
// nginx-parser.ts, cloudflare-generator.ts
```

### Error Handling

```typescript
// Custom error classes
export class NginxParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public directive: string
  ) {
    super(message);
    this.name = 'NginxParseError';
  }
}

// Proper error propagation
async function parseFile(path: string): Promise<ParsedConfig> {
  try {
    const content = await fs.readFile(path, 'utf8');
    return this.parseString(content);
  } catch (error) {
    throw new NginxParseError(
      `Failed to parse ${path}: ${error.message}`,
      0,
      'file'
    );
  }
}
```

## Testing Guidelines

### Test Organization

```typescript
describe('Component', () => {
  describe('method', () => {
    it('should handle normal case', () => { });
    it('should handle edge case', () => { });
    it('should throw on invalid input', () => { });
  });
});
```

### Mock Data

```typescript
// Use consistent mock data (test/fixtures/)
export const mockNginxConfig = `
server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://backend;
    }
}
`;

export const mockParsedConfig: ParsedConfig = {
  servers: [/* ... */],
  upstreams: [/* ... */],
  globals: [/* ... */]
};
```

### Integration Tests

```typescript
// Test real crossplane integration
it('should parse real nginx configuration', async () => {
  const parser = new NginxParser();
  const config = await parser.parseFile('examples/basic-reverse-proxy/nginx.conf');
  
  expect(config.servers).toHaveLength(1);
  expect(config.servers[0].listen).toContain({ port: 80 });
});
```

## Debugging

### VS Code Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Common Issues

**crossplane not found:**
```bash
# Ensure Python crossplane is installed
pip install crossplane
which crossplane
```

**TypeScript compilation errors:**
```bash
# Clean build and reinstall
rm -rf dist node_modules
npm install
npm run build
```

**Test failures:**
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test test/converters/nginx-parser.test.ts
```

## Release Process

### 1. Preparation

```bash
# Update version
npm version patch|minor|major

# Update CHANGELOG.md
# Update README.md if needed

# Run full test suite
npm run test:all
npm run lint
npm run build
```

### 2. Release

```bash
# Create release commit
git add .
git commit -m "Release v1.x.x"

# Create tag
git tag v1.x.x

# Push changes
git push origin main --tags
```

### 3. GitHub Release

- Create GitHub release from tag
- Include changelog in release notes
- Attach build artifacts if needed
