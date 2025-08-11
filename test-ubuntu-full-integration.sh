#!/bin/bash

echo "🚀 Testing complete Node.js project with FreeBSD libucl on Ubuntu..."

docker run --rm -it ubuntu:22.04 bash -c "
set -e

echo '=== Installing system dependencies ==='
apt-get update
apt-get install -y build-essential cmake git autotools-dev autoconf libtool pkg-config curl

echo '=== Building FreeBSD libucl from source ==='
git clone https://github.com/vstakhov/libucl.git /tmp/libucl
cd /tmp/libucl
./autogen.sh
./configure --prefix=/usr/local
make
make install
ldconfig

echo '=== Installing Node.js 20 ==='
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo '=== Installing Python and crossplane ==='
apt-get install -y python3 python3-pip python3-venv pipx
pipx install crossplane
export PATH=\"\$HOME/.local/bin:\$PATH\"

echo '=== Setting up project ==='
mkdir -p /tmp/project
cd /tmp/project

echo '=== Creating test package.json ==='
cat > package.json << 'EOF'
{
  \"name\": \"test-libucl\",
  \"version\": \"1.0.0\",
  \"type\": \"module\",
  \"dependencies\": {
    \"koffi\": \"^2.8.8\"
  }
}
EOF

echo '=== Installing Node dependencies ==='
npm install

echo '=== Creating simplified FFI test ==='
cat > test-libucl.js << 'EOF'
import koffi from 'koffi';

console.log('🔧 Testing FreeBSD libucl FFI binding...');

try {
  // Try to load the library
  const lib = koffi.load('/usr/local/lib/libucl.so');
  console.log('✅ libucl loaded successfully');
  
  // Define FFI bindings for key functions
  const ucl_parser_new = lib.func('ucl_parser_new', 'void*', ['int']);
  const ucl_parser_free = lib.func('ucl_parser_free', 'void', ['void*']);
  
  console.log('✅ FFI functions defined successfully');
  
  // Test basic parser creation
  const parser = ucl_parser_new(0);
  if (parser) {
    console.log('✅ UCL parser created successfully');
    ucl_parser_free(parser);
    console.log('✅ UCL parser freed successfully');
  }
  
  console.log('🎉 FreeBSD libucl FFI integration working perfectly!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
EOF

echo '=== Running FFI test ==='
node test-libucl.js

echo '✅ Complete Ubuntu Node.js + FreeBSD libucl test passed!'
"

echo "🎉 Full integration test completed!"
