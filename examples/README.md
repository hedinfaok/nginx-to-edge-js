# Nginx Configuration Examples

This directory contains example configuration files demonstrating various Nginx directives and use cases extracted from the `fortune-frontend-proxy_nginx.conf` file.

## Example Files Overview

### 1. `advanced-proxy.conf`
**Demonstrates:** Comprehensive proxy settings
- Proxy headers and timeouts
- WebSocket proxying
- S3 proxy configuration with header hiding
- SSL backend proxying
- Error handling and upstream selection

### 2. `basic-reverse-proxy.conf`
**Demonstrates:** Simple reverse proxy setup
- Basic proxy_pass configuration
- Essential proxy headers
- Mixed static and dynamic content serving
- HTTP to HTTPS redirects

### 3. `custom-logging.conf`
**Demonstrates:** Custom log formats
- `log_format` directive with various formats
- JSON logging format
- Security-focused logging
- Conditional logging (access_log off)

### 4. `dns-resolver.conf`
**Demonstrates:** DNS resolver configuration
- `resolver` directive for dynamic upstream resolution
- IPv6 settings and TTL configuration
- Environment variable usage in resolvers

### 5. `header-manipulation.conf`
**Demonstrates:** HTTP header manipulation
- `add_header` for response headers
- `proxy_set_header` for request headers
- `proxy_hide_header` for hiding upstream headers
- CORS header configuration
- Security headers
- WebSocket headers

### 6. `load-balancer.conf`
**Demonstrates:** Load balancing configuration
- Upstream servers with weights
- Backup server configuration
- SSL termination with load balancing
- Health check endpoints

### 7. `load-modules.conf`
**Demonstrates:** Dynamic module loading
- `load_module` directive for loading external modules
- Using loaded modules (e.g., headers_more_filter_module)

### 8. `location-regex.conf`
**Demonstrates:** Advanced location matching
- Exact match (`=`)
- Prefix match with priority (`^~`)
- Case-sensitive regex (`~`)
- Case-insensitive regex (`~*`)
- Capture groups and nested locations

### 9. `map-variables.conf`
**Demonstrates:** Variable mapping with map directive
- IP extraction from headers
- Country-based routing
- URI-based redirects
- Content-type mapping

### 10. `multi-server.conf`
**Demonstrates:** Multi-server setup
- Multiple upstream backends
- Server-specific routing
- Health monitoring endpoints
- API gateway patterns

### 11. `proxy-caching.conf`
**Demonstrates:** Proxy caching setup
- `proxy_cache_path` configuration
- Cache zones and key definitions
- Cache validity and bypass rules
- Cache purging

### 12. `redirects-rewrites.conf`
**Demonstrates:** URL manipulation
- Simple and conditional redirects
- Regex-based redirects with capture groups
- Status code customization
- Internal rewrites vs external redirects
- Trailing slash handling

### 13. `security-auth.conf`
**Demonstrates:** Security and authentication
- Basic HTTP authentication
- Rate limiting with `limit_req_zone`
- Connection limiting
- IP-based access control
- Security headers and CORS
- Large header buffer configuration

### 14. `simple-proxy.conf`
**Demonstrates:** Minimal reverse proxy
- Basic proxy configuration
- Essential headers only
- Simplest possible proxy setup

### 15. `ssl-config.conf`
**Demonstrates:** SSL/TLS configuration
- Certificate and key setup
- SSL session management
- Security protocols and ciphers
- OCSP stapling
- Security headers

### 16. `static-files-performance.conf`
**Demonstrates:** Static file serving and optimization
- File extension handling
- Cache headers and expiration
- Gzip compression
- Security for sensitive files
- Error page configuration
- Performance optimizations (sendfile, tcp_nopush)

### 17. `static-site-with-redirects.conf`
**Demonstrates:** Static site hosting with URL management
- WWW to non-WWW redirects
- HTTP to HTTPS redirects
- Legacy URL rewrites
- Static asset optimization
- Security headers for static sites

### 18. `upstream-config.conf`
**Demonstrates:** Upstream server configuration
- Load balancing methods (least_conn, round-robin)
- Server weights and health checks
- Connection pooling with keepalive
- Backup servers and failover

### 19. `variables-set.conf`
**Demonstrates:** Variable usage and manipulation
- `set` directive for variable assignment
- Conditional variable setting
- Variable usage in proxy_pass
- Dynamic backend selection
- Environment variable simulation

### 20. `worker-config.conf`
**Demonstrates:** Worker process configuration
- `worker_processes` directive for setting worker count
- `worker_rlimit_nofile` for file descriptor limits
- Event model configuration

## Key Directive Categories

### Core Directives
- `worker_processes`, `worker_rlimit_nofile`
- `events { worker_connections }`
- `resolver`
- `load_module`

### HTTP Context Directives
- `upstream`
- `map`
- `log_format`
- `proxy_cache_path`
- `limit_req_zone`, `limit_conn_zone`

### Server Context Directives
- `listen`, `server_name`
- `ssl_certificate`, `ssl_certificate_key`
- `access_log`, `error_log`
- `large_client_header_buffers`
- `underscores_in_headers`

### Location Context Directives
- `proxy_pass`
- `proxy_set_header`, `proxy_hide_header`
- `add_header`, `more_set_headers`
- `return`, `rewrite`
- `auth_basic`, `auth_basic_user_file`
- `limit_req`, `limit_conn`
- `set`
- `try_files`
- `expires`

### Location Matching Patterns
- `=` - Exact match
- `^~` - Prefix match with priority
- `~` - Case-sensitive regex
- `~*` - Case-insensitive regex
- No modifier - Prefix match

## Common Use Cases Covered

1. **Load Balancing**: Multiple backend servers with health checks
2. **Caching**: Static and dynamic content caching strategies
3. **Security**: Authentication, rate limiting, and security headers
4. **SSL/TLS**: Complete HTTPS setup with modern security
5. **Redirects**: URL rewriting and redirection patterns
6. **Proxying**: Reverse proxy with header manipulation
7. **Static Files**: Efficient static content serving
8. **WebSockets**: Real-time connection proxying
9. **API Gateway**: Request routing and transformation
10. **Monitoring**: Comprehensive logging and debugging

## Testing These Configurations

To test any of these configurations:

1. Copy the desired `.conf` file to your Nginx configuration directory
2. Adjust paths, domain names, and backend servers to match your environment
3. Test the configuration: `nginx -t`
4. Reload Nginx: `nginx -s reload`

## Notes

- Replace placeholder values (like `example.com`, `backend`, file paths) with actual values
- Some examples require additional modules (like `headers_more_filter_module`)
- Environment variables (like `${VPC_IP_RESOLVER}`) should be replaced with actual values
- SSL certificates and authentication files need to be created separately
- Consider security implications when implementing authentication and access controls
