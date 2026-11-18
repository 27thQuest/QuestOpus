'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DEST = path.join(__dirname, '..', 'www');

function copyRecursive(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
      console.log(`  copy  ${path.relative(SRC, sourcePath)}`);
    }
  }
}

console.log('Copying all files from src/ -> www/\n');

copyRecursive(SRC, DEST);

console.log('\nDone.');