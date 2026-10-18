// Optional "Convert with Shortnut" entry in the Explorer right-click menu (per-user, no admin rights).
// Written as a single .reg import so it costs one process launch.
const { app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CATEGORIES } = require('./engine/formats');

const VERB = 'Shortnut';
const EXTS = [...new Set(Object.values(CATEGORIES).flat())];

function command() {
  const exe = process.execPath;
  // In development the app path must be passed to electron.exe.
  const prefix = process.defaultApp ? `"${exe}" "${app.getAppPath()}"` : `"${exe}"`;
  return `${prefix} --open "%1"`;
}

const regString = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function buildReg(enable) {
  const lines = ['Windows Registry Editor Version 5.00', ''];
  for (const ext of EXTS) {
    const key = `HKEY_CURRENT_USER\\Software\\Classes\\SystemFileAssociations\\.${ext}\\shell\\${VERB}`;
    if (!enable) {
      lines.push(`[-${key}]`, '');
      continue;
    }
    lines.push(`[${key}]`, `"MUIVerb"=${regString('Convert with Shortnut')}`, `"Icon"=${regString(`${process.execPath},0`)}`, '');
    lines.push(`[${key}\\command]`, `@=${regString(command())}`, '');
  }
  return lines.join('\r\n');
}

function apply(enable) {
  if (process.platform !== 'win32') return Promise.resolve();
  const file = path.join(os.tmpdir(), `shortnut-menu-${process.pid}.reg`);
  // .reg files must be UTF-16LE with BOM.
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(buildReg(enable), 'utf16le')]));
  return new Promise((resolve) => {
    execFile('reg.exe', ['import', file], { windowsHide: true }, (err) => {
      fs.rm(file, () => {});
      if (err) console.warn('[explorer] reg import failed:', err.message);
      resolve(!err);
    });
  });
}

/** Paths passed via "--open <file>" on the command line. */
function pathsFromArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--open' && argv[i + 1]) out.push(argv[++i]);
  }
  return out;
}

module.exports = { apply, pathsFromArgv, buildReg };
