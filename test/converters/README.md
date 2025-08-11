# nginx Converter Tests

This directory contains tests for the nginx configuration parsing functionality.

## Test Files

- `nginx-parser.test.ts` - Tests for nginx configuration parsing using crossplane

## Running Tests

```bash
# Run all converter tests
npm test test/converters/

# Run specific test suite
npm test test/converters/nginx-parser.test.ts
```

## Test Requirements

- crossplane must be installed (`pip install crossplane`)
- Tests use temporary files for nginx configurations

- `crossplane` must be installed: `pip install crossplane`
- `libucl` must be available for FFI tests
- Test fixtures must be present in `fixtures/` directory
