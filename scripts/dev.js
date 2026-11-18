'use strict';

const { spawn } = require('child_process');
const { execSync } = require('child_process');

console.log('Quest Opus mobile dev server\n');

// Copy everything from src/ to www/
execSync('node scripts/copy-src.js', {
  stdio: 'inherit',
});

// Start the web server
console.log('\nStarting server...\n');

const server = spawn(
  'npx',
  ['serve', 'www', '-l', '3000', '--no-clipboard'],
  {
    stdio: 'inherit',
    shell: true,
  }
);

function shutdown() {
  if (!server.killed) {
    server.kill();
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);