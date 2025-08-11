#!/bin/bash

# Local Ubuntu CI Test Script
# Replicates the GitHub Actions Ubuntu workflow in a local Docker container

set -e

echo "🐳 Starting local Ubuntu CI test..."

# Build and run Ubuntu container that mirrors GitHub Actions environment
docker run --rm -it \
  -v "$(pwd):/workspace" \
  -w /workspace \
  ubuntu:22.04 \
  bash -c "
    set -e
    
    echo '=== Ubuntu CI Environment Setup ==='
    
    # Update package lists (mirrors GitHub Actions step)
    apt-get update
    
    # Install Node.js 20.x (mirrors GitHub Actions node setup)
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    echo '=== Installing libucl ==='
    # Install libucl (exact same as GitHub Actions)
    apt-get install -y libucl-dev
    
    echo '=== Installing Python and pip ==='
    # Install Python and pip (exact same as GitHub Actions)
    apt-get install -y python3 python3-pip python3-venv
    
    echo '=== Installing crossplane ==='
    # Install crossplane with same logic as GitHub Actions
    apt-get install -y pipx || true
    if command -v pipx >/dev/null 2>&1; then
      pipx install crossplane
      echo 'crossplane installed via pipx'
    else
      # Fallback to pip3 with user install
      pip3 install --user crossplane
      echo 'crossplane installed via pip3 --user'
      # Add user bin to PATH
      export PATH=\"\$HOME/.local/bin:\$PATH\"
    fi
    
    echo '=== Verifying libucl installation ==='
    # Check common libucl locations on Ubuntu (same as GitHub Actions)
    find /usr -name 'libucl.so*' 2>/dev/null | head -5
    ls -la /usr/lib/x86_64-linux-gnu/libucl.so* || echo 'libucl not found in expected location'
    
    echo '=== 🔍 DEBUGGING: Checking libucl symbols ==='
    echo 'Library file info:'
    file /usr/lib/x86_64-linux-gnu/libucl.so.1.0.0
    
    echo 'Library dependencies:'
    ldd /usr/lib/x86_64-linux-gnu/libucl.so.1.0.0 || echo 'ldd failed'
    
    echo 'UCL parser symbols:'
    nm -D /usr/lib/x86_64-linux-gnu/libucl.so.1.0.0 | grep ucl_parser || echo 'No ucl_parser symbols found'
    
    echo 'All UCL symbols (first 20):'
    nm -D /usr/lib/x86_64-linux-gnu/libucl.so.1.0.0 | grep ucl | head -20 || echo 'No UCL symbols found'
    
    echo 'libucl FFI integration - no ucl_tool binary needed'
    
    echo '=== Verifying crossplane installation ==='
    # Ensure crossplane is in PATH (same as GitHub Actions)
    export PATH=\"\$HOME/.local/bin:\$PATH\"
    which crossplane || echo 'crossplane not found in PATH'
    crossplane --version
    echo 'crossplane installed successfully on Ubuntu'
    
    echo '=== Installing dependencies ==='
    # Install npm dependencies (same as GitHub Actions)
    npm ci
    
    echo '=== Building project ==='
    # Build project (same as GitHub Actions)
    npm run build
    
    echo '=== 🧪 TESTING: Minimal libucl FFI test ==='
    echo 'Testing if Node.js can load libucl library:'
    node -e \"
      try {
        const koffi = require('koffi');
        console.log('✅ Koffi loaded successfully');
        
        // Try to load libucl
        const lib = koffi.load('/usr/lib/x86_64-linux-gnu/libucl.so.1.0.0');
        console.log('✅ libucl library loaded successfully');
        
        // List all available functions
        console.log('📋 Available library functions:');
        console.log(Object.getOwnPropertyNames(lib).slice(0, 20));
        
        // Try to get a specific function
        try {
          const ucl_parser_new = lib.func('ucl_parser_new', 'void*', ['int']);
          console.log('✅ ucl_parser_new function found');
        } catch (e) {
          console.log('❌ ucl_parser_new function NOT found:', e.message);
        }
        
      } catch (error) {
        console.log('❌ Error:', error.message);
      }
    \"
    
    echo '=== Running tests ==='
    # Ensure crossplane is available for tests (same as GitHub Actions)
    export PATH=\"\$HOME/.local/bin:\$PATH\"
    npm test || echo 'Tests failed - this is expected for debugging'
    
    echo '=== ✅ Local Ubuntu CI test completed ==='
  "

echo "🎉 Local Ubuntu CI test finished!"
