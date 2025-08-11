#!/bin/bash

# Quick libucl symbol inspector for Ubuntu
# This will help us understand the libucl symbols available

set -e

echo "🔍 Quick Ubuntu libucl symbol inspection..."

# Run a minimal Ubuntu container with architecture detection
docker run --rm -it \
  -v "$(pwd):/workspace" \
  -w /workspace \
  ubuntu:22.04 \
  bash -c "
    set -e
    
    echo '=== System info ==='
    uname -a
    echo 'Architecture:' \$(dpkg --print-architecture)
    
    echo '=== Installing tools ==='
    apt-get update -qq
    apt-get install -y libucl-dev file binutils -qq
    
    echo '=== Detecting libucl path ==='
    ARCH=\$(dpkg --print-architecture)
    if [ \"\$ARCH\" = \"amd64\" ]; then
        LIBPATH=\"/usr/lib/x86_64-linux-gnu/libucl.so.1.0.0\"
    elif [ \"\$ARCH\" = \"arm64\" ]; then
        LIBPATH=\"/usr/lib/aarch64-linux-gnu/libucl.so.1.0.0\"
    else
        echo \"Unknown architecture: \$ARCH\"
        exit 1
    fi
    
    echo \"Using library path: \$LIBPATH\"
    
    echo '=== Library info ==='
    file \"\$LIBPATH\"
    ls -la \"\$LIBPATH\"
    
    echo '=== UCL function symbols ==='
    echo 'Looking for ucl_parser functions:'
    nm -D \"\$LIBPATH\" | grep ucl_parser || echo 'No ucl_parser symbols found'
    
    echo 'All UCL symbols (first 10):'
    nm -D \"\$LIBPATH\" | grep ucl | head -10 || echo 'No UCL symbols found'
    
    echo '=== Symbol export check ==='
    echo 'Checking if symbols are properly exported:'
    readelf -Ws \"\$LIBPATH\" | grep ucl_parser | head -5 || echo 'No ucl_parser in symbol table'
    
    echo '✅ libucl symbol inspection completed'
  "

echo "🎉 libucl inspection finished!"
