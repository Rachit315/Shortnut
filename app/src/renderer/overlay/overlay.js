// Overlay wheel: receives the OS file drag, highlights the segment under the cursor and reports the drop.
import { createWheel, GEOMETRY } from '../shared/wheel.js';
import { formatBytes } from '../shared/icons.js';

const api = window.shortnut;
const stage = document.getElementById('stage');
const hint = document.getElementById('hint');
const wheel = createWheel(document.getElementById('wheel'));

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/tiff': 'tiff',
  'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heic', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html', 'text/csv': 'csv', 'application/vnd.ms-excel': 'csv', 'application/json': 'json',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/webm': 'webm', 'video/x-msvideo': 'avi', 'video/avi': 'avi',
  'video/x-ms-wmv': 'wmv', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/opus': 'opus', 'audio/x-ms-wma': 'wma',
};

const CATEGORY_LABEL = { image: 'Image', pdf: 'PDF', doc: 'Word', text: 'Text', data: 'Data', video: 'Video', audio: 'Audio' };

const state = {
  open: false,
  clickMode: false,
  menu: null,
  files: null,
  info: null,
  mode: 'convert',
  dragTypesKey: null,
  menuRequest: 0,
};

function place(center) {
  stage.style.left = `${center.x}px`;
  stage.style.top = `${center.y}px`;
}

function currentItems() {
  if (!state.menu) return [];
  return state.mode === 'tools' ? state.menu.tools : state.menu.convert;
}

function centerText() {
  if (state.info) {
    return {
      center: state.info.count > 1 ? `${state.info.count} files` : formatBytes(state.info.size),
      sub: state.menu?.tools.length ? (state.mode === 'tools' ? 'Shift · formats' : 'Shift · tools') : '',
    };
  }
  if (!state.menu) return { center: 'Shortnut', sub: '' };
  if (state.menu.category === 'unknown' || state.menu.category === 'mixed') return { center: 'Drop here', sub: 'to see options' };
  return {
    center: state.dragCount > 1 ? `${state.dragCount} files` : CATEGORY_LABEL[state.menu.category] || 'File',
    sub: state.menu.tools.length ? (state.mode === 'tools' ? 'Shift · formats' : 'Shift · tools') : '',
  };
}

function render({ swap = false } = {}) {
  const items = currentItems();
  const { center, sub } = centerText();
  wheel.render({ items, mode: state.mode, center, sub, skeleton: !state.menu });
  const el = document.getElementById('wheel');
  if (swap) {
    el.classList.remove('swap');
    void el.offsetWidth;
    el.classList.add('swap');
  }
  if (state.clickMode) hint.textContent = items.length ? 'Click to choose · Esc to close' : 'No conversions for this file type';
  else hint.textContent = 'Release on a format';
  document.body.classList.toggle('show-hint', !!state.menu && !state.clickMode && !items.length);
}

function open(payload) {
  state.open = true;
  state.clickMode = payload.clickMode;
  if (!payload.keepPosition) {
    state.mode = 'convert';
    state.dragTypesKey = null;
    place(payload.center);
  }
  state.menu = payload.menu || null;
  state.files = payload.files || null;
  state.info = payload.info || null;
  if (state.menu && !state.menu.convert.length && state.menu.tools.length) state.mode = 'tools';
  document.body.classList.remove('closing');
  document.body.classList.toggle('click-mode', state.clickMode);
  render();
  requestAnimationFrame(() => document.body.classList.add('open'));
}

function close() {
  state.open = false;
  document.body.classList.remove('open', 'click-mode', 'show-hint');
  document.body.classList.add('closing');
  wheel.setActive(null);
}

function toggleMode() {
  if (!state.menu) return;
  const other = state.mode === 'convert' ? 'tools' : 'convert';
  const otherItems = other === 'tools' ? state.menu.tools : state.menu.convert;
  if (!otherItems.length) return;
  state.mode = other;
  render({ swap: true });
}

function localPoint(e) {
  const r = stage.getBoundingClientRect();
  // stage is scaled during the intro animation; normalise to wheel coordinates
  return { x: ((e.clientX - r.left) / r.width) * GEOMETRY.size, y: ((e.clientY - r.top) / r.height) * GEOMETRY.size };
}

/* ---------- drag & drop (drag mode) ---------- */

async function loadMenuForDrag(dt) {
  const items = [...(dt.items || [])].filter((i) => i.kind === 'file');
  state.dragCount = items.length || 1;
  const exts = items.map((i) => MIME_EXT[i.type] || (i.type ? i.type.split('/').pop() : ''));
  const key = exts.join('|');
  if (key === state.dragTypesKey) return;
  state.dragTypesKey = key;
  const req = ++state.menuRequest;
  const menu = await api.invoke('menu:forDrag', exts.length ? exts : ['']);
  if (req !== state.menuRequest || !state.open || state.clickMode) return;
  state.menu = menu;
  if (!menu.convert.length && menu.tools.length) state.mode = 'tools';
  render();
}

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!state.clickMode) loadMenuForDrag(e.dataTransfer);
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // never "move": the source file must stay put
  if (!state.open) return;
  const { x, y } = localPoint(e);
  wheel.setActive(wheel.hitTest(x, y));
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) wheel.setActive(null);
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  const { x, y } = localPoint(e);
  const hit = wheel.hitTest(x, y);
  const item = typeof hit === 'number' ? currentItems()[hit] : null;
  if (!files.length) {
    api.invoke('overlay:close');
    return;
  }
  api.invoke('overlay:drop', { files, actionId: item ? item.id : null });
});

/* ---------- click mode ---------- */

document.addEventListener('mousemove', (e) => {
  if (!state.clickMode) return;
  const { x, y } = localPoint(e);
  wheel.setActive(wheel.hitTest(x, y));
});

document.addEventListener('mouseleave', () => {
  if (state.clickMode) wheel.setActive(null);
});

document.addEventListener('click', (e) => {
  if (!state.clickMode) return;
  const { x, y } = localPoint(e);
  const hit = wheel.hitTest(x, y);
  if (hit === 'center') return toggleMode();
  if (hit === null) return api.invoke('overlay:close');
  const item = currentItems()[hit];
  if (item) api.invoke('overlay:pick', { files: state.files, actionId: item.id });
});

document.addEventListener('keydown', (e) => {
  if (!state.clickMode) return;
  const items = currentItems();
  if (e.key === 'Escape') api.invoke('overlay:close');
  else if (e.key === 'Shift' || e.key === 'Tab') {
    e.preventDefault();
    if (!e.repeat) toggleMode();
  } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key) && items.length) {
    e.preventDefault();
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const cur = typeof wheel.active === 'number' ? wheel.active : step > 0 ? -1 : 0;
    wheel.setActive((cur + step + items.length) % items.length);
  } else if (e.key === 'Enter' && typeof wheel.active === 'number') {
    api.invoke('overlay:pick', { files: state.files, actionId: items[wheel.active].id });
  }
});

api.on('overlay:open', open);
api.on('overlay:hide', close);
api.on('overlay:toggle', toggleMode);
