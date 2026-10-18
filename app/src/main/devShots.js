// Development aid: `npm run shots -- <dir>` opens every window with sample content and saves screenshots.
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const overlay = require('./overlay');
const toast = require('./toast');
const editor = require('./editor');
const engine = require('./engine');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(win, file) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(file, img.toPNG());
  console.log('[shots]', path.basename(file));
}

module.exports = async function run({ dir, sample, mainWin, navigate }) {
  fs.mkdirSync(dir, { recursive: true });
  if (mainWin.webContents.isLoading()) await new Promise((r) => mainWin.webContents.once('did-finish-load', r));
  await wait(1500);

  for (const route of ['home', 'formats', 'settings', 'about', 'activity']) {
    navigate(route);
    await wait(700);
    await capture(mainWin, path.join(dir, `main-${route}.png`));
  }

  const files = [sample];
  const menu = engine.formats.menuFor(['png']);
  overlay.show({ x: 700, y: 450 }, { clickMode: true, paths: files, menu, info: { count: 1, size: fs.statSync(sample).size } });
  await wait(600);
  await capture(overlay.window, path.join(dir, 'wheel-convert.png'));
  overlay.window.webContents.send('overlay:toggle');
  await wait(500);
  await capture(overlay.window, path.join(dir, 'wheel-tools.png'));
  const pdfMenu = engine.formats.menuFor(['pdf']);
  overlay.show({ x: 700, y: 450 }, { clickMode: true, paths: files, menu: pdfMenu, info: { count: 1, size: 1153433 } });
  await wait(600);
  await capture(overlay.window, path.join(dir, 'wheel-pdf.png'));
  overlay.hide();

  toast.update([{ id: 1, title: 'Converting to JPG', status: 'running', total: 3, done: 1, fraction: 0.45, outputs: [], errors: [], notes: [] }], { x: 700, y: 450 });
  await wait(600);
  const toastWin = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/toast/'));
  await capture(toastWin, path.join(dir, 'toast-running.png'));
  toast.update([{ id: 1, title: 'Compressed', status: 'done', total: 1, done: 1, fraction: 1, outputs: [sample], errors: [], notes: [], before: 1250000, after: 412000 }]);
  await wait(500);
  await capture(toastWin, path.join(dir, 'toast-done.png'));
  toast.hide();

  for (const tool of ['crop', 'addbg', 'edit', 'annotate', 'redact', 'metadata']) {
    const win = editor.open(tool, sample);
    await new Promise((r) => win.once('ready-to-show', r));
    await wait(1200);
    await capture(win, path.join(dir, `editor-${tool}.png`));
    win.close();
  }
  console.log('[shots] done');
};
