const fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(
  path.join(root, 'miniprogram/core/personal.js'),
  path.join(root, 'cloudfunctions/warmcare/lib/personal.js'),
);
fs.writeFileSync(
  path.join(root, 'cloudfunctions/warmcare/index.js'),
  require('./bundle-source')(root),
);
console.log('Self-contained cloud entry built locally. No cloud deployment performed.');
