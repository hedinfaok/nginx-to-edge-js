# nginx-to-edge-js

[![CI](https://github.com/yourusername/nginx-to-edge-js/workflows/CI/badge.svg)](https://github.com/yourusername/nginx-to-edge-js/actions)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful tool that translates nginx.conf files (in UCL format) to JSON and then generates configuration files for various edge server platforms.

## Overview

This project provides a complete pipeline for converting nginx configurations to modern edge server formats:

1. **Parse nginx.conf** (UCL format) → JSON representation
2. **Transform JSON** → Edge server configurations for:
   - CloudFlare Edge Workers
   - AWS Lambda@Edge
   - Next.js Middleware (.ts rewrites)
   - (Extensible for other platforms)

## Project Structure

```
nginx-to-edge-js/
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── parser/
│   │   ├── nginx-parser.ts      # Main nginx UCL parser
│   │   ├── ucl-lexer.ts         # UCL tokenizer
│   │   └── ast-builder.ts       # AST construction
│   ├── core/
│   │   ├── config-model.ts      # Unified configuration model
│   │   └── transformer.ts       # JSON transformation logic
│   ├── generators/
│   │   ├── base-generator.ts    # Abstract base generator
│   │   ├── cloudflare.ts        # CloudFlare Workers generator
│   │   ├── lambda-edge.ts       # Lambda@Edge generator
│   │   └── nextjs-middleware.ts # Next.js middleware generator
│   ├── cli/
│   │   └── index.ts            # Command-line interface
│   └── utils/
│       ├── file-utils.ts       # File I/O utilities
│       └── validation.ts       # Configuration validation
├── test/
│   ├── fixtures/
│   │   ├── nginx-configs/      # Sample nginx.conf files
│   │   └── expected-outputs/   # Expected JSON/config outputs
│   ├── parser/
│   ├── generators/
│   └── integration/
├── examples/
│   ├── basic-reverse-proxy/
│   ├── load-balancer/
│   └── static-site-with-redirects/
└── docs/
    ├── nginx-ucl-format.md
    ├── json-schema.md
    └── edge-server-mappings.md
```

## Features

### Phase 1: Core Parser & JSON Output
- [x] UCL (Universal Configuration Language) nginx parser using libucl
- [x] JSON serialization with structured output via libucl
- [x] Configuration model abstraction layer
- [x] Support for common nginx directives:
  - `server` blocks
  - `location` blocks
  - `upstream` definitions
  - `proxy_pass`, `rewrite`, `return` directives
  - SSL/TLS configurations

### Phase 2: Edge Server Generators
- [x] CloudFlare Workers configuration
  - Request routing and proxying
  - Custom headers and redirects
  - Rate limiting rules
- [x] AWS Lambda@Edge configuration
  - Origin request/response functions
  - Viewer request/response functions
  - CloudFront behavior mappings
- [x] Next.js Middleware configuration
  - TypeScript rewrite rules
  - Conditional redirects
  - Header manipulation

### Phase 3: Advanced Features
- [ ] Configuration validation and linting
- [ ] Performance optimization suggestions
- [ ] Migration compatibility checks
- [ ] Interactive web UI for configuration preview
- [ ] Plugin system for custom generators

## Installation

### Prerequisites

This project uses the **official libucl C library** from [vstakhov/libucl](https://github.com/vstakhov/libucl) for authentic UCL parsing. 

**Install libucl on macOS:**
```bash
brew install libucl
```

**Install libucl on Ubuntu/Debian:**
```bash
sudo apt-get install libucl-dev ucl-tools
```

**Install libucl on CentOS/RHEL:**
```bash
sudo yum install libucl-devel
```

### Install the Project

```bash
git clone https://github.com/your-username/nginx-to-edge-js.git
cd nginx-to-edge-js
npm install
npm run build
```

### Verify Installation

```bash
# Check if libucl is available
which ucl_tool

# Test the parser
node dist/cli/index.js parse examples/simple.ucl
```

## Usage

### Parse nginx.conf to JSON

```bash
# Parse UCL format nginx configuration
node dist/cli/index.js parse examples/simple.ucl

# Parse with pretty formatting  
node dist/cli/index.js parse examples/simple.ucl -p

# Save to file
node dist/cli/index.js parse examples/simple.ucl -o config.json
```

### Generate Edge Server Configurations

```bash
# Generate CloudFlare Workers
node dist/cli/index.js generate cloudflare examples/simple.ucl

# Generate Next.js middleware
node dist/cli/index.js generate nextjs examples/simple.ucl  

# Generate all platforms
node dist/cli/index.js generate all examples/simple.ucl -d output/

# Custom output path
node dist/cli/index.js generate cloudflare examples/simple.ucl -o my-worker.js
```

### Validate Configuration

```bash
node dist/cli/index.js validate examples/simple.ucl
```

## UCL Format Requirements

This project uses the **official libucl library** and requires nginx configurations to be in proper UCL format. Here are the key requirements:

### Basic UCL Syntax

```ucl
# UCL format nginx configuration
server {
    listen = 80
    server_name = "example.com"
    location_root = "/"
    proxy_pass = "http://backend:3000"
}
```

### Key Points:

- **Use `=` for assignments**: `listen = 80` (not `listen 80`)
- **Quote string values**: `server_name = "example.com"`
- **No nginx variables**: Use static values instead of `$host`, `$remote_addr`, etc.
- **Arrays use brackets**: `listen = [80, 443]`
- **Comments start with `#`**

### UCL vs Standard Nginx

| Standard Nginx | UCL Format |
|---|---|
| `listen 80;` | `listen = 80` |
| `server_name example.com;` | `server_name = "example.com"` |
| `proxy_set_header Host $host;` | `proxy_header_host = "host_value"` |

### Fallback Parser

If libucl parsing fails, the system automatically falls back to a basic nginx parser. You'll see a warning message when this happens.

## Architecture
```

### Programmatic API

```typescript
import { NginxParser, CloudFlareGenerator, NextJSGenerator } from 'nginx-to-edge-js';

// Parse nginx configuration
const parser = new NginxParser();
const config = parser.parseFile('nginx.conf');

// Generate CloudFlare Workers code
const cfGenerator = new CloudFlareGenerator();
const workerCode = cfGenerator.generate(config);

// Generate Next.js middleware
const nextGenerator = new NextJSGenerator();
const middlewareCode = nextGenerator.generate(config);
```

## Supported nginx Directives

### Server Context
- `listen` - Port and SSL configuration
- `server_name` - Domain matching
- `ssl_certificate`, `ssl_certificate_key` - SSL setup
- `access_log`, `error_log` - Logging configuration

### Location Context
- `proxy_pass` - Reverse proxy configuration
- `rewrite` - URL rewriting rules
- `return` - HTTP redirects and responses
- `add_header` - Custom response headers
- `proxy_set_header` - Upstream request headers

### Upstream Context
- `server` - Backend server definitions
- Load balancing methods (`ip_hash`, `least_conn`, etc.)

### Global Context
- `worker_processes`, `worker_connections`
- `gzip` compression settings
- Rate limiting (`limit_req_zone`, `limit_req`)

## Edge Server Mapping Strategy

### CloudFlare Workers
- nginx `server` blocks → CF Routes
- `location` blocks → Request URL matching
- `proxy_pass` → Fetch requests to origin
- `rewrite`/`return` → URL redirects
- `add_header` → Response header modification

### Lambda@Edge
- nginx configurations → CloudFront distributions
- `upstream` → Origin configurations
- `location` → CloudFront behaviors
- Request/response modifications → Lambda functions

### Next.js Middleware
- nginx routing → Next.js `middleware.ts`
- `rewrite` rules → `NextRequest.rewrite()`
- `return` redirects → `NextResponse.redirect()`
- Header manipulation → Request/response header modification

## Examples

### Input: nginx.conf (UCL format)
```nginx
server {
    listen 80;
    server_name example.com;
    
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /static/ {
        root /var/www/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

### Output: JSON Configuration
```json
{
  "servers": [
    {
      "listen": [{ "port": 80, "ssl": false }],
      "server_name": ["example.com"],
      "locations": [
        {
          "path": "/api/",
          "directives": {
            "proxy_pass": "http://backend:3000/",
            "proxy_set_header": {
              "Host": "$host",
              "X-Real-IP": "$remote_addr"
            }
          }
        },
        {
          "path": "/static/",
          "directives": {
            "root": "/var/www/",
            "expires": "1y",
            "add_header": {
              "Cache-Control": "public, immutable"
            }
          }
        },
        {
          "path": "/",
          "directives": {
            "return": {
              "code": 301,
              "url": "https://$server_name$request_uri"
            }
          }
        }
      ]
    }
  ]
}
```

## Development

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/nginx-to-edge-js.git
cd nginx-to-edge-js
npm install

# Run tests
npm test

# Build the project
npm run build

# Run development server with file watching
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

### Version 1.0
- [x] Basic nginx UCL parsing
- [x] JSON output generation
- [x] CloudFlare Workers generator
- [x] CLI interface

### Version 1.1
- [ ] Lambda@Edge generator
- [ ] Next.js middleware generator
- [ ] Configuration validation
- [ ] Error handling improvements

### Version 1.2
- [ ] Advanced directive support
- [ ] Performance optimizations
- [ ] Web UI for configuration preview
- [ ] Plugin architecture

### Version 2.0
- [ ] Real-time configuration sync
- [ ] Migration assistant
- [ ] Performance analytics
- [ ] Multi-format input support (Apache, Caddy)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- nginx community for comprehensive documentation
- UCL specification for configuration format standards
- Edge computing platforms for API documentation and examples
