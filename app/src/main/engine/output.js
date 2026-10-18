// Output path resolution. Shortnut never overwrites an existing file: it picks "Name (2).ext" instead.
const fs = require('fs');
const path = require('path');

let resolveDir = (input) => path.dirname(input);

function configure({ outputMode, outputFolder }) {
  resolveDir = (input) => {
    if (outputMode === 'folder' && outputFolder) {
      try {
        fs.mkdirSync(outputFolder, { recursive: true });
        return outputFolder;
      } catch {
        /* fall back to source folder */
      }
    }
    return path.dirname(input);
  };
}

const baseName = (file) => path.basename(file, path.extname(file));

function uniquePath(dir, name, ext) {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Untitled';
  let candidate = path.join(dir, `${clean}.${ext}`);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${clean} (${i}).${ext}`);
  return candidate;
}

/** Output path for a converted/processed file, e.g. ("C:/a/Page 1.pdf", "jpg", "Cropped") -> "C:/a/Page 1 Cropped.jpg" */
function outputFor(input, ext, suffix = '') {
  const name = suffix ? `${baseName(input)} ${suffix}` : baseName(input);
  return uniquePath(resolveDir(input), name, ext);
}

/** A fresh folder next to the input, for multi-file outputs (pages, splits). */
function folderFor(input, label) {
  const dir = resolveDir(input);
  let candidate = path.join(dir, `${baseName(input)} (${label})`);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${baseName(input)} (${label} ${i})`);
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

module.exports = { configure, outputFor, folderFor, uniquePath, baseName, outputDir: (input) => resolveDir(input) };
