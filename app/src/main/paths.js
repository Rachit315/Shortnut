const path = require('path');

const SRC = path.join(__dirname, '..');
const ROOT = path.join(SRC, '..');

module.exports = {
  preload: (name) => path.join(SRC, 'preload', `${name}.js`),
  page: (name) => `app://shortnut/${name}/index.html`,
  asset: (name) => path.join(ROOT, 'assets', name),
};
