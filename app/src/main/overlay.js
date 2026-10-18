// The radial wheel: a transparent, always-on-top drop target that appears under the cursor.
const { BrowserWindow, screen } = require('electron');
const paths = require('./paths');

const SIZE = 500;

let win = null;
const state = { visible: false, clickMode: false, dropped: false, releaseTimer: null, point: null };

function create() {
  win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
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
  win.setVisibleOnAllWorkspaces(true);
  win.loadURL(paths.page('overlay'));
  win.on('blur', () => {
    if (state.clickMode) hide();
  });
  win.on('closed', () => (win = null));
  return win;
}

function boundsAround(point) {
  const area = screen.getDisplayNearestPoint(point).bounds;
  const x = Math.round(Math.min(Math.max(point.x - SIZE / 2, area.x), area.x + area.width - SIZE));
  const y = Math.round(Math.min(Math.max(point.y - SIZE / 2, area.y), area.y + area.height - SIZE));
  return { x, y, width: SIZE, height: SIZE };
}

/**
 * Show the wheel centred on `point`.
 * dragMode: waits for a file drag to enter. clickMode: files already known, user clicks a segment.
 */
function show(point, opts = {}) {
  if (!win) create();
  // On a cold start (e.g. launched from the Explorer menu) the page may still be loading.
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => show(point, opts));
    return;
  }
  const { clickMode = false, paths: files = null, menu = null, info = null } = opts;
  clearTimeout(state.releaseTimer);
  Object.assign(state, { visible: true, clickMode, dropped: false, point });
  const b = boundsAround(point);
  win.setBounds(b);
  win.webContents.send('overlay:open', {
    clickMode,
    files,
    menu,
    info,
    center: { x: point.x - b.x, y: point.y - b.y },
  });
  if (clickMode) {
    win.setFocusable(true);
    win.show();
    win.focus();
  } else {
    win.setFocusable(false);
    win.showInactive();
  }
}

function hide() {
  if (!win || !state.visible) return;
  clearTimeout(state.releaseTimer);
  state.visible = false;
  state.clickMode = false;
  win.webContents.send('overlay:hide');
  // Let the close animation play, then hide the native window.
  setTimeout(() => {
    if (!state.visible && win) {
      win.hide();
      win.setFocusable(false);
    }
  }, 140);
}

function toggleMode() {
  if (win && state.visible) win.webContents.send('overlay:toggle');
}

/** Mouse button released somewhere: if nothing was dropped on the wheel shortly after, close it. */
function onRelease() {
  if (!state.visible || state.clickMode) return;
  clearTimeout(state.releaseTimer);
  state.releaseTimer = setTimeout(() => {
    if (!state.dropped && !state.clickMode) hide();
  }, 400);
}

function markDropped() {
  state.dropped = true;
  clearTimeout(state.releaseTimer);
}

/** Switch the visible wheel into click mode with real file info. */
function enterClickMode(files, menu, info) {
  if (!win) return;
  state.clickMode = true;
  state.dropped = true;
  win.setFocusable(true);
  win.focus();
  win.webContents.send('overlay:open', { clickMode: true, files, menu, info, keepPosition: true });
}

module.exports = {
  create,
  show,
  hide,
  toggleMode,
  onRelease,
  markDropped,
  enterClickMode,
  get state() {
    return state;
  },
  get window() {
    return win;
  },
  get center() {
    if (!win || !state.point) return screen.getCursorScreenPoint();
    return state.point;
  },
};
