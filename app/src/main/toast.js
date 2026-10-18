// Floating progress card shown near where the file was dropped ("Converting to JPG · 1 of 1 saved").
const { BrowserWindow, screen } = require('electron');
const paths = require('./paths');

const WIDTH = 380;
let win = null;
let height = 96;
let anchor = null;

function create() {
  win = new BrowserWindow({
    width: WIDTH,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload: paths.preload('app'), backgroundThrottling: false, spellcheck: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(paths.page('toast'));
  win.on('closed', () => (win = null));
  return win;
}

function place() {
  if (!win) return;
  const p = anchor || screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(p).workArea;
  const x = Math.round(Math.min(Math.max(p.x - WIDTH / 2, area.x + 8), area.x + area.width - WIDTH - 8));
  const y = Math.round(Math.min(Math.max(p.y - height / 2, area.y + 8), area.y + area.height - height - 8));
  win.setBounds({ x, y, width: WIDTH, height });
}

/** Push the current job list to the toast and make sure it is visible. */
function update(jobs, newAnchor) {
  if (!win) create();
  if (newAnchor) anchor = newAnchor;
  win.webContents.send('toast:update', jobs);
  if (!win.isVisible()) {
    place();
    win.showInactive();
  }
}

function resize(h) {
  height = Math.max(60, Math.min(420, Math.round(h)));
  place();
}

function hide() {
  if (win && win.isVisible()) win.hide();
  anchor = null;
}

module.exports = { create, update, resize, hide };
