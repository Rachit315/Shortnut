// Tool editor windows (Crop, Add BG, Edit, Annotate, Redact, Metadata).
const { BrowserWindow, nativeTheme, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const engine = require('./engine');
const store = require('./store');
const jobs = require('./jobs');
const output = require('./engine/output');

const { extOf, canonical, categoryOf } = engine.formats;

const SIZES = {
  crop: [560, 780],
  addbg: [620, 800],
  edit: [900, 680],
  annotate: [980, 720],
  redact: [900, 700],
  metadata: [560, 680],
};

const SUFFIX = { crop: 'Cropped', addbg: 'With Background', edit: 'Edited', annotate: 'Annotated', redact: 'Redacted' };
const windows = new Map(); // webContents.id -> { tool, file, win }

function open(tool, file) {
  const [w, h] = SIZES[tool] || [800, 640];
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(w, area.width - 40);
  const height = Math.min(h, area.height - 40);
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    minWidth: 480,
    minHeight: 520,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2a1d1a' : '#fbe9dc',
    title: `${tool} – ${path.basename(file)}`,
    icon: paths.asset('icon.png'),
    webPreferences: { preload: paths.preload('app'), spellcheck: false },
  });
  windows.set(win.webContents.id, { tool, file, win });
  win.loadURL(`${paths.page('editor')}?tool=${encodeURIComponent(tool)}`);
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  const id = win.webContents.id;
  win.on('closed', () => windows.delete(id));
  return win;
}

/** Data the editor page needs to start. */
async function init(sender) {
  const entry = windows.get(sender.id);
  if (!entry) throw new Error('Editor not found');
  const { tool, file } = entry;
  const info = { tool, file, name: path.basename(file), ext: canonical(extOf(file)), category: categoryOf(file), size: fs.statSync(file).size };
  if (tool === 'metadata') {
    if (info.category === 'pdf') return { ...info, pdf: await engine.pdf.readMetadata(file) };
    return { ...info, meta: await engine.image.readMetadata(file), png: new Uint8Array(await engine.image.toPng(file, 900)) };
  }
  return { ...info, png: new Uint8Array(await engine.image.toPng(file)) };
}

function outputFormat(tool, ext) {
  if (tool === 'addbg') return 'png';
  if (['heic', 'svg', 'ico', 'gif'].includes(ext)) return 'png';
  return ext;
}

function finish(sender, outputs, title, extra = {}) {
  const entry = windows.get(sender.id);
  const anchor = entry ? (() => {
    const b = entry.win.getBounds();
    return { x: b.x + b.width / 2, y: b.y + b.height - 80 };
  })() : undefined;
  jobs.recordInstant({ title, outputs, files: entry ? [entry.file] : [], anchor, ...extra });
  if (entry) setTimeout(() => !entry.win.isDestroyed() && entry.win.close(), 50);
  return outputs;
}

/** Save the edited canvas (PNG bytes) next to the original. */
async function save(sender, { png, format }) {
  const entry = windows.get(sender.id);
  if (!entry) throw new Error('Editor not found');
  const { tool, file } = entry;
  const settings = store.settings.get();
  output.configure(settings);
  const target = format || outputFormat(tool, canonical(extOf(file)));
  const buffer = target === 'png' ? Buffer.from(png) : await engine.image.fromPng(Buffer.from(png), target, settings);
  const out = output.outputFor(file, target, SUFFIX[tool] || 'Edited');
  fs.writeFileSync(out, buffer);
  return finish(sender, [out], 'Saved');
}

async function stripMetadata(sender) {
  const entry = windows.get(sender.id);
  if (!entry) throw new Error('Editor not found');
  const settings = store.settings.get();
  output.configure(settings);
  let out;
  if (categoryOf(entry.file) === 'pdf') {
    out = output.outputFor(entry.file, 'pdf', 'Clean');
    fs.writeFileSync(out, await engine.pdf.writeMetadata(entry.file, {}, true));
  } else {
    const { buffer, format } = await engine.image.stripMetadata(entry.file, settings);
    out = output.outputFor(entry.file, format, 'Clean');
    fs.writeFileSync(out, buffer);
  }
  return finish(sender, [out], 'Metadata removed');
}

async function writePdfMetadata(sender, fields) {
  const entry = windows.get(sender.id);
  if (!entry) throw new Error('Editor not found');
  output.configure(store.settings.get());
  const out = output.outputFor(entry.file, 'pdf', 'Edited');
  fs.writeFileSync(out, await engine.pdf.writeMetadata(entry.file, fields, false));
  return finish(sender, [out], 'Metadata saved');
}

function close(sender) {
  windows.get(sender.id)?.win.close();
}

module.exports = { open, init, save, stripMetadata, writePdfMetadata, close };
