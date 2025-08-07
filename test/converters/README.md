# nginx-to-UCL Converter Tests

This directory contains tests for the nginx-to-UCL converter functionality.

## Test Files

- `nginx-parser.test.ts` - Tests for nginx configuration parsing using crossplane
- `nginx-to-ucl-transformer.test.ts` - Tests for UCL transformation logic
- `nginx-to-ucl-converter.test.ts` - Integration tests for the complete converter
- `fixtures/` - Test nginx configurations and expected UCL outputs

## Running Tests

```bash
# Run all converter tests
npm test -- --grep "nginx-to-ucl"

# Run specific test suites
npm test test/nginx-parser.test.ts
npm test test/nginx-to-ucl-transformer.test.ts
npm test test/nginx-to-ucl-converter.test.ts
```

## Test Requirements

- `crossplane` must be installed: `pip install crossplane`
- `libucl` must be available for FFI tests
- Test fixtures must be present in `fixtures/` directory
