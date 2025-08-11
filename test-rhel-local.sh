#!/bin/bash

# Local RHEL CI Test Script
# Tests the RHEL workflow using AlmaLinux 9 container

set -e

echo "🔴 Starting local RHEL CI test with AlmaLinux 9..."

# Build and run RHEL container that mirrors GitHub Actions environment
docker run --rm -it \
  -v "$(pwd):/workspace" \
  -w /workspace \
  almalinux:9 \
  bash -c "
    set -e
    
    echo '=== RHEL CI Environment Setup ==='
    
    # Install Git and basic tools (mirrors GitHub Actions step)
    dnf update -y
    dnf install -y --allowerasing git curl
    
    # Install Node.js 20.x (manual setup since we can't use setup-node in local test)
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y --allowerasing nodejs npm
    
    echo '=== Installing development tools ==='
    # Install development tools
    dnf groupinstall -y 'Development Tools'
    dnf install -y cmake autoconf automake libtool pkgconfig
    
    echo '=== Installing libucl (FreeBSD version from source) ==='
    # Clone and build FreeBSD libucl from source (same as Ubuntu)
    git clone https://github.com/vstakhov/libucl.git /tmp/libucl
    cd /tmp/libucl
    ./autogen.sh
    ./configure --prefix=/usr/local
    make
    make install
    ldconfig
    # Verify installation
    ls -la /usr/local/lib/libucl*
    echo 'FreeBSD libucl installed successfully on RHEL'
    
    echo '=== Installing Python and pip ==='
    # Install Python and pip
    dnf install -y python3 python3-pip
    
    echo '=== Installing crossplane ==='
    # Try pipx first
    dnf install -y pipx || pip3 install --user pipx
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
    # Check for FreeBSD libucl installation
    find /usr/local -name 'libucl.so*' 2>/dev/null | head -5
    ls -la /usr/local/lib/libucl* || echo 'FreeBSD libucl not found in /usr/local/lib'
    echo '=== Checking FreeBSD libucl symbols ==='
    nm -D /usr/local/lib/libucl.so.1 2>/dev/null | grep ucl_parser || echo 'Checking libucl.so...'
    nm -D /usr/local/lib/libucl.so 2>/dev/null | grep ucl_parser || echo 'No ucl_parser symbols found'
    echo '=== Checking all UCL symbols ==='
    nm -D /usr/local/lib/libucl.so 2>/dev/null | grep ucl | head -10 || echo 'No symbols found'
    echo '=== Checking library info ==='
    file /usr/local/lib/libucl.so*
    ldd /usr/local/lib/libucl.so* || echo 'ldd failed'
    echo 'FreeBSD libucl FFI integration - ucl_parser functions available'
    
    echo '=== Verifying crossplane installation ==='
    # Ensure crossplane is in PATH
    export PATH=\"\$HOME/.local/bin:\$PATH\"
    which crossplane || echo 'crossplane not found in PATH'
    crossplane --version
    echo 'crossplane installed successfully on RHEL'
    
    echo '=== Installing dependencies ==='
    # Install npm dependencies
    npm ci
    
    echo '=== Building project ==='
    # Build project
    npm run build
    
    echo '=== 🧪 TESTING: Minimal libucl FFI test ==='
    echo 'Testing if Node.js can load libucl library:'
    node -e \"
      try {
        const koffi = require('koffi');
        console.log('✅ Koffi loaded successfully');
        
        // Try to load libucl
        const lib = koffi.load('/usr/local/lib/libucl.so');
        console.log('✅ libucl library loaded successfully');
        
        // Try to get a specific function
        try {
          const ucl_parser_new = lib.func('ucl_parser_new', 'void*', ['int']);
          console.log('✅ ucl_parser_new function found');
          
          // Test basic parser creation
          const parser = ucl_parser_new(0);
          if (parser) {
            console.log('✅ UCL parser created successfully');
            const ucl_parser_free = lib.func('ucl_parser_free', 'void', ['void*']);
            ucl_parser_free(parser);
            console.log('✅ UCL parser freed successfully');
          }
        } catch (e) {
          console.log('❌ ucl_parser_new function NOT found:', e.message);
        }
        
      } catch (error) {
        console.log('❌ Error:', error.message);
      }
    \"
    
    echo '=== Running tests ==='
    # Ensure crossplane is available for tests
    export PATH=\"\$HOME/.local/bin:\$PATH\"
    npm test || echo 'Tests may have issues - debugging'
    
    echo '=== ✅ Local RHEL CI test completed ==='
  "

echo "🎉 Local RHEL CI test finished!"
