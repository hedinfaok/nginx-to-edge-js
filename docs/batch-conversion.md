# Batch Conversion Guide

This guide explains how to use the batch conversion scripts to convert all nginx example configurations to edge functions.

## Quick Start

```bash
# Build the project first
npm run build

# Convert all examples to all platforms
npm run convert-examples

# Convert to specific platform only
npm run convert-examples:cloudflare
npm run convert-examples:nextjs
npm run convert-examples:lambda-edge
npm run convert-examples:quickjs
```

## Available Scripts

| Script | Description | Output Format |
|--------|-------------|---------------|
| `convert-examples` | Convert all examples to all platforms | Mixed (.js/.ts) |
| `convert-examples:cloudflare` | Convert all examples to CloudFlare Workers | `.js` files |
| `convert-examples:nextjs` | Convert all examples to Next.js Middleware | `.ts` files |
| `convert-examples:lambda-edge` | Convert all examples to AWS Lambda@Edge | `.js` files |
| `convert-examples:quickjs` | Convert all examples to QuickJS | `.js` files |

## Output Structure

The batch conversion creates organized output directories:

```
out/
├── cloudflare/              # CloudFlare Workers
│   ├── basic-reverse-proxy.js
│   ├── load-balancer.js
│   ├── ssl-config.js
│   └── ... (all 20 examples)
├── nextjs/                  # Next.js Middleware
│   ├── basic-reverse-proxy.ts
│   ├── load-balancer.ts
│   ├── ssl-config.ts
│   └── ... (all 20 examples)
├── lambda-edge/             # AWS Lambda@Edge
│   ├── basic-reverse-proxy.js
│   ├── load-balancer.js
│   ├── ssl-config.js
│   └── ... (all 20 examples)
└── quickjs/                 # QuickJS
    ├── basic-reverse-proxy.js
    ├── load-balancer.js
    ├── ssl-config.js
    └── ... (all 20 examples)
```

## Example Configurations Processed

The batch script processes all 20 nginx configuration examples:

1. **advanced-proxy.conf** - Advanced proxy with complex routing
2. **basic-reverse-proxy.conf** - Simple reverse proxy setup
3. **custom-logging.conf** - Custom logging configuration
4. **dns-resolver.conf** - DNS resolution settings
5. **header-manipulation.conf** - HTTP header modifications
6. **load-balancer.conf** - Load balancing configuration
7. **load-modules.conf** - Dynamic module loading
8. **location-regex.conf** - Regular expression location matching
9. **map-variables.conf** - Variable mapping directives
10. **multi-server.conf** - Multi-server configuration
11. **proxy-caching.conf** - Proxy caching setup
12. **redirects-rewrites.conf** - URL redirects and rewrites
13. **security-auth.conf** - Security and authentication
14. **simple-proxy.conf** - Basic proxy configuration
15. **ssl-config.conf** - SSL/TLS configuration
16. **static-files-performance.conf** - Static file serving optimization
17. **static-site-with-redirects.conf** - Static site with redirects
18. **upstream-config.conf** - Upstream server configuration
19. **variables-set.conf** - Variable setting directives
20. **worker-config.conf** - Worker process configuration

## Platform Compatibility

| Platform | Success Rate | Notes |
|----------|-------------|-------|
| **CloudFlare Workers** | 20/20 (100%) | Full compatibility |
| **Next.js Middleware** | 20/20 (100%) | Full compatibility |
| **AWS Lambda@Edge** | 17/20 (85%) | Some URL validation issues |
| **QuickJS** | 20/20 (100%) | Full compatibility |

### Known Issues

**AWS Lambda@Edge** has some limitations with certain configurations:
- `advanced-proxy.conf` - Invalid URL error
- `dns-resolver.conf` - Invalid URL error  
- `variables-set.conf` - Invalid URL error

These are likely due to Lambda@Edge's stricter URL validation requirements.

## Sample Output

When you run `npm run convert-examples`, you'll see:

```
🌟 Converting all examples to all edge platforms...
============================================================
📋 Found 20 example configuration files:
  - advanced-proxy.conf
  - basic-reverse-proxy.conf
  - custom-logging.conf
  ...

🚀 Converting examples to CloudFlare Workers...
============================================================
📄 Processing advanced-proxy.conf...
  ✅ Generated: /path/to/out/cloudflare/advanced-proxy.js
📄 Processing basic-reverse-proxy.conf...
  ✅ Generated: /path/to/out/cloudflare/basic-reverse-proxy.js
...

🎯 OVERALL CONVERSION SUMMARY
============================================================
📄 Examples processed: 20
🚀 Platforms: 4
✅ Total successful conversions: 77
❌ Total failed conversions: 3
📁 Output directory: /path/to/out
```

## Using Generated Code

After conversion, you can use the generated edge function code:

### CloudFlare Workers
```bash
# Deploy to CloudFlare
wrangler dev out/cloudflare/basic-reverse-proxy.js
```

### Next.js Middleware
```bash
# Copy to Next.js project
cp out/nextjs/basic-reverse-proxy.ts src/middleware.ts
```

### AWS Lambda@Edge
```bash
# Package for Lambda deployment
zip -r lambda-function.zip out/lambda-edge/basic-reverse-proxy.js
```

### QuickJS
```bash
# Run with QuickJS engine
qjs out/quickjs/basic-reverse-proxy.js
```

## Troubleshooting

**Script not found error:**
```bash
npm run build  # Build TypeScript first
```

**crossplane not found:**
```bash
pip install crossplane
# or
pipx install crossplane
```

**Permission denied:**
```bash
chmod +x scripts/convert-examples.js
```

## Advanced Usage

The batch conversion script can be customized by modifying `scripts/convert-examples.js`:

- Change output directory structure
- Add custom post-processing
- Filter specific example files
- Add new target platforms

## Performance

Conversion performance varies by platform:
- **CloudFlare Workers**: ~1-2 seconds per config
- **Next.js Middleware**: ~1-2 seconds per config  
- **AWS Lambda@Edge**: ~1-3 seconds per config
- **QuickJS**: ~1-2 seconds per config

Total time for all 20 examples across 4 platforms: ~2-3 minutes.
