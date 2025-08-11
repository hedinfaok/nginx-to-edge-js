#!/bin/bash

echo "🔧 Testing FreeBSD libucl build on Ubuntu..."

docker run --rm -it ubuntu:22.04 bash -c "
set -e

echo '=== System setup ==='
apt-get update
apt-get install -y build-essential cmake git autotools-dev autoconf libtool pkg-config

echo '=== Building FreeBSD libucl from source ==='
git clone https://github.com/vstakhov/libucl.git /tmp/libucl
cd /tmp/libucl

echo '=== Configuring build ==='
./autogen.sh
./configure --prefix=/usr/local

echo '=== Compiling ==='
make

echo '=== Installing ==='
make install
ldconfig

echo '=== Verifying installation ==='
ls -la /usr/local/lib/libucl*

echo '=== Checking symbols ==='
nm -D /usr/local/lib/libucl.so 2>/dev/null | grep ucl_parser | head -5 || echo 'No ucl_parser symbols'
nm -D /usr/local/lib/libucl.so 2>/dev/null | grep ucl | head -10

echo '=== Library info ==='
file /usr/local/lib/libucl.so*
ldd /usr/local/lib/libucl.so || echo 'ldd failed'

echo '✅ FreeBSD libucl build test completed!'
"

echo "🎉 Ubuntu libucl build test finished!"
