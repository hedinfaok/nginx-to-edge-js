const { NextJSGenerator } = require('./dist/src/generators/nextjs-middleware.js');

console.log('Testing simple Next.js generation...');

const simpleConfig = {
  servers: [{
    listen: [{ port: 80 }],
    server_name: ['example.com'],
    locations: [{
      path: '/api/',
      directives: {
        proxy_pass: 'http://backend:3000',
        proxy_set_header: {
          'Host': '$host'
        }
      }
    }]
  }],
  metadata: {
    parsed_at: new Date(),
    parser_version: '1.0.0'
  }
};

try {
  const generator = new NextJSGenerator(simpleConfig);
  const result = generator.generate();
  console.log('✅ Generation successful!');
  console.log('Generated code length:', result.length);
  console.log('\nFirst 500 characters:');
  console.log(result.substring(0, 500));
} catch (error) {
  console.error('❌ Error:', error.message);
}
