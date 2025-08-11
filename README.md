# nginx-to-edge-js

[![CI](https://github.com/hedinfaok/nginx-to-edge-js/workflows/CI%20-%20Ubuntu/badge.svg)](https://github.com/hedinfaok/nginx-to-edge-js/actions)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Convert nginx configurations to modern edge server JavaScript/TypeScript using nginx Inc.'s official crossplane parser.

## Quick Start

```bash
# Install dependencies
npm install
pip install crossplane

# Generate CloudFlare Worker from nginx config
npm run cli generate cloudflare examples/basic-reverse-proxy/nginx.conf

# Generate Next.js middleware from nginx config  
npm run cli generate nextjs examples/basic-reverse-proxy/nginx.conf
```

## Features

- **Official nginx Parser** - Uses nginx Inc.'s crossplane library
- **CloudFlare Workers** - Generate worker.js files  
- **Next.js Middleware** - Generate middleware.ts files
- **TypeScript Support** - Full type safety throughout

## CLI Commands

```bash
# Generate for specific platform
npm run cli generate cloudflare <nginx-file>
npm run cli generate nextjs <nginx-file>

# Custom output path
npm run cli generate cloudflare <nginx-file> --output my-worker.js

# Help
npm run cli --help
```

## Architecture

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│   nginx.conf    │───▶│  crossplane      │───▶│  nginx AST     │
│  (standard)     │    │  (nginx Inc.)    │    │  (JSON)        │
└─────────────────┘    └──────────────────┘    └────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│  Edge Configs   │◀───│  Code Generator  │◀───│  Config Model  │
│ (Worker/Next.js)│    │  (TS/JS Output)  │    │  (Normalized)  │
└─────────────────┘    └──────────────────┘    └────────────────┘
```

### Parser Integration

- **crossplane Library** - Official nginx Inc. parser (same as nginx Amplify)
- **Authoritative Parsing** - 100% compatible with nginx syntax
- **Comprehensive Coverage** - Supports all nginx directives and contexts
- **Error Detection** - Precise syntax validation and error reporting

## Requirements

- Node.js 18+
- Python 3.8+ with crossplane (`pip install crossplane`)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes  
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

