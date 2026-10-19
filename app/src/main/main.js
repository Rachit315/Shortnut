// Shortnut â€” main process entry.
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, nativeTheme, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const protocol = require('./protocol');
const store = require('./store');
const paths = require('./paths');
const watcher = require('./dragWatcher');
const overlay = require('./overlay');
const toast = require('./toast');
const jobs = require('./jobs');
const editor = require('./editor');
const explorer = require('./explorer');
const engine = require('./engine');

const isDev = process.argv.includes('--dev');
// Started at login, or from the Explorer menu just to convert something: stay in the tray.
const startHidden = process.argv.includes('--hidden') || process.argv.includes('--open');

protocol.registerScheme();
app.setAppUserModelId('app.shortnut.desktop');

if (!process.argv.includes('--self-test') && !app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWin = null;
let tray = null;
let quitting = false;

/* ---------------- main window ---------------- */

function themeColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { bg: dark ? '#161210' : '#faf6f2', symbol: dark ? '#f3e9e2' : '#2b211c' };
}

function createMainWindow() {
  const c = themeColors();
  mainWin = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: 'Shortnut',
    icon: paths.asset('icon.png'),
    backgroundColor: c.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: c.symbol, height: 44 },
    webPreferences: { preload: paths.preload('app'), spellcheck: false },
  });
  mainWin.loadURL(paths.page('app'));
  mainWin.once('ready-to-show', () => {
    if (!startHidden || !store.settings.value('onboarded')) mainWin.show();
  });
  mainWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.on('closed', () => (mainWin = null));
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isDev) mainWin.webContents.openDevTools({ mode: 'detach' });
}

function showMain(route) {
  if (!mainWin) createMainWindow();
  if (route) mainWin.webContents.send('nav', route);
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

nativeTheme.on('updated', () => {
  if (!mainWin) return;
  const c = themeColors();
  try {
    mainWin.setTitleBarOverlay({ color: '#00000000', symbolColor: c.symbol, height: 44 });
  } catch {
    /* not supported */
  }
});

/* ---------------- tray ---------------- */

function trayIcon() {
  const img = nativeImage.createFromPath(paths.asset('tray.png'));
  return img.isEmpty() ? nativeImage.createFromPath(paths.asset('icon.png')).resize({ width: 16, height: 16 }) : img;
}

function buildTrayMenu() {
  const s = store.settings.get();
  return Menu.buildFromTemplate([
    { label: 'Open Shortnut', click: () => showMain('home') },
    { type: 'separator' },
    {
      label: s.enabled ? 'Pause drag + Shift' : 'Resume drag + Shift',
      click: () => applySettings({ enabled: !s.enabled }),
    },
    { label: 'Convert filesâ€¦', click: () => pickFiles() },
    { label: 'Settings', click: () => showMain('settings') },
    { type: 'separator' },
    { label: 'Quit Shortnut', click: () => quit() },
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Shortnut â€” drag a file and press Shift');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => showMain());
}

/* ---------------- settings ---------------- */

function applySettings(patch = {}) {
  const before = store.settings.get();
  const s = store.settings.set(patch);
  watcher.setKey(s.triggerKey);
  if (s.enabled) watcher.start();
  else watcher.stop();
  // Re-applied on every launch so the startup entry always points at the current install location.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin, args: ['--hidden'] });
  if (app.isPackaged && patch.explorerMenu !== undefined && patch.explorerMenu !== before.explorerMenu) explorer.apply(!!s.explorerMenu);
  if (patch.theme !== undefined) nativeTheme.themeSource = s.theme;
  tray?.setContextMenu(buildTrayMenu());
  broadcast('settings:changed', s);
  broadcast('state:changed', appState());
  return s;
}

function appState() {
  return {
    version: app.getVersion(),
    watching: watcher.running,
    enabled: store.settings.value('enabled'),
    triggerKey: store.settings.value('triggerKey'),
    platform: process.platform,
  };
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}

/* ---------------- wheel ---------------- */

function fileInfo(files) {
  let size = 0;
  for (const f of files) {
    try {
      size += fs.statSync(f).size;
    } catch {
      /* missing */
    }
  }
  return { count: files.length, size, name: path.basename(files[0] || '') };
}

function menuForPaths(files) {
  return engine.formats.menuFor(files.map(engine.formats.extOf));
}

/** Open the wheel in click mode for files we already know (Explorer menu, main window, file picker). */
function openWheelForPaths(files, point) {
  files = files.filter((f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  });
  if (!files.length) return;
  overlay.show(point || screen.getCursorScreenPoint(), { clickMode: true, paths: files, menu: menuForPaths(files), info: fileInfo(files) });
}

async function pickFiles(win) {
  const r = await dialog.showOpenDialog(win || undefined, { properties: ['openFile', 'multiSelections'], title: 'Choose files to convert' });
  if (r.canceled || !r.filePaths.length) return;
  let point;
  if (win && !win.isDestroyed()) {
    const b = win.getBounds();
    point = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }
  openWheelForPaths(r.filePaths, point);
}

function runAction(actionId, files) {
  const anchor = overlay.center;
  overlay.hide();
  const [kind, name] = actionId.split(':');
  const tool = kind === 'tool' && engine.formats.TOOLS[engine.formats.categoryOf(files[0])]?.find((t) => t.id === name);
  if (tool && tool.editor) {
    editor.open(name, files[0]);
    return;
  }
  jobs.start({ actionId, files, anchor });
}

watcher.on('key', ({ dragging, point }) => {
  if (!store.settings.value('enabled')) return;
  if (overlay.state.visible && !overlay.state.clickMode) overlay.toggleMode();
  else if (dragging && !overlay.state.visible) overlay.show(point);
});
watcher.on('release', () => overlay.onRelease());
watcher.on('error', (err) => {
  console.error('[watcher]', err);
  broadcast('state:changed', appState());
});

/* ---------------- sample file for onboarding ---------------- */

async function ensureSample() {
  const dir = path.join(app.getPath('userData'), 'sample');
  const file = path.join(dir, 'Sunset Sample.png');
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(dir, { recursive: true });
  const sharp = require('sharp');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a3c"/><stop offset=".55" stop-color="#ff9f45"/><stop offset="1" stop-color="#ffd36b"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b3fa8"/><stop offset="1" stop-color="#2d1b4e"/></linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#s)"/><circle cx="800" cy="640" r="230" fill="#fff3c4" opacity=".92"/>
    <path d="M0 700 Q400 600 800 700 T1600 690 V1000 H0Z" fill="url(#w)"/>
    <path d="M0 800 Q420 730 820 800 T1600 790 V1000 H0Z" fill="#1d1233" opacity=".85"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

/* ---------------- IPC ---------------- */

const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => fn(e, ...args));

handle('app:getState', () => appState());
handle('settings:get', () => store.settings.get());
handle('settings:set', (_e, patch) => applySettings(patch));
handle('history:list', () => store.history.list());
handle('history:clear', () => {
  store.history.clear();
  broadcast('history:changed');
});
handle('menu:forDrag', (_e, exts) => engine.formats.menuFor(exts));
handle('menu:forPaths', (_e, files) => ({ menu: menuForPaths(files), info: fileInfo(files) }));
handle('formats:catalog', () => ({ categories: engine.formats.CATEGORIES, targets: engine.formats.CONVERT_TARGETS, tools: engine.formats.TOOLS, labels: engine.formats.LABELS }));

handle('overlay:drop', (_e, { files, actionId }) => {
  overlay.markDropped();
  if (!files?.length) return overlay.hide();
  if (!actionId) return overlay.enterClickMode(files, menuForPaths(files), fileInfo(files));
  runAction(actionId, files);
});
handle('overlay:pick', (_e, { files, actionId }) => runAction(actionId, files));
handle('overlay:close', () => overlay.hide());

handle('wheel:openForPaths', (e, files) => {
  openWheelForPaths(files, screen.getCursorScreenPoint());
});
handle('dialog:openFiles', (e) => pickFiles(BrowserWindow.fromWebContents(e.sender)));
handle('dialog:chooseFolder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

handle('job:cancel', (_e, id) => jobs.cancel(id));
handle('toast:resize', (_e, h) => toast.resize(h));
handle('toast:dismiss', () => jobs.dismissFinished());

handle('shell:reveal', (_e, p) => {
  if (p && fs.existsSync(p)) shell.showItemInFolder(p);
});
handle('shell:open', (_e, p) => {
  if (p && fs.existsSync(p)) return shell.openPath(p);
});
handle('shell:external', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

handle('editor:init', (e) => editor.init(e.sender));
handle('editor:save', (e, payload) => editor.save(e.sender, payload));
handle('editor:strip', (e) => editor.stripMetadata(e.sender));
handle('editor:writePdfMeta', (e, fields) => editor.writePdfMetadata(e.sender, fields));
handle('editor:close', (e) => editor.close(e.sender));
handle('editor:pickImage', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'heic', 'tif', 'tiff'] }],
  });
  if (r.canceled) return null;
  return new Uint8Array(await engine.image.toPng(r.filePaths[0], 3000));
});

handle('sample:path', () => ensureSample());
ipcMain.on('sample:startDrag', async (e) => {
  const file = await ensureSample();
  const icon = nativeImage.createFromPath(file).resize({ width: 64 });
  e.sender.startDrag({ file, icon });
});
handle('app:quit', () => quit());

jobs.events.on('history', () => broadcast('history:changed'));

/* ---------------- lifecycle ---------------- */

let openQueue = [];
let openTimer = null;
function queueOpen(files) {
  openQueue.push(...files);
  clearTimeout(openTimer);
  // Explorer launches one process per selected file; collect them into one wheel.
  openTimer = setTimeout(() => {
    const list = [...new Set(openQueue)];
    openQueue = [];
    openWheelForPaths(list);
  }, 350);
}

app.on('second-instance', (_e, argv) => {
  const files = explorer.pathsFromArgv(argv);
  if (files.length) queueOpen(files);
  else showMain();
});

function quit() {
  quitting = true;
  watcher.stop();
  app.quit();
}

app.on('before-quit', () => {
  quitting = true;
});
// Keep running in the tray when every window is closed.
app.on('window-all-closed', () => {});

const selfTestAt = process.argv.indexOf('--self-test');

app.whenReady().then(async () => {
  protocol.handle();
  store.init();
  if (selfTestAt !== -1) {
    const ok = await require('./selfTest')(process.argv[selfTestAt + 1] || path.join(app.getPath('temp'), 'shortnut-selftest.json'));
    app.exit(ok ? 0 : 1);
    return;
  }
  nativeTheme.themeSource = store.settings.value('theme');
  createMainWindow();
  createTray();
  overlay.create();
  toast.create();
  applySettings({});
  // Only the installed app registers itself in Explorer (dev builds would point at electron.exe).
  if (app.isPackaged && store.settings.value('explorerMenu')) explorer.apply(true);
  ensureSample().catch(() => {});
  const files = explorer.pathsFromArgv(process.argv);
  if (files.length) queueOpen(files);

  const shotsAt = process.argv.indexOf('--screenshots');
  if (shotsAt !== -1 && !app.isPackaged) {
    const dir = process.argv[shotsAt + 1] || path.join(app.getPath('temp'), 'shortnut-shots');
    const sample = await ensureSample();
    showMain();
    await require('./devShots')({ dir, sample, mainWin, navigate: (r) => mainWin.webContents.send('nav', r) });
    quit();
  }
});
