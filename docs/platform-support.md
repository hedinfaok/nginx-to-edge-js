# Platform Support

## Overview

This document details platform-specific implementation notes, supported features, and limitations for each target platform.

## CloudFlare Workers

### Implementation Details

**File:** `src/generators/cloudflare.ts`  
**Output:** JavaScript (ES2020+)  
**Runtime:** V8 Isolate  

### Supported nginx Directives

#### ✅ Core Directives
- `listen` → Handled via route matching
- `server_name` → Host header validation
- `location` → Route patterns and handlers
- `return` → Response with status/body/redirect
- `rewrite` → URL transformation rules

#### ✅ Proxy Directives
- `proxy_pass` → `fetch()` to upstream
- `proxy_set_header` → Custom request headers
- `proxy_hide_header` → Response header filtering
- `proxy_redirect` → Location header rewriting

#### ✅ Headers
- `add_header` → Custom response headers
- `more_set_headers` → Advanced header manipulation

#### ⚠️ Limited Support
- `proxy_cache` → Uses CF Cache API (simplified)
- `gzip` → Automatic in CF Workers
- `ssl_*` → Handled by CloudFlare edge

#### ❌ Not Supported
- `fastcgi_pass` → No FastCGI in Workers
- `uwsgi_pass` → No uWSGI in Workers  
- `auth_basic` → Use CF Access instead
- `limit_req` → Use CF Rate Limiting

### Code Generation Patterns

```javascript
// Location block → Route handler
location /api/ {
    proxy_pass http://backend;
    add_header X-Custom "value";
}

// Generates:
if (url.pathname.startsWith('/api/')) {
    const response = await fetch('http://backend' + url.pathname);
    response.headers.set('X-Custom', 'value');
    return response;
}
```

### Platform Limitations

- **Request Size:** 100MB max
- **Response Size:** 100MB max  
- **CPU Time:** 50ms on free tier, 30s on paid
- **Memory:** 128MB
- **Subrequests:** Limited by CPU time

## Next.js Middleware

### Implementation Details

**File:** `src/generators/nextjs-middleware.ts`  
**Output:** TypeScript (ES2022+)  
**Runtime:** Edge Runtime (V8)

### Supported nginx Directives

#### ✅ Core Directives
- `server_name` → Host header matching
- `location` → Route matching patterns
- `return` → NextResponse redirects/rewrites
- `rewrite` → URL rewriting rules

#### ✅ Routing
- `try_files` → Fallback chains
- `index` → Default file serving
- `alias` → Path mapping

#### ✅ Headers
- `add_header` → Response headers
- `proxy_set_header` → Request headers (limited)

#### ⚠️ Limited Support
- `proxy_pass` → Rewrite to internal routes only
- `upstream` → Load balancing via rewrites
- `error_page` → Custom error pages

#### ❌ Not Supported
- `proxy_pass` (external) → Use API routes instead
- `fastcgi_pass` → Use API routes instead
- `auth_basic` → Use NextAuth.js instead
- `limit_req` → Use Vercel rate limiting

### Code Generation Patterns

```typescript
// Rewrite rule
rewrite ^/old/(.*)$ /new/$1 permanent;

// Generates:
if (pathname.startsWith('/old/')) {
    const newPath = pathname.replace(/^\/old\/(.*)$/, '/new/$1');
    return NextResponse.redirect(new URL(newPath, request.url), 301);
}
```

### Platform Limitations

- **Request Size:** 4MB max
- **Response Size:** 4MB max
- **CPU Time:** 25ms max
- **Memory:** 64MB max
- **External Requests:** Not allowed in middleware

## AWS Lambda@Edge

### Implementation Details

**File:** `src/generators/lambda-edge.ts`  
**Output:** JavaScript (Node.js 18)  
**Runtime:** AWS Lambda at CloudFront Edge  

### Supported nginx Directives

#### ✅ Core Directives
- `listen` → CloudFront behavior matching
- `server_name` → Host header validation
- `location` → Path pattern matching  
- `return` → Lambda response generation
- `rewrite` → URL transformation rules

#### ✅ CloudFront Integration
- `proxy_pass` → Origin request modification
- `proxy_set_header` → Request header manipulation
- `add_header` → Response header manipulation
- `proxy_hide_header` → Response header filtering

#### ⚠️ Limited Support
- `proxy_cache` → Use CloudFront caching rules
- `gzip` → Handled by CloudFront
- `ssl_*` → Managed by CloudFront

#### ❌ Not Supported
- `fastcgi_pass` → No FastCGI support
- `uwsgi_pass` → No uWSGI support
- `auth_basic` → Use AWS Cognito instead
- `limit_req` → Use AWS WAF instead

### Code Generation Patterns

```javascript
// Location block → Lambda@Edge function
location /api/ {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
}

// Generates:
if (matchesPath(uri, "/api/")) {
    request.origin = {
        custom: {
            domainName: 'backend',
            port: 3000,
            protocol: 'http',
            path: '/'
        }
    };
    request.headers['host'] = [{ key: 'Host', value: request.headers.host[0].value }];
}
```

### Platform Limitations

- **Request Size:** 6MB max (viewer), 20MB (origin)
- **Response Size:** 1MB max (viewer), 20MB (origin)  
- **CPU Time:** 5s viewer functions, 30s origin functions
- **Memory:** 128MB-10GB configurable
- **Regions:** Limited to CloudFront edge locations
- **Cold Starts:** 50-100ms typical

## QuickJS Runtime

### Implementation Details

**File:** `src/generators/quickjs.ts`  
**Output:** JavaScript (QuickJS compatible)  
**Runtime:** Ultra-lightweight JavaScript engine  

### Supported nginx Directives

#### ✅ Core Directives
- `listen` → Request routing logic
- `server_name` → Host header validation
- `location` → Path pattern matching  
- `return` → Direct response generation
- `rewrite` → Basic URL transformation

#### ✅ Proxy Directives
- `proxy_pass` → Platform-specific proxy implementation
- `proxy_set_header` → Request header manipulation
- `add_header` → Response header manipulation

#### ⚠️ Limited Support
- `proxy_cache` → Platform-dependent caching
- Complex regex → QuickJS regex support varies
- Node.js APIs → Not available in QuickJS

#### ❌ Not Supported
- `fastcgi_pass` → No FastCGI support
- `uwsgi_pass` → No uWSGI support
- `auth_basic` → Platform-specific auth required
- File system operations → No fs module

### Code Generation Patterns

```javascript
// Location block → QuickJS function
location /api/ {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
}

// Generates:
if (matchesPath(context.pathname, "/api/")) {
    const upstream = {
        host: 'backend',
        port: 3000,
        protocol: 'http:',
        path: '/'
    };
    const proxyUrl = buildProxyUrl(upstream, context.pathname);
    return proxyRequest(proxyUrl, context.method, proxyHeaders, request.body);
}
```

### Platform Compatibility

**Compatible Platforms:**
- **Fastly Compute@Edge** - WebAssembly QuickJS
- **Lagon** - Native QuickJS runtime
- **Supabase Edge Functions** - Deno with QuickJS
- **WasmEdge** - QuickJS integration
- **Shopify Oxygen** - QuickJS for commerce

### Platform Limitations

- **Memory:** ~200KB typical, ~2MB max
- **Binary Size:** ~500KB for runtime
- **Startup Time:** <1ms cold start
- **API Support:** Web APIs only, no Node.js APIs
- **Regex:** Basic support, varies by platform

## Platform Comparison

| Feature | CloudFlare | Next.js | Lambda@Edge |
|---------|------------|---------|-------------|
| **Runtime** | V8 Isolate | V8 Edge | Node.js |
| **Max Request** | 100MB | 4MB | 6MB |
| **Max Response** | 100MB | 4MB | 1MB |
| **CPU Timeout** | 30s | 25ms | 30s |
| **External Fetch** | ✅ Full | ❌ None | ✅ Limited |
| **Startup Time** | <1ms | <1ms | 50-100ms |
| **Global Regions** | 300+ | 18+ | 13+ |

## Best Practices

### CloudFlare Workers

```javascript
// Efficient request handling
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Handle static assets
        if (url.pathname.startsWith('/static/')) {
            return fetch(request); // Pass through to origin
        }
        
        // Handle API routes
        if (url.pathname.startsWith('/api/')) {
            return handleAPI(request, env);
        }
        
        // Default handling
        return fetch(request);
    }
};
```

### Next.js Middleware

```typescript
// Efficient middleware
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    
    // Early returns for performance
    if (pathname.startsWith('/api/')) {
        return NextResponse.next();
    }
    
    // Conditional logic
    if (pathname.startsWith('/admin/')) {
        return handleAdminRoutes(request);
    }
    
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|favicon.ico).*)',
    ],
};
```

### AWS Lambda@Edge

```javascript
// Efficient Lambda@Edge handler
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const eventType = event.Records[0].cf.eventType;
    
    // Handle only necessary event types
    switch (eventType) {
        case 'viewer-request':
            return handleViewerRequest(request);
        case 'origin-request':
            return handleOriginRequest(request);
        default:
            return request;
    }
};

function handleViewerRequest(request) {
    const uri = request.uri;
    
    // Early returns for performance
    if (uri.startsWith('/static/')) {
        return request; // Pass through to origin
    }
    
    // Conditional routing
    if (uri.startsWith('/api/')) {
        return handleAPIRoutes(request);
    }
    
    return request;
}
```

## Testing Platform Compatibility

### CloudFlare Workers

```bash
# Local development
npm install -g wrangler
wrangler dev

# Test generated worker
wrangler publish --dry-run
```

### Next.js Middleware

```bash
# Local development
npm run dev

# Test middleware
curl -H "Host: example.com" http://localhost:3000/test-path
```

### AWS Lambda@Edge

```bash
# Local testing with SAM CLI
sam local start-api

# Test generated Lambda function
sam deploy --guided

# CloudFormation deployment
aws cloudformation deploy --template-file template.yaml --stack-name my-edge-stack
```

### Validation Scripts

```typescript
// Validate generated code
import { validateCloudFlareWorker } from './validators/cloudflare';
import { validateNextJSMiddleware } from './validators/nextjs';

const workerCode = generator.generate();
const validation = validateCloudFlareWorker(workerCode);

if (!validation.isValid) {
    console.error('Generated code validation failed:', validation.errors);
}
```

## Troubleshooting

### Common Issues

**CloudFlare Workers:**
- Exceeding CPU limits → Optimize async operations
- Memory issues → Reduce object allocations
- Fetch failures → Check CORS and SSL

**Next.js Middleware:**
- Response size limits → Move logic to API routes
- External fetch errors → Use API routes instead
- Performance issues → Minimize middleware logic

**AWS Lambda@Edge:**
- Cold start latency → Optimize function size and dependencies
- Response size limits → Use origin functions for large responses
- Timeout errors → Split complex logic across event types
- CloudFront integration → Validate behavior path patterns

**General:**
- nginx directive not supported → Check platform limitations
- Generated code errors → Validate nginx config first
- Performance issues → Review generated patterns
