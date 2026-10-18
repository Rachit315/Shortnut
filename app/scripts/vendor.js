// Copies browser-side libraries into src/renderer/vendor so renderer pages can load them
// from the app:// protocol without reaching into node_modules at runtime.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pdfjs = path.join(root, 'node_modules', 'pdfjs-dist');
const out = path.join(root, 'src', 'renderer', 'vendor', 'pdfjs');

if (!fs.existsSync(pdfjs)) {
  console.warn('[vendor] pdfjs-dist not installed yet, skipping');
  process.exit(0);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  fs.copyFileSync(path.join(pdfjs, 'build', f), path.join(out, f));
}
for (const dir of ['cmaps', 'standard_fonts']) {
  fs.cpSync(path.join(pdfjs, dir), path.join(out, dir), { recursive: true });
}
console.log('[vendor] pdf.js copied to', path.relative(root, out));
