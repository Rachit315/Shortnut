// After `electron-builder`, copy the installer into ../website/downloads and describe it in release.json
// (version, file name, size, SHA-256) so the landing page's download buttons point at it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
const file = `Shortnut-Setup-${version}.exe`;
const src = path.join(root, 'dist', file);
const outDir = path.join(root, '..', 'website', 'downloads');

if (!fs.existsSync(src)) {
  console.error(`[publish] ${path.relative(root, src)} not found. Run electron-builder first.`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const old of fs.readdirSync(outDir)) {
  if (/^Shortnut-Setup-.*\.exe$/.test(old) && old !== file) fs.rmSync(path.join(outDir, old));
}
fs.copyFileSync(src, path.join(outDir, file));

const buf = fs.readFileSync(src);
const release = {
  version,
  file,
  size: buf.length,
  sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  date: new Date().toISOString().slice(0, 10),
};
fs.writeFileSync(path.join(outDir, 'release.json'), JSON.stringify(release, null, 2) + '\n');
console.log(`[publish] website/downloads/${file} (${(buf.length / 1048576).toFixed(1)} MB) sha256=${release.sha256.slice(0, 12)}…`);
