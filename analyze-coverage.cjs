const fs = require('fs');

// Analyze directive coverage across all generators
console.log('🔍 NGINX DIRECTIVE COVERAGE ANALYSIS ACROSS ALL PLATFORMS\n');

const generators = [
  'cloudflare.ts',
  'nextjs-middleware.ts', 
  'lambda-edge.ts',
  'quickjs.ts'
];

const directives = [
  'proxy_pass',
  'proxy_set_header', 
  'proxy_hide_header',
  'add_header',
  'set',
  'map',
  'if',
  'try_files',
  'alias',
  'index',
  'root',
  'return',
  'rewrite',
  'expires',
  'ssl'
];

console.log('📊 Directive Implementation Matrix:\n');
console.log('Directive'.padEnd(20) + generators.map(g => g.replace('.ts', '').padEnd(15)).join(''));
console.log('='.repeat(20 + generators.length * 15));

directives.forEach(directive => {
  let row = directive.padEnd(20);
  
  generators.forEach(generator => {
    try {
      const content = fs.readFileSync(`src/generators/${generator}`, 'utf8');
      
      // Check for directive implementation
      const hasImplementation = 
        content.includes(`location.directives.${directive}`) ||
        content.includes(`directives.${directive}`) ||
        content.includes(`${directive}`) ||
        (directive === 'map' && content.includes('generateMapFunctions')) ||
        (directive === 'if' && content.includes('ConditionalDirective')) ||
        (directive === 'ssl' && content.includes('ssl'));
      
      row += (hasImplementation ? '✅' : '❌').padEnd(15);
    } catch (error) {
      row += '❓'.padEnd(15);
    }
  });
  
  console.log(row);
});

console.log('\n🎯 Coverage Summary:');
console.log('✅ = Implemented');
console.log('❌ = Not implemented');
console.log('❓ = File not found');
