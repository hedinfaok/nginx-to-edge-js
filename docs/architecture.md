# nginx-to-edge-js Architecture

## Overview

The nginx-to-edge-js project is designed as a modular system using nginx Inc.'s official crossplane parser for parsing nginx configurations and transforming them into modern edge server configurations. The architecture follows a clear separation of concerns with distinct layers for parsing, transformation, and generation.

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   nginx.conf    │    │      JSON       │    │  Edge Configs   │
│ (standard fmt)  │───▶│  Configuration  │───▶│   (JS/TS/etc)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   crossplane    │    │   Transformer   │    │   Generators    │
│  nginx parser   │    │  - Validation   │    │  - CloudFlare   │
│ (nginx Inc.)    │    │  - Mapping      │    │  - Lambda@Edge  │
│                 │    │  - Enrichment   │    │  - Next.js      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. Parser Layer (`src/converters/`)

**crossplane Parser** (`src/converters/nginx-parser.ts`)
- Uses nginx Inc.'s official crossplane Python library
- Provides 100% nginx syntax compatibility
- Handles all nginx directives and contexts correctly
- Production-proven parser used by nginx Amplify
- Spawns crossplane subprocess for parsing
- Comprehensive error handling with line numbers

### 2. Core Model (`src/core/`)

**Config Model** (`config-model.ts`)
- Defines TypeScript interfaces for all configuration structures
- Provides type safety throughout the system
- Supports all major nginx directives and contexts

**Transformer** (`transformer.ts`)
- Converts crossplane JSON output to structured configuration model
- Handles complex nginx directive parsing
- Normalizes configuration data for generators

### 3. Generator Layer (`src/generators/`)

**Base Generator** (`base-generator.ts`)
- Abstract base class for all platform generators
- Provides common utilities and validation
- Ensures consistent generator interface

**CloudFlare Generator** (`cloudflare.ts`)
- Generates CloudFlare Workers JavaScript code
- Maps nginx directives to CF Workers API
- Handles routing, proxying, and redirects

**Next.js Generator** (`nextjs-middleware.ts`)
- Generates Next.js middleware TypeScript code
- Maps nginx routing to Next.js patterns
- Supports rewrites, redirects, and headers

**Lambda@Edge Generator** (`lambda-edge.ts`) *[Planned]*
- Will generate AWS Lambda@Edge functions
- Maps nginx to CloudFront behaviors
- Handles origin/viewer request/response functions

### 4. CLI Interface (`src/cli/`)

**Command Interface** (`index.ts`)
- Provides command-line interface using Commander.js
- Supports parsing, generation, and validation commands
- Handles file I/O and error reporting

## Data Flow

### 1. Parsing Phase
```
nginx.conf → crossplane → JSON → Transformer → Structured Config
```

1. nginx configuration is read from file
2. Parsed using crossplane (nginx Inc.'s official parser) for maximum compatibility
3. JSON output transformed into typed configuration model
4. Validated for completeness and correctness

### 2. Generation Phase
```
Structured Config → Platform Generator → Target Code → File Output
```

1. Structured configuration is passed to selected generator
2. Platform-specific validation is performed
3. Configuration is mapped to target platform concepts
4. Code is generated using platform APIs
5. Output is written to file or returned as string

## Design Patterns

### 1. Strategy Pattern
Generators implement a common interface but provide platform-specific implementations:

```typescript
abstract class BaseGenerator {
  abstract generate(): string;
  abstract validatePlatformSpecific(): ValidationResult;
}
```

### 2. Builder Pattern
Configuration transformation builds complex objects step by step:

```typescript
class ConfigTransformer {
  transformUCLToNginx(raw: any): NginxConfig {
    return {
      servers: this.processServers(raw.server),
      upstreams: this.processUpstreams(raw.upstream),
      global: this.processGlobalDirectives(raw)
    };
  }
}
```

### 3. Template Method Pattern
Generators follow a common structure with customizable steps:

```typescript
generate(): string {
  const validation = this.validate();
  if (!validation.valid) throw new Error(...);
  
  return [
    this.generateHeader(),
    this.generateMainCode(),
    this.generateHelpers()
  ].join('\n');
}
```

## Configuration Mapping Strategy

### nginx → CloudFlare Workers

| nginx Concept | CloudFlare Equivalent |
|---------------|----------------------|
| `server` block | Request hostname matching |
| `location` block | URL path matching |
| `proxy_pass` | `fetch()` to origin |
| `return` redirect | `Response.redirect()` |
| `rewrite` | URL transformation |
| `add_header` | Response header modification |

### nginx → Next.js Middleware

| nginx Concept | Next.js Equivalent |
|---------------|-------------------|
| `server` block | Hostname matching |
| `location` block | Path matching in middleware |
| `proxy_pass` | `NextResponse.rewrite()` to external URL |
| `return` redirect | `NextResponse.redirect()` |
| `rewrite` | `NextRequest.rewrite()` |
| Static files | `/public` directory serving |

### nginx → Lambda@Edge (Planned)

| nginx Concept | Lambda@Edge Equivalent |
|---------------|----------------------|
| `server` block | CloudFront distribution |
| `upstream` | Origin configuration |
| `location` block | CloudFront behavior |
| Request modification | Viewer/Origin request functions |
| Response modification | Viewer/Origin response functions |

## Error Handling

### 1. Parsing Errors
- UCL syntax errors
- Invalid nginx directives
- Missing required configurations

### 2. Validation Errors
- Structural validation (required fields)
- Platform-specific validation
- Warning generation for unsupported features

### 3. Generation Errors
- Platform API limitations
- Unsupported directive combinations
- Runtime code generation issues

## Extensibility

### Adding New Generators

1. Create new generator class extending `BaseGenerator`
2. Implement required abstract methods
3. Add platform-specific validation logic
4. Register in CLI interface
5. Add tests and documentation

### Adding New Directives

1. Update configuration model interfaces
2. Add parsing logic in transformer
3. Update generator mappings
4. Add validation rules
5. Update tests and documentation

## Performance Considerations

### 1. Parsing Performance
- libucl provides efficient UCL parsing
- Minimal preprocessing for nginx compatibility
- Streaming support for large configurations

### 2. Memory Usage
- Lazy loading of configuration sections
- Efficient AST representation
- Garbage collection friendly patterns

### 3. Generation Performance
- Template-based code generation
- Minimal string concatenation
- Efficient file I/O operations

## Testing Strategy

### 1. Unit Tests
- Individual component testing
- Mock external dependencies
- Edge case validation

### 2. Integration Tests
- End-to-end parsing and generation
- Real nginx configuration files
- Platform-specific output validation

### 3. Performance Tests
- Large configuration parsing
- Memory usage profiling
- Generation speed benchmarks

## Future Enhancements

### 1. Web UI
- Browser-based configuration editor
- Real-time preview of generated code
- Visual configuration builder

### 2. Plugin System
- Custom directive handlers
- Third-party generator plugins
- Middleware hooks for transformation

### 3. Advanced Features
- Configuration optimization suggestions
- Migration compatibility checks
- Performance analysis and recommendations
