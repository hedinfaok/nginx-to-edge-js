const fs = require('fs');

console.log('🔬 DETAILED DIRECTIVE IMPLEMENTATION VERIFICATION\n');

const generators = {
  'CloudFlare Workers': 'src/generators/cloudflare.ts',
  'Next.js Middleware': 'src/generators/nextjs-middleware.ts',
  'AWS Lambda@Edge': 'src/generators/lambda-edge.ts',
  'QuickJS': 'src/generators/quickjs.ts'
};

const directives = [
  {
    name: 'proxy_pass',
    patterns: ['location.directives.proxy_pass', 'proxy_pass']
  },
  {
    name: 'proxy_set_header',
    patterns: ['location.directives.proxy_set_header', 'proxy_set_header']
  },
  {
    name: 'proxy_hide_header', 
    patterns: ['location.directives.proxy_hide_header', 'proxy_hide_header']
  },
  {
    name: 'add_header',
    patterns: ['location.directives.add_header', 'add_header']
  },
  {
    name: 'set (variables)',
    patterns: ['location.directives.set', 'directives.set']
  },
  {
    name: 'map directives',
    patterns: ['generateMapFunctions', 'maps']
  },
  {
    name: 'if conditionals', 
    patterns: ['ConditionalDirective', 'location.directives.if']
  },
  {
    name: 'try_files',
    patterns: ['location.directives.try_files', 'try_files', 'tryStaticFile']
  },
  {
    name: 'alias',
    patterns: ['location.directives.alias', 'alias']
  },
  {
    name: 'index',
    patterns: ['location.directives.index', 'index']
  },
  {
    name: 'return/redirects',
    patterns: ['location.directives.return', 'return']
  },
  {
    name: 'rewrite',
    patterns: ['location.directives.rewrite', 'rewrite']
  }
];

console.log('Platform'.padEnd(18) + ' | ' + directives.map(d => d.name.substring(0,10)).join(' | '));
console.log('='.repeat(18) + ' | ' + directives.map(d => '='.repeat(10)).join(' | '));

Object.entries(generators).forEach(([platform, file]) => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    let row = platform.padEnd(18) + ' | ';
    
    directives.forEach(directive => {
      const implemented = directive.patterns.some(pattern => content.includes(pattern));
      row += (implemented ? '✅' : '❌').padEnd(10) + ' | ';
    });
    
    console.log(row);
  } catch (error) {
    console.log(`${platform.padEnd(18)} | ERROR: File not found`);
  }
});

console.log('\n📋 IMPLEMENTATION GAPS IDENTIFIED:\n');

// Check for specific missing implementations
Object.entries(generators).forEach(([platform, file]) => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const gaps = [];
    
    // Check key directive implementations
    if (!content.includes('proxy_set_header')) gaps.push('proxy_set_header');
    if (!content.includes('proxy_hide_header')) gaps.push('proxy_hide_header');
    if (!content.includes('try_files') && !content.includes('tryStaticFile')) gaps.push('try_files');
    if (!content.includes('add_header')) gaps.push('add_header');
    
    if (gaps.length > 0) {
      console.log(`❌ ${platform}: Missing ${gaps.join(', ')}`);
    } else {
      console.log(`✅ ${platform}: Full implementation`);
    }
  } catch (error) {
    console.log(`❓ ${platform}: File error`);
  }
});

console.log('\n🎯 PRIORITY FIXES NEEDED:\n');
console.log('1. Next.js Middleware: Add proxy_set_header, try_files support');
console.log('2. Lambda@Edge: Add proxy_hide_header, try_files support'); 
console.log('3. QuickJS: Add proxy_hide_header, add_header, try_files support');
console.log('4. Ensure consistent variable handling across all platforms');
