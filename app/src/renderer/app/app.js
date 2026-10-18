// Main window: home dashboard, activity, formats, settings, about.
import { icon, formatBytes, esc } from '../shared/icons.js';
import { createWheel } from '../shared/wheel.js';

const api = window.shortnut;
const view = document.getElementById('view');
const REPO_URL = 'https://github.com/Rachit315/Shortnut';

let settings = await api.invoke('settings:get');
let appState = await api.invoke('app:getState');
let route = 'home';

const KEY_LABEL = { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt' };

document.querySelectorAll('[data-icon]').forEach((el) => (el.outerHTML = icon(el.dataset.icon, 18)));

/* ---------- chrome ---------- */

function renderStatus() {
  const pill = document.getElementById('status-pill');
  const on = appState.enabled && appState.watching;
  pill.className = `status-pill ${on ? 'on' : ''}`;
  pill.innerHTML = `<i></i>${on ? `Active · drag + ${KEY_LABEL[settings.triggerKey]}` : appState.enabled ? 'Starting…' : 'Paused'}`;
  document.getElementById('side-key').textContent = KEY_LABEL[settings.triggerKey];
}

function navigate(to) {
  route = to;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.route === to));
  ({ home, activity, formats, settings: settingsPage, about })[to]?.();
  view.scrollTop = 0;
}

document.getElementById('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-route]');
  if (b) navigate(b.dataset.route);
});

/* ---------- helpers ---------- */

const basename = (p) => String(p).split(/[\\/]/).pop();

function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function historyItem(h) {
  const bad = h.status === 'error' || h.status === 'cancelled';
  const first = h.outputs?.[0];
  const detail = bad
    ? h.errors?.[0] || 'Cancelled'
    : first
      ? `${basename(first)}${h.outputs.length > 1 ? ` + ${h.outputs.length - 1} more` : ''}`
      : h.errors?.[0] || 'No changes needed';
  const saving = h.before && h.after && h.after < h.before ? ` · saved ${formatBytes(h.before - h.after)}` : '';
  return `<div class="item">
    <div class="badge ${bad ? 'bad' : ''}">${icon(bad ? 'x' : 'check', 16)}</div>
    <div style="min-width:0"><div class="t">${esc(h.title)}</div><div class="s" title="${esc((h.outputs || []).join('\n'))}">${esc(detail)}${saving} · ${timeAgo(h.time)}</div></div>
    <div class="acts">${first ? `<button class="icon-btn" title="Show in folder" data-reveal="${esc(first)}">${icon('folder', 16)}</button><button class="icon-btn" title="Open" data-open="${esc(first)}">${icon('external', 16)}</button>` : ''}</div>
  </div>`;
}

view.addEventListener('click', (e) => {
  const reveal = e.target.closest('[data-reveal]');
  if (reveal) api.invoke('shell:reveal', reveal.dataset.reveal);
  const open = e.target.closest('[data-open]');
  if (open) api.invoke('shell:open', open.dataset.open);
});

/* ---------- pages ---------- */

async function home() {
  const key = KEY_LABEL[settings.triggerKey];
  const hist = (await api.invoke('history:list')).slice(0, 5);
  view.innerHTML = `<div class="page">
    ${!appState.watching && appState.enabled && appState.platform === 'win32' ? `<div class="banner">${icon('info', 18)} The global shortcut couldn't start. Try restarting Shortnut.</div>` : ''}
    <section class="hero">
      <div>
        <h1>Drag any file. Tap ${key}.</h1>
        <p>Pick a format or tool from the wheel and drop — Shortnut saves the result right next to the original. Works in Explorer, on the desktop, and in any app you can drag files from.</p>
        <div class="row">
          <button class="btn" id="pick">${icon('upload', 16)} Choose files</button>
          <button class="btn glass" id="toggle">${icon(settings.enabled ? 'pause' : 'play', 16)} ${settings.enabled ? 'Pause shortcut' : 'Resume shortcut'}</button>
        </div>
      </div>
      <div class="hero-wheel"><div id="demo-wheel"></div></div>
    </section>

    <div class="grid2">
      <div class="card">
        <h3>Try it now</h3>
        <p class="muted">Start dragging this sample, press <span class="kbd">${key}</span> while it's moving, then release it on a format.</p>
        <div class="try">
          <div class="sample" draggable="true" id="sample" title="Drag me">
            <img alt="" src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a3c"/><stop offset=".55" stop-color="#ff9f45"/><stop offset="1" stop-color="#ffd36b"/></linearGradient></defs><rect width="160" height="100" fill="url(#s)"/><circle cx="80" cy="64" r="23" fill="#fff3c4"/><path d="M0 70Q40 60 80 70T160 69V100H0Z" fill="#5a2f7a"/></svg>')}" />
            Sunset Sample.png
          </div>
          <ol class="steps">
            <li><b>1</b><span>Drag the sample a little</span></li>
            <li><b>2</b><span>Tap <span class="kbd">${key}</span> and the wheel opens</span></li>
            <li><b>3</b><span>Release on <strong>JPG</strong>, or tap ${key} again for tools</span></li>
          </ol>
        </div>
      </div>
      <div class="card">
        <h3>Drop files here</h3>
        <p class="muted">No drag handy? Drop files on this window or pick them from disk.</p>
        <div class="dropzone" id="dropzone">${icon('upload', 26)}<div>Drop files anywhere in this window</div><button class="btn" id="pick2">Browse…</button></div>
      </div>
    </div>

    <h2>Recent activity</h2>
    <div class="card recent">${hist.length ? hist.map(historyItem).join('') : `<div class="empty">Nothing yet. Your conversions will show up here.</div>`}</div>
  </div>`;

  const demo = createWheel(document.getElementById('demo-wheel'));
  demo.render({ items: [{ label: 'PNG' }, { label: 'WEBP' }, { label: 'AVIF' }, { label: 'JPG' }, { label: 'GIF' }, { label: 'BMP' }, { label: 'PDF' }, { label: 'ICO' }], center: '1.2 MB', sub: 'Shift · tools' });
  let i = 0;
  const spin = setInterval(() => {
    if (!document.getElementById('demo-wheel')) return clearInterval(spin);
    demo.setActive(i++ % 8);
  }, 900);

  document.getElementById('pick').onclick = document.getElementById('pick2').onclick = () => api.invoke('dialog:openFiles');
  document.getElementById('toggle').onclick = () => api.invoke('settings:set', { enabled: !settings.enabled });
  document.getElementById('sample').addEventListener('dragstart', (e) => {
    e.preventDefault();
    api.startSampleDrag();
  });
  if (!settings.onboarded) api.invoke('settings:set', { onboarded: true });
}

async function activity() {
  const hist = await api.invoke('history:list');
  view.innerHTML = `<div class="page">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
      <div><h1>Activity</h1><p class="lead">Everything Shortnut created, newest first. Originals are never modified.</p></div>
      ${hist.length ? `<button class="btn" id="clear">${icon('trash', 15)} Clear</button>` : ''}
    </div>
    <div class="card recent">${hist.length ? hist.map(historyItem).join('') : `<div class="empty">No activity yet.</div>`}</div>
  </div>`;
  const clear = document.getElementById('clear');
  if (clear) clear.onclick = async () => {
    await api.invoke('history:clear');
    activity();
  };
}

async function formats() {
  const cat = await api.invoke('formats:catalog');
  const meta = {
    image: ['Images', 'image'],
    pdf: ['PDF', 'file'],
    doc: ['Word documents', 'file'],
    text: ['Text, Markdown & HTML', 'type'],
    data: ['Data', 'grid'],
    video: ['Video', 'play'],
    audio: ['Audio', 'wave'],
  };
  view.innerHTML = `<div class="page">
    <h1>Formats</h1>
    <p class="lead">What the wheel offers for each kind of file. Tap <span class="kbd">${KEY_LABEL[settings.triggerKey]}</span> a second time while dragging to switch between formats and tools.</p>
    <div class="formats">${Object.keys(meta)
      .map(
        (k) => `<div class="card fmt">
        <h3>${icon(meta[k][1], 18)} ${meta[k][0]}</h3>
        <div class="label">Opens</div>
        <div class="chips">${cat.categories[k].map((e) => `<span class="chip">.${e}</span>`).join('')}</div>
        <div class="label">Converts to</div>
        <div class="chips">${cat.targets[k].map((t) => `<span class="chip accent">${cat.labels[t] || t.toUpperCase()}</span>`).join('')}</div>
        ${cat.tools[k].length ? `<div class="label">Tools</div><div class="chips">${cat.tools[k].map((t) => `<span class="chip">${t.label}</span>`).join('')}</div>` : ''}
      </div>`
      )
      .join('')}</div>
  </div>`;
}

function toggleRow(key, title, desc) {
  return `<div class="setting"><div class="txt"><b>${title}</b><span>${desc}</span></div>
    <label class="switch"><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}><span></span></label></div>`;
}

function segRow(key, title, desc, options) {
  return `<div class="setting"><div class="txt"><b>${title}</b><span>${desc}</span></div>
    <div class="seg" data-seg="${key}">${options.map(([v, l]) => `<button data-v="${v}" class="${settings[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}

function rangeRow(key, title, desc, min, max, step = 1) {
  const fill = ((settings[key] - min) / (max - min)) * 100;
  return `<div class="setting"><div class="txt"><b>${title}</b><span>${desc}</span></div>
    <div class="ctl"><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-range="${key}" style="--fill:${fill}%"><span class="val">${settings[key]}</span></div></div>`;
}

function settingsPage() {
  view.innerHTML = `<div class="page">
    <h1>Settings</h1>
    <p class="lead">Changes apply instantly.</p>

    <div class="group"><div class="group-title">Shortcut</div>
      ${toggleRow('enabled', 'Drag + key shortcut', 'Open the wheel when you press the key while dragging files anywhere in Windows.')}
      ${segRow('triggerKey', 'Trigger key', 'The key you tap while dragging. Tap it again to switch between formats and tools.', [['shift', 'Shift'], ['ctrl', 'Ctrl'], ['alt', 'Alt']])}
      ${toggleRow('explorerMenu', 'Explorer right-click menu', 'Adds “Convert with Shortnut” to supported files (under “Show more options” on Windows 11).')}
      ${toggleRow('openAtLogin', 'Start with Windows', 'Runs quietly in the system tray so the shortcut is always ready.')}
    </div>

    <div class="group"><div class="group-title">Output</div>
      ${segRow('outputMode', 'Save converted files', 'Shortnut never overwrites anything — duplicates get “(2)”, “(3)”…', [['beside', 'Next to original'], ['folder', 'In a folder']])}
      ${settings.outputMode === 'folder' ? `<div class="setting"><div class="txt"><b>Output folder</b><span class="path" title="${esc(settings.outputFolder)}">${esc(settings.outputFolder || 'Not set — files are saved next to the original')}</span></div><button class="btn" id="choose-folder">${icon('folder', 15)} Choose…</button></div>` : ''}
      ${toggleRow('revealAfter', 'Show in Explorer when done', 'Opens the folder and selects the new file after each job.')}
    </div>

    <div class="group"><div class="group-title">Quality</div>
      ${rangeRow('jpgQuality', 'JPG quality', 'Higher is sharper and larger.', 40, 100)}
      ${rangeRow('webpQuality', 'WEBP quality', 'WEBP stays sharp at lower values than JPG.', 40, 100)}
      ${rangeRow('avifQuality', 'AVIF quality', 'AVIF is the most efficient image format.', 30, 100)}
      <div class="setting"><div class="txt"><b>PDF page resolution</b><span>Used when turning PDF pages into images.</span></div>
        <select data-select="pdfDpi">${[96, 150, 200, 300, 400].map((d) => `<option value="${d}" ${settings.pdfDpi === d ? 'selected' : ''}>${d} DPI</option>`).join('')}</select></div>
      ${segRow('compressLevel', 'Compression strength', 'Used by Compress for images, PDFs, video and audio.', [['light', 'Light'], ['balanced', 'Balanced'], ['strong', 'Strong']])}
      ${toggleRow('keepMetadata', 'Keep metadata', 'Copy EXIF (camera, location, date) into converted images. Off by default for privacy.')}
    </div>

    <div class="group"><div class="group-title">Appearance</div>
      ${segRow('theme', 'Theme', 'Follow Windows or pick one.', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}
    </div>
  </div>`;

  view.querySelectorAll('input[data-key]').forEach((el) => (el.onchange = () => api.invoke('settings:set', { [el.dataset.key]: el.checked })));
  view.querySelectorAll('[data-seg]').forEach((seg) =>
    seg.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      await api.invoke('settings:set', { [seg.dataset.seg]: b.dataset.v });
      settingsPage();
    })
  );
  view.querySelectorAll('[data-range]').forEach((el) => {
    el.oninput = () => {
      el.style.setProperty('--fill', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
      el.nextElementSibling.textContent = el.value;
    };
    el.onchange = () => api.invoke('settings:set', { [el.dataset.range]: Number(el.value) });
  });
  view.querySelectorAll('[data-select]').forEach((el) => (el.onchange = () => api.invoke('settings:set', { [el.dataset.select]: Number(el.value) })));
  const choose = document.getElementById('choose-folder');
  if (choose)
    choose.onclick = async () => {
      const dir = await api.invoke('dialog:chooseFolder');
      if (dir) {
        await api.invoke('settings:set', { outputFolder: dir });
        settingsPage();
      }
    };
}

function about() {
  view.innerHTML = `<div class="page">
    <div class="about-head"><img src="../shared/logo.svg" alt=""><div><h1>Shortnut</h1><p>Version ${esc(appState.version)} · Free and open source under the MIT License</p></div></div>
    <div class="facts">
      <div class="card fact">${icon('shield', 22)}<b>Private by design</b><span>Every conversion happens on your PC. No uploads, no accounts, no telemetry.</span></div>
      <div class="card fact">${icon('sparkles', 22)}<b>Everything included</b><span>All formats and tools work out of the box, with no limits on file size or count.</span></div>
      <div class="card fact">${icon('heart', 22)}<b>Built in the open</b><span>Read the code, report bugs, or contribute features on GitHub.</span></div>
    </div>
    <div class="links">
      <button class="btn" data-ext="${REPO_URL}">${icon('github', 15)} Source code</button>
      <button class="btn" data-ext="${REPO_URL}/issues">${icon('info', 15)} Report an issue</button>
      <button class="btn" data-ext="${REPO_URL}/blob/main/LICENSE">${icon('file', 15)} MIT License</button>
    </div>
    <h2>Built with</h2>
    <p class="lead">Electron, sharp/libvips, FFmpeg, pdf.js, pdf-lib, mammoth, docx, marked, exifr and libheif. FFmpeg is distributed under the GPL; see THIRD_PARTY_NOTICES.md in the install folder.</p>
  </div>`;
  view.querySelectorAll('[data-ext]').forEach((b) => (b.onclick = () => api.invoke('shell:external', b.dataset.ext)));
}

/* ---------- window-level drop ---------- */

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('dragging');
});
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const files = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (files.length) api.invoke('wheel:openForPaths', files);
});

/* ---------- live updates ---------- */

api.on('settings:changed', (s) => {
  settings = s;
  renderStatus();
  if (route === 'home') home();
});
api.on('state:changed', (s) => {
  appState = s;
  renderStatus();
});
api.on('history:changed', () => {
  if (route === 'home' || route === 'activity') navigate(route);
});
api.on('nav', (to) => navigate(to));

renderStatus();
navigate('home');
