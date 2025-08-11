# nginx-to-edge-js Installation Guide

## Prerequisites

Before installing nginx-to-edge-js, ensure you have the following installed:

### 1. Node.js and npm (Required)

**macOS (using Homebrew):**
```bash
brew install node
```

**macOS (using official installer):**
- Download from [nodejs.org](https://nodejs.org/)
- Install the LTS version

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Linux (CentOS/RHEL):**
```bash
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs npm
```

### 2. crossplane (Required)

**Install via pip (Recommended):**
```bash
pip install crossplane
# or
pip3 install crossplane
```

**Install via pipx (Isolated):**
```bash
pipx install crossplane
```

**Verify installation:**
```bash
crossplane --version
```

## Installation

### Global Installation (Recommended for CLI use)

```bash
npm install -g nginx-to-edge-js
```

### Local Installation

```bash
npm install nginx-to-edge-js
```

### From Source

```bash
git clone https://github.com/yourusername/nginx-to-edge-js.git
cd nginx-to-edge-js

### Local Installation (For development or programmatic use)

```bash
npm install nginx-to-edge-js
```

### Development Setup

If you want to contribute or modify the code:

```bash
# Clone the repository
git clone https://github.com/yourusername/nginx-to-edge-js.git
cd nginx-to-edge-js

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Install globally for testing CLI
npm link
```

## Verification

Verify the installation:

```bash
nginx-to-edge-js --version
```

## Next Steps

1. Check out the [examples directory](./examples/) for sample nginx configurations
2. Read the [usage documentation](./README.md#usage) for CLI commands
3. See the [API documentation](./docs/) for programmatic usage

## Troubleshooting

### Common Issues

**1. `nginx-to-edge-js: command not found`**
- Ensure the global npm bin directory is in your PATH
- Check with: `npm config get prefix`
- Add to PATH: `export PATH="$(npm config get prefix)/bin:$PATH"`

**2. TypeScript compilation errors**
- Ensure you have TypeScript installed: `npm install -g typescript`
- Build the project: `npm run build`

**3. libucl not found**
- The project will fall back to a basic parser if libucl is not available
- For full UCL support, install libucl as shown above

**4. Permission errors**
- Use `sudo` for global installation on Unix systems
- Or configure npm to use a different directory: [npm documentation](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)
