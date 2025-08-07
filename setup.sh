#!/bin/bash

# nginx-to-edge-js Development Setup Script
# This script helps set up the development environment

set -e

echo "🚀 nginx-to-edge-js Development Setup"
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "📥 Please install Node.js from https://nodejs.org/ or use:"
    echo "   macOS: brew install node"
    echo "   Linux: See INSTALL.md for distribution-specific instructions"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    echo "📥 npm should come with Node.js. Please reinstall Node.js."
    exit 1
fi

echo "✅ Node.js $(node --version) found"
echo "✅ npm $(npm --version) found"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building project..."
npm run build

# Run tests
echo "🧪 Running tests..."
npm test

# Make CLI available globally for development
echo "🔗 Linking CLI for global access..."
npm link

echo ""
echo "✅ Setup complete! You can now use:"
echo "   nginx-to-edge-js --help"
echo ""
echo "📖 Next steps:"
echo "   1. Try parsing an example: nginx-to-edge-js parse examples/basic-reverse-proxy/nginx.conf"
echo "   2. Generate CloudFlare config: nginx-to-edge-js generate cloudflare examples/basic-reverse-proxy/nginx.conf"
echo "   3. Run development mode: npm run dev"
echo ""
echo "🎉 Happy coding!"
