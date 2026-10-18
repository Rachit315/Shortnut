// Bridge to a hidden renderer that does browser-only work: PDF rendering (pdf.js),
// decoding images sharp can't read (BMP, ICO), and HTML -> PDF printing.
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win = null;
let ready = null;
let seq = 0;
const pending = new Map();

let listening = false;

function ensure() {
  if (win && !win.isDestroyed()) return ready;
  if (!listening) {
    listening = true;
    ipcMain.on('worker:res', (_e, { id, result, error }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    });
  }
  win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'worker.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  ready = new Promise((resolve) => {
    ipcMain.once('worker:ready', () => resolve());
  });
  win.loadURL('app://shortnut/worker/index.html');
  win.on('closed', () => {
    win = null;
    for (const p of pending.values()) p.reject(new Error('Worker closed'));
    pending.clear();
  });
  return ready;
}

async function call(method, ...args) {
  await ensure();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    win.webContents.send('worker:req', { id, method, args });
  });
}

const pdf = {
  open: (bytes) => call('pdfOpen', bytes),
  render: (docId, page, scale, mime, quality) => call('pdfRender', docId, page, scale, mime, quality),
  text: (docId) => call('pdfText', docId),
  close: (docId) => call('pdfClose', docId),
};

const decodeImage = (bytes, mime) => call('decodeImage', bytes, mime);

/**
 * Render HTML to PDF using Chromium's print engine. Scripts are disabled.
 * @param {string} html full HTML document, or null when `file` is given
 */
async function htmlToPdf({ html, file }) {
  const printer = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  let tmp = null;
  try {
    if (file) {
      await printer.loadFile(file);
    } else {
      tmp = path.join(os.tmpdir(), `shortnut-${process.pid}-${Date.now()}.html`);
      fs.writeFileSync(tmp, html, 'utf8');
      await printer.loadFile(tmp);
    }
    return await printer.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
    });
  } finally {
    if (!printer.isDestroyed()) printer.destroy();
    if (tmp) fs.rm(tmp, () => {});
  }
}

/** Visible text of an HTML document (as a browser would render it). */
function htmlToText(file) {
  return call('htmlText', fs.readFileSync(file, 'utf8'));
}

function destroy() {
  if (win && !win.isDestroyed()) win.destroy();
}

module.exports = { pdf, decodeImage, htmlToPdf, htmlToText, destroy, ensure };
