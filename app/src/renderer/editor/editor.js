// Tool editors. One page, one tool per window (?tool=crop|addbg|edit|annotate|redact|metadata).
import { icon, formatBytes, esc } from '../shared/icons.js';

const api = window.shortnut;
const tool = new URLSearchParams(location.search).get('tool');
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const controls = $('controls');
const applyBtn = $('apply');
const resetBtn = $('reset');
const footInfo = $('foot-info');

const TITLES = { crop: 'Crop Image', addbg: 'Add Background', edit: 'Edit Image', annotate: 'Annotate', redact: 'Redact', metadata: 'Metadata' };

$('close').innerHTML = icon('x', 13);
$('close').onclick = () => api.invoke('editor:close');
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.text-input')) api.invoke('editor:close');
});

const data = await api.invoke('editor:init').catch((err) => {
  stage.innerHTML = `<div class="warn">${esc(err.message)}</div>`;
  throw err;
});
$('title').textContent = TITLES[tool] || 'Edit';
document.title = `${TITLES[tool]} – ${data.name}`;

const bitmap = data.png ? await createImageBitmap(new Blob([data.png], { type: 'image/png' })) : null;
const W = bitmap?.width || 0;
const H = bitmap?.height || 0;
const DPR = window.devicePixelRatio || 1;

/* ---------- shared helpers ---------- */

function fit(w, h, pad = 0) {
  const aw = Math.max(50, stage.clientWidth - 44 - pad);
  const ah = Math.max(50, stage.clientHeight - 36 - pad);
  const s = Math.min(1, aw / w, ah / h);
  return { s, w: Math.round(w * s), h: Math.round(h * s) };
}

function onResize(fn) {
  let raf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  }).observe(stage);
}

function rangeRow(label, { min, max, value, step = 1, unit = 'px', onInput }) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><span class="num"></span>`;
  const input = row.querySelector('input');
  const num = row.querySelector('.num');
  const sync = () => {
    input.style.setProperty('--fill', `${((input.value - min) / (max - min || 1)) * 100}%`);
    num.textContent = `${input.value}${unit ? ` ${unit}` : ''}`;
  };
  input.addEventListener('input', () => {
    sync();
    onInput(Number(input.value));
  });
  sync();
  row.set = (v) => {
    input.value = v;
    sync();
  };
  return row;
}

function segRow(label, options, value, onPick) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span class="lbl">${label}</span><div class="seg">${options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div><span></span>`;
  const seg = row.querySelector('.seg');
  const mark = (v) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mark(b.dataset.v);
    onPick(b.dataset.v);
  });
  mark(value);
  row.set = mark;
  return row;
}

async function saveCanvas(canvas, format) {
  applyBtn.disabled = true;
  const label = applyBtn.textContent;
  applyBtn.textContent = 'Saving…';
  try {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    await api.invoke('editor:save', { png: new Uint8Array(await blob.arrayBuffer()), format });
  } catch (err) {
    footInfo.textContent = `Couldn't save: ${err.message}`;
    applyBtn.disabled = false;
    applyBtn.textContent = label;
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* ---------- Crop ---------- */

function cropTool() {
  const url = URL.createObjectURL(new Blob([data.png], { type: 'image/png' }));
  stage.innerHTML = `<div class="crop-wrap"><img alt="" draggable="false" src="${url}">
    <div class="crop-shade"></div><div class="crop-shade"></div><div class="crop-shade"></div><div class="crop-shade"></div>
    <div class="crop-box">${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => `<div class="h h-${h}" data-h="${h}"></div>`).join('')}</div></div>`;
  const wrap = stage.querySelector('.crop-wrap');
  const img = wrap.querySelector('img');
  const box = wrap.querySelector('.crop-box');
  const shades = wrap.querySelectorAll('.crop-shade');
  const MIN = Math.max(8, Math.round(Math.min(W, H) * 0.02));
  let rect = { x: 0, y: 0, w: W, h: H };
  let ratio = null;
  let s = 1;

  const ratioRow = segRow('Aspect ratio', [['free', 'Free'], ['1:1', '1:1'], ['16:9', '16:9'], ['9:16', '9:16'], ['4:3', '4:3'], ['3:4', '3:4']], 'free', (v) => {
    ratio = v === 'free' ? null : (([a, b]) => a / b)(v.split(':').map(Number));
    if (ratio) {
      let w = W;
      let h = w / ratio;
      if (h > H) {
        h = H;
        w = h * ratio;
      }
      rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }
    draw();
  });
  const dims = document.createElement('div');
  dims.className = 'row';
  dims.innerHTML = `<span class="lbl">Size</span><div class="dims">W <input id="cw" type="number" min="1"> H <input id="ch" type="number" min="1"> <span class="unit">px</span></div><span></span>`;
  controls.append(ratioRow, dims);
  const cw = dims.querySelector('#cw');
  const ch = dims.querySelector('#ch');
  const applyDims = (changed) => {
    let w = Math.min(W, Math.max(MIN, Number(cw.value) || MIN));
    let h = Math.min(H, Math.max(MIN, Number(ch.value) || MIN));
    if (ratio) {
      if (changed === 'w') h = Math.min(H, w / ratio);
      else w = Math.min(W, h * ratio);
    }
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    rect = { w, h, x: Math.min(Math.max(0, cx - w / 2), W - w), y: Math.min(Math.max(0, cy - h / 2), H - h) };
    draw();
  };
  cw.addEventListener('change', () => applyDims('w'));
  ch.addEventListener('change', () => applyDims('h'));

  function layout() {
    ({ s } = fit(W, H));
    img.style.width = `${W * s}px`;
    img.style.height = `${H * s}px`;
    draw();
  }

  function draw() {
    const r = { x: rect.x * s, y: rect.y * s, w: rect.w * s, h: rect.h * s };
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    const [t, b, l, rt] = shades;
    const fw = W * s;
    const fh = H * s;
    Object.assign(t.style, { left: 0, top: 0, width: `${fw}px`, height: `${r.y}px` });
    Object.assign(b.style, { left: 0, top: `${r.y + r.h}px`, width: `${fw}px`, height: `${fh - r.y - r.h}px` });
    Object.assign(l.style, { left: 0, top: `${r.y}px`, width: `${r.x}px`, height: `${r.h}px` });
    Object.assign(rt.style, { left: `${r.x + r.w}px`, top: `${r.y}px`, width: `${fw - r.x - r.w}px`, height: `${r.h}px` });
    if (document.activeElement !== cw) cw.value = Math.round(rect.w);
    if (document.activeElement !== ch) ch.value = Math.round(rect.h);
    footInfo.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)} px`;
  }

  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    drag = { handle: e.target.dataset.h || 'move', sx: e.clientX, sy: e.clientY, r0: { ...rect } };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / s;
    const dy = (e.clientY - drag.sy) / s;
    const { x, y, w, h } = drag.r0;
    const hd = drag.handle;
    if (hd === 'move') {
      rect = { w, h, x: Math.min(Math.max(0, x + dx), W - w), y: Math.min(Math.max(0, y + dy), H - h) };
      return draw();
    }
    let left = x;
    let top = y;
    let right = x + w;
    let bottom = y + h;
    if (hd.includes('w')) left = Math.min(Math.max(0, x + dx), right - MIN);
    if (hd.includes('e')) right = Math.max(Math.min(W, x + w + dx), left + MIN);
    if (hd.includes('n')) top = Math.min(Math.max(0, y + dy), bottom - MIN);
    if (hd.includes('s')) bottom = Math.max(Math.min(H, y + h + dy), top + MIN);
    let nw = right - left;
    let nh = bottom - top;
    if (ratio) {
      if (hd === 'n' || hd === 's') nw = nh * ratio;
      else nh = nw / ratio;
      // Keep inside the image
      const maxW = hd.includes('w') ? right : W - left;
      const maxH = hd.includes('n') ? bottom : hd === 'e' || hd === 'w' ? H - top : H - top;
      if (nw > maxW) {
        nw = maxW;
        nh = nw / ratio;
      }
      if (nh > maxH) {
        nh = maxH;
        nw = nh * ratio;
      }
      if (hd.includes('w')) left = right - nw;
      if (hd.includes('n')) top = bottom - nh;
      if ((hd === 'e' || hd === 'w') && top + nh > H) top = H - nh;
      if ((hd === 'n' || hd === 's') && left + nw > W) left = W - nw;
    }
    rect = { x: left, y: top, w: nw, h: nh };
    draw();
  });
  const end = () => (drag = null);
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  resetBtn.onclick = () => {
    ratio = null;
    ratioRow.set('free');
    rect = { x: 0, y: 0, w: W, h: H };
    draw();
  };
  applyBtn.textContent = 'Apply';
  applyBtn.onclick = () => {
    const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    const c = makeCanvas(r.w, r.h);
    c.getContext('2d').drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    saveCanvas(c);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') applyBtn.click();
  });
  img.onload = layout;
  onResize(layout);
}

/* ---------- Add background ---------- */

const GRADIENTS = [
  ['#ff4e50', '#fc913a', '#f9d423'],
  ['#fdfbfb', '#ebedee'],
  ['#ff9a9e', '#fad0c4', '#fbc2eb'],
  ['#fbc2eb', '#e0c3fc'],
  ['#a18cd1', '#fbc2eb'],
  ['#f83600', '#7b4397', '#0ba360'],
  ['#4facfe', '#00f2fe'],
  ['#43cea2', '#185a9d'],
  ['#e0eafc', '#cfdef3'],
];
const SOLIDS = ['#ffffff', '#f2c94c', '#9be15d', '#27ae60', '#16a085', '#4cc9f0', '#3a56d4', '#1f2a44', '#7c3aed', '#111111'];

function addBgTool() {
  const big = Math.max(W, H);
  const small = Math.min(W, H);
  const st = {
    bg: { type: 'gradient', stops: GRADIENTS[0] },
    padding: Math.round(big * 0.08),
    corners: Math.round(small * 0.03),
    shadow: Math.round(big * 0.02),
    ratio: 'auto',
  };
  const initial = JSON.parse(JSON.stringify(st));
  const preview = makeCanvas(10, 10);
  stage.innerHTML = '';
  stage.appendChild(preview);

  function compose(canvas, scale) {
    const p = st.padding;
    let cw = W + 2 * p;
    let ch = H + 2 * p;
    if (st.ratio !== 'auto') {
      const [a, b] = st.ratio.split(':').map(Number);
      const r = a / b;
      if (cw / ch < r) cw = ch * r;
      else ch = cw / r;
    }
    canvas.width = Math.max(1, Math.round(cw * scale));
    canvas.height = Math.max(1, Math.round(ch * scale));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const bg = st.bg;
    if (bg.type === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    } else if (bg.type === 'solid') {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, cw, ch);
    } else if (bg.type === 'image' && bg.bitmap) {
      const k = Math.max(cw / bg.bitmap.width, ch / bg.bitmap.height);
      const iw = bg.bitmap.width * k;
      const ih = bg.bitmap.height * k;
      ctx.drawImage(bg.bitmap, (cw - iw) / 2, (ch - ih) / 2, iw, ih);
    }
    const x = (cw - W) / 2;
    const y = (ch - H) / 2;
    const radius = Math.min(st.corners, small / 2);
    if (st.shadow > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = st.shadow * scale; // shadow sizes ignore the transform
      ctx.shadowOffsetY = st.shadow * 0.35 * scale;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(x, y, W, H, radius);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, W, H, radius);
    ctx.clip();
    ctx.drawImage(bitmap, x, y, W, H);
    ctx.restore();
    return { cw, ch };
  }

  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const p = st.padding * 2;
      const { s } = fit(W + p, H + p);
      const { cw, ch } = compose(preview, s * DPR);
      const disp = fit(cw, ch);
      preview.style.width = `${disp.w}px`;
      preview.style.height = `${disp.h}px`;
      preview.classList.toggle('checker', st.bg.type === 'none');
      footInfo.textContent = `${Math.round(cw)} × ${Math.round(ch)} px`;
    });
  }

  const bgRow = document.createElement('div');
  bgRow.className = 'row';
  bgRow.style.alignItems = 'start';
  bgRow.innerHTML = `<span class="lbl" style="padding-top:6px">Background</span><div style="display:grid;gap:8px">
    <div class="swatches">${GRADIENTS.map((g, i) => `<button class="sw" data-g="${i}" title="Gradient" style="background:linear-gradient(135deg,${g.join(',')})"></button>`).join('')}
      <button class="sw custom" data-custom title="Use your own image">${icon('image', 15)}</button></div>
    <div class="swatches">${SOLIDS.map((c) => `<button class="sw" data-c="${c}" style="background:${c}"></button>`).join('')}<button class="sw checker" data-none title="Transparent"></button></div>
  </div><span></span>`;
  bgRow.addEventListener('click', async (e) => {
    const b = e.target.closest('.sw');
    if (!b) return;
    if ('g' in b.dataset) st.bg = { type: 'gradient', stops: GRADIENTS[+b.dataset.g] };
    else if ('c' in b.dataset) st.bg = { type: 'solid', color: b.dataset.c };
    else if ('none' in b.dataset) st.bg = { type: 'none' };
    else if ('custom' in b.dataset) {
      const png = await api.invoke('editor:pickImage');
      if (!png) return;
      st.bg = { type: 'image', bitmap: await createImageBitmap(new Blob([png], { type: 'image/png' })) };
    }
    bgRow.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s === b));
    render();
  });
  bgRow.querySelector('.sw').classList.add('on');

  const padRow = rangeRow('Padding', { min: 0, max: Math.round(big * 0.5), value: st.padding, onInput: (v) => ((st.padding = v), render()) });
  const cornerRow = rangeRow('Corners', { min: 0, max: Math.round(small * 0.25), value: st.corners, onInput: (v) => ((st.corners = v), render()) });
  const shadowRow = rangeRow('Shadow', { min: 0, max: Math.round(big * 0.1), value: st.shadow, onInput: (v) => ((st.shadow = v), render()) });
  const ratioRow = segRow('Ratio', [['auto', 'Auto'], ['1:1', '1:1'], ['16:9', '16:9'], ['4:5', '4:5'], ['9:16', '9:16']], 'auto', (v) => ((st.ratio = v), render()));
  controls.append(bgRow, padRow, cornerRow, shadowRow, ratioRow);

  resetBtn.onclick = () => {
    Object.assign(st, JSON.parse(JSON.stringify(initial)));
    padRow.set(st.padding);
    cornerRow.set(st.corners);
    shadowRow.set(st.shadow);
    ratioRow.set('auto');
    bgRow.querySelectorAll('.sw').forEach((s, i) => s.classList.toggle('on', i === 0));
    render();
  };
  applyBtn.textContent = 'Save with Background';
  applyBtn.onclick = () => {
    const out = makeCanvas(1, 1);
    compose(out, 1);
    saveCanvas(out, 'png');
  };
  onResize(render);
}

/* ---------- Edit (adjust + transform + resize) ---------- */

function editTool() {
  const DEF = { brightness: 100, contrast: 100, saturation: 100, hue: 0, warmth: 0, grayscale: 0, blur: 0, rotate: 0, flipH: false, flipV: false };
  const st = { ...DEF, outW: W, outH: H, lock: true };
  const preview = makeCanvas(10, 10);
  stage.innerHTML = '';
  stage.appendChild(preview);
  preview.style.boxShadow = '0 10px 30px rgba(60,20,5,.25)';

  const filter = (scale) =>
    `brightness(${st.brightness}%) contrast(${st.contrast}%) saturate(${st.saturation}%) hue-rotate(${st.hue}deg) sepia(${st.warmth}%) grayscale(${st.grayscale}%)` +
    (st.blur ? ` blur(${(st.blur * Math.max(W, H)) / 1000 * scale}px)` : '');

  function draw(canvas, tw, th, scale) {
    canvas.width = Math.max(1, Math.round(tw));
    canvas.height = Math.max(1, Math.round(th));
    const ctx = canvas.getContext('2d');
    ctx.filter = filter(scale);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((st.rotate * Math.PI) / 2);
    ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
    const odd = st.rotate % 2 === 1;
    const dw = odd ? canvas.height : canvas.width;
    const dh = odd ? canvas.width : canvas.height;
    ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  }

  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const odd = st.rotate % 2 === 1;
      const rw = odd ? H : W;
      const rh = odd ? W : H;
      const { s, w, h } = fit(rw, rh);
      draw(preview, w * DPR, h * DPR, s * DPR);
      preview.style.width = `${w}px`;
      preview.style.height = `${h}px`;
      footInfo.textContent = `${st.outW} × ${st.outH} px`;
    });
  }

  const presets = document.createElement('div');
  presets.className = 'presets';
  const PRESETS = {
    Original: {},
    Vivid: { contrast: 112, saturation: 145, brightness: 103 },
    Warm: { warmth: 22, saturation: 112, brightness: 103 },
    Cool: { hue: 8, saturation: 92, brightness: 104, contrast: 104 },
    Fade: { contrast: 84, brightness: 110, saturation: 78 },
    Mono: { grayscale: 100, contrast: 108 },
    Noir: { grayscale: 100, contrast: 145, brightness: 92 },
  };
  presets.innerHTML = Object.keys(PRESETS).map((p) => `<button class="tool" data-p="${p}">${p}</button>`).join('');
  const presetRow = document.createElement('div');
  presetRow.className = 'row';
  presetRow.innerHTML = '<span class="lbl">Look</span>';
  presetRow.append(presets, document.createElement('span'));

  const sliders = {};
  const add = (key, label, min, max, unit = '%') => {
    sliders[key] = rangeRow(label, { min, max, value: st[key], unit, onInput: (v) => ((st[key] = v), render()) });
    return sliders[key];
  };

  const transform = document.createElement('div');
  transform.className = 'row';
  transform.innerHTML = `<span class="lbl">Transform</span><div class="tools">
    <button class="tool icon-only" data-t="rotL" title="Rotate left">${icon('rotateL', 16)}</button>
    <button class="tool icon-only" data-t="rotR" title="Rotate right">${icon('rotate', 16)}</button>
    <button class="tool icon-only" data-t="flipH" title="Flip horizontal">${icon('flipH', 16)}</button>
    <button class="tool icon-only" data-t="flipV" title="Flip vertical">${icon('flipV', 16)}</button>
    <span class="sep"></span>
    <div class="dims">W <input id="ow" type="number" min="1"> <button class="lock on" id="lock" title="Keep proportions">${icon('merge', 15)}</button> H <input id="oh" type="number" min="1"> <span class="unit">px</span></div>
  </div><span></span>`;
  const ow = transform.querySelector('#ow');
  const oh = transform.querySelector('#oh');
  const lock = transform.querySelector('#lock');
  const syncDims = () => {
    ow.value = st.outW;
    oh.value = st.outH;
  };
  transform.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    if (t === 'rotL' || t === 'rotR') {
      st.rotate = (st.rotate + (t === 'rotR' ? 1 : 3)) % 4;
      [st.outW, st.outH] = [st.outH, st.outW];
      syncDims();
    } else st[t] = !st[t];
    render();
  });
  lock.onclick = () => {
    st.lock = !st.lock;
    lock.classList.toggle('on', st.lock);
  };
  const aspect = () => (st.rotate % 2 ? H / W : W / H);
  ow.onchange = () => {
    st.outW = Math.max(1, Math.min(20000, Math.round(+ow.value || 1)));
    if (st.lock) st.outH = Math.max(1, Math.round(st.outW / aspect()));
    syncDims();
    render();
  };
  oh.onchange = () => {
    st.outH = Math.max(1, Math.min(20000, Math.round(+oh.value || 1)));
    if (st.lock) st.outW = Math.max(1, Math.round(st.outH * aspect()));
    syncDims();
    render();
  };
  syncDims();

  controls.append(
    presetRow,
    add('brightness', 'Brightness', 0, 200),
    add('contrast', 'Contrast', 0, 200),
    add('saturation', 'Saturation', 0, 250),
    add('warmth', 'Warmth', 0, 100),
    add('hue', 'Hue', -180, 180, '°'),
    add('blur', 'Blur', 0, 20, ''),
    transform
  );

  const applyLook = (vals) => {
    for (const k of ['brightness', 'contrast', 'saturation', 'hue', 'warmth', 'grayscale', 'blur']) {
      st[k] = vals[k] ?? DEF[k];
      sliders[k]?.set(st[k]);
    }
    render();
  };
  presets.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    presets.querySelectorAll('.tool').forEach((x) => x.classList.toggle('on', x === b));
    applyLook(PRESETS[b.dataset.p]);
  });

  resetBtn.onclick = () => {
    Object.assign(st, DEF, { outW: W, outH: H });
    syncDims();
    presets.querySelectorAll('.tool').forEach((x) => x.classList.remove('on'));
    applyLook({});
  };
  applyBtn.textContent = 'Save';
  applyBtn.onclick = () => {
    const c = makeCanvas(1, 1);
    draw(c, st.outW, st.outH, st.outW / (st.rotate % 2 ? H : W));
    saveCanvas(c);
  };
  onResize(render);
}

/* ---------- Drawing surface shared by Annotate and Redact ---------- */

function drawingSurface(paint) {
  const canvas = makeCanvas(10, 10);
  canvas.className = 'draw-canvas';
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.lineHeight = '0';
  wrap.appendChild(canvas);
  stage.innerHTML = '';
  stage.appendChild(wrap);
  let s = 1;
  const surf = {
    canvas,
    wrap,
    get scale() {
      return s;
    },
    toImage(e) {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    },
    render() {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(s * DPR, 0, 0, s * DPR, 0, 0);
      ctx.drawImage(bitmap, 0, 0, W, H);
      paint(ctx, s * DPR);
    },
    layout() {
      const f = fit(W, H);
      s = f.s;
      canvas.width = Math.round(f.w * DPR);
      canvas.height = Math.round(f.h * DPR);
      canvas.style.width = `${f.w}px`;
      canvas.style.height = `${f.h}px`;
      surf.render();
    },
    /** Full-resolution render for saving. */
    export() {
      const c = makeCanvas(W, H);
      const ctx = c.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      paint(ctx, 1);
      return c;
    },
  };
  onResize(() => surf.layout());
  return surf;
}

/* ---------- Annotate ---------- */

const COLORS = ['#e8461e', '#f2c94c', '#27ae60', '#2f80ed', '#9b51e0', '#111111', '#ffffff'];

function drawArrow(ctx, a, b, width) {
  const head = Math.max(width * 4, 14);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function paintShape(ctx, sh) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = sh.color;
  ctx.lineWidth = sh.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (sh.type) {
    case 'pen':
    case 'highlighter':
      if (sh.type === 'highlighter') {
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = sh.width * 3.5;
        ctx.lineCap = 'butt';
      }
      ctx.beginPath();
      sh.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (sh.points.length === 1) ctx.lineTo(sh.points[0].x + 0.1, sh.points[0].y);
      ctx.stroke();
      break;
    case 'arrow':
      drawArrow(ctx, sh.a, sh.b, sh.width);
      break;
    case 'rect':
      ctx.strokeRect(Math.min(sh.a.x, sh.b.x), Math.min(sh.a.y, sh.b.y), Math.abs(sh.b.x - sh.a.x), Math.abs(sh.b.y - sh.a.y));
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse((sh.a.x + sh.b.x) / 2, (sh.a.y + sh.b.y) / 2, Math.abs(sh.b.x - sh.a.x) / 2, Math.abs(sh.b.y - sh.a.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'text':
      ctx.font = `700 ${sh.size}px "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(2, sh.size / 8);
      ctx.strokeStyle = sh.color === '#ffffff' ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.9)';
      sh.text.split('\n').forEach((line, i) => {
        ctx.strokeText(line, sh.x, sh.y + i * sh.size * 1.2);
        ctx.fillText(line, sh.x, sh.y + i * sh.size * 1.2);
      });
      break;
  }
  ctx.restore();
}

function annotateTool() {
  const shapes = [];
  const redo = [];
  let current = null;
  const st = { tool: 'arrow', color: COLORS[0], width: Math.max(3, Math.round(Math.max(W, H) / 300)) };
  const surf = drawingSurface((ctx) => {
    shapes.forEach((sh) => paintShape(ctx, sh));
    if (current) paintShape(ctx, current);
  });

  const TOOLS = [['pen', 'scribble', 'Pen'], ['highlighter', 'highlighter', 'Highlight'], ['arrow', 'arrow', 'Arrow'], ['rect', 'square', 'Box'], ['ellipse', 'circle', 'Circle'], ['text', 'type', 'Text']];
  const bar = document.createElement('div');
  bar.className = 'tools';
  bar.innerHTML = `${TOOLS.map(([id, ic, l]) => `<button class="tool" data-tool="${id}">${icon(ic, 15)} ${l}</button>`).join('')}
    <span class="sep"></span>${COLORS.map((c) => `<button class="color" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
    <span class="sep"></span><button class="tool icon-only" data-act="undo" title="Undo (Ctrl+Z)">${icon('undo', 15)}</button>
    <button class="tool icon-only" data-act="redo" title="Redo (Ctrl+Y)">${icon('redo', 15)}</button>`;
  const mark = () => {
    bar.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === st.tool));
    bar.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === st.color));
  };
  const undo = () => {
    if (shapes.length) redo.push(shapes.pop());
    surf.render();
  };
  const redoFn = () => {
    if (redo.length) shapes.push(redo.pop());
    surf.render();
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) st.tool = b.dataset.tool;
    if (b.dataset.color) st.color = b.dataset.color;
    if (b.dataset.act === 'undo') undo();
    if (b.dataset.act === 'redo') redoFn();
    mark();
  });
  mark();
  const sizeRow = rangeRow('Size', { min: 1, max: Math.max(12, Math.round(Math.max(W, H) / 40)), value: st.width, onInput: (v) => (st.width = v) });
  controls.append(bar, sizeRow);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.text-input')) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'z') undo();
    if (e.ctrlKey && e.key.toLowerCase() === 'y') redoFn();
  });

  function placeText(p, client) {
    const input = document.createElement('textarea');
    input.className = 'text-input';
    const r = surf.canvas.getBoundingClientRect();
    const wr = surf.wrap.getBoundingClientRect();
    const size = Math.max(14, st.width * 6);
    Object.assign(input.style, {
      left: `${client.x - wr.left}px`,
      top: `${client.y - wr.top}px`,
      color: st.color,
      fontSize: `${size * (r.width / W)}px`,
      lineHeight: '1.2',
    });
    input.rows = 1;
    surf.wrap.appendChild(input);
    setTimeout(() => input.focus());
    const commit = () => {
      const text = input.value.trim();
      input.remove();
      if (text) {
        shapes.push({ type: 'text', x: p.x, y: p.y, text, color: st.color, size });
        redo.length = 0;
      }
      surf.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        input.value = '';
        commit();
      }
    });
    input.addEventListener('blur', commit, { once: true });
  }

  const c = surf.canvas;
  c.addEventListener('pointerdown', (e) => {
    const p = surf.toImage(e);
    if (st.tool === 'text') {
      e.preventDefault();
      placeText(p, { x: e.clientX, y: e.clientY });
      return;
    }
    c.setPointerCapture(e.pointerId);
    current = st.tool === 'pen' || st.tool === 'highlighter'
      ? { type: st.tool, points: [p], color: st.color, width: st.width }
      : { type: st.tool, a: p, b: p, color: st.color, width: st.width };
    surf.render();
  });
  c.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = surf.toImage(e);
    if (current.points) current.points.push(p);
    else current.b = p;
    surf.render();
  });
  const end = () => {
    if (!current) return;
    const tiny = current.a && Math.hypot(current.b.x - current.a.x, current.b.y - current.a.y) < 3;
    if (!tiny) {
      shapes.push(current);
      redo.length = 0;
    }
    current = null;
    surf.render();
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  resetBtn.onclick = () => {
    shapes.length = 0;
    redo.length = 0;
    surf.render();
  };
  applyBtn.textContent = 'Save';
  applyBtn.onclick = () => saveCanvas(surf.export());
  footInfo.textContent = `${W} × ${H} px`;
}

/* ---------- Redact ---------- */

function redactTool() {
  const rects = [];
  let current = null;
  let style = 'box';
  const block = Math.max(8, Math.round(Math.max(W, H) / 70));
  const blurPx = Math.max(10, Math.round(Math.max(W, H) / 60));

  function applyRect(ctx, r, scale) {
    const x = Math.min(r.a.x, r.b.x);
    const y = Math.min(r.a.y, r.b.y);
    const w = Math.abs(r.b.x - r.a.x);
    const h = Math.abs(r.b.y - r.a.y);
    if (w < 1 || h < 1) return;
    if (r.style === 'box') {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, h);
    } else if (r.style === 'pixelate') {
      const small = makeCanvas(Math.ceil(w / block), Math.ceil(h / block));
      small.getContext('2d').drawImage(bitmap, x, y, w, h, 0, 0, small.width, small.height);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, x, y, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = `blur(${blurPx * scale}px)`;
      // Draw twice to defeat edge bleed of the original underneath.
      ctx.drawImage(bitmap, 0, 0, W, H);
      ctx.drawImage(bitmap, 0, 0, W, H);
      ctx.restore();
    }
  }

  const surf = drawingSurface((ctx, scale) => {
    rects.forEach((r) => applyRect(ctx, r, scale));
    if (current) {
      applyRect(ctx, current, scale);
      ctx.save();
      ctx.strokeStyle = '#e8461e';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(Math.min(current.a.x, current.b.x), Math.min(current.a.y, current.b.y), Math.abs(current.b.x - current.a.x), Math.abs(current.b.y - current.a.y));
      ctx.restore();
    }
  });

  const styleRow = segRow('Style', [['box', 'Black box'], ['pixelate', 'Pixelate'], ['blur', 'Blur']], style, (v) => (style = v));
  const bar = document.createElement('div');
  bar.className = 'row';
  bar.innerHTML = `<span class="lbl">History</span><div class="tools"><button class="tool" data-act="undo">${icon('undo', 15)} Undo</button><span class="hint" style="opacity:.65;font-size:12px">Drag over anything you want hidden. Redaction is permanent in the saved copy.</span></div><span></span>`;
  bar.querySelector('[data-act="undo"]').onclick = () => {
    rects.pop();
    surf.render();
  };
  controls.append(styleRow, bar);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      rects.pop();
      surf.render();
    }
  });

  const c = surf.canvas;
  c.addEventListener('pointerdown', (e) => {
    c.setPointerCapture(e.pointerId);
    const p = surf.toImage(e);
    current = { a: p, b: p, style };
  });
  c.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = surf.toImage(e);
    current.b = { x: Math.min(Math.max(0, p.x), W), y: Math.min(Math.max(0, p.y), H) };
    surf.render();
  });
  const end = () => {
    if (current && Math.abs(current.b.x - current.a.x) > 2 && Math.abs(current.b.y - current.a.y) > 2) rects.push(current);
    current = null;
    surf.render();
    footInfo.textContent = rects.length ? `${rects.length} area${rects.length > 1 ? 's' : ''} redacted` : `${W} × ${H} px`;
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  resetBtn.onclick = () => {
    rects.length = 0;
    surf.render();
    footInfo.textContent = `${W} × ${H} px`;
  };
  applyBtn.textContent = 'Save Redacted';
  applyBtn.onclick = () => {
    if (!rects.length) {
      footInfo.textContent = 'Draw at least one area to redact';
      return;
    }
    saveCanvas(surf.export());
  };
  footInfo.textContent = `${W} × ${H} px`;
}

/* ---------- Metadata ---------- */

const PRETTY = {
  Make: 'Camera make', Model: 'Camera model', LensModel: 'Lens', DateTimeOriginal: 'Taken', CreateDate: 'Created', ModifyDate: 'Modified',
  latitude: 'GPS latitude', longitude: 'GPS longitude', GPSAltitude: 'Altitude', Software: 'Software', Artist: 'Artist', Copyright: 'Copyright',
  ExposureTime: 'Exposure', FNumber: 'Aperture', ISO: 'ISO', FocalLength: 'Focal length', Orientation: 'Orientation', ImageDescription: 'Description',
};
const SENSITIVE = /^(latitude|longitude|GPS|Artist|Copyright|SerialNumber|BodySerialNumber|OwnerName|CameraOwnerName|Creator|Rights|ImageUniqueID|HostComputer)/;

function metadataTool() {
  resetBtn.style.visibility = 'hidden';
  if (data.pdf) return pdfMetadata();
  const { file, exif } = data.meta;
  const url = URL.createObjectURL(new Blob([data.png], { type: 'image/png' }));
  const rows = (obj, label) =>
    Object.entries(obj)
      .map(([k, v]) => `<div class="${SENSITIVE.test(k) ? 'sensitive' : ''}"><b>${esc(label?.[k] || k)}</b><span>${esc(typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(6) : v)}</span></div>`)
      .join('');
  const fileRows = {
    Size: formatBytes(file.size),
    Dimensions: file.width ? `${file.width} × ${file.height} px` : '—',
    Format: (file.format || data.ext).toUpperCase(),
    'Color space': file.space || '—',
    Transparency: file.hasAlpha ? 'Yes' : 'No',
    Modified: new Date(file.modified).toLocaleString(),
  };
  const count = Object.keys(exif).length;
  const hasGps = 'latitude' in exif || Object.keys(exif).some((k) => k.startsWith('GPS'));
  stage.innerHTML = `<div class="meta-wrap">
    <img class="meta-thumb" src="${url}" alt="">
    ${hasGps ? `<div class="warn">This image contains GPS location data. Anyone you send it to can see where it was taken.</div>` : ''}
    <div class="meta-h">File</div><div class="meta-table">${rows(fileRows)}</div>
    <div class="meta-h">Embedded metadata (${count})</div>
    <div class="meta-table">${count ? rows(exif, PRETTY) : '<div><b>None</b><span>No EXIF, XMP or IPTC metadata found.</span></div>'}</div>
  </div>`;
  controls.style.display = 'none';
  footInfo.textContent = count ? `${count} fields` : 'Clean';
  applyBtn.textContent = 'Remove all metadata';
  applyBtn.disabled = !count;
  applyBtn.onclick = async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Saving…';
    await api.invoke('editor:strip');
  };
}

function pdfMetadata() {
  const { file, fields, dates } = data.pdf;
  const F = [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords'], ['creator', 'Creator app'], ['producer', 'Producer']];
  stage.innerHTML = `<div class="meta-wrap">
    <div class="meta-table">
      <div><b>Size</b><span>${formatBytes(file.size)}</span></div>
      <div><b>Pages</b><span>${file.pages}</span></div>
      <div><b>Created</b><span>${dates.created ? new Date(dates.created).toLocaleString() : '—'}</span></div>
      <div><b>Modified</b><span>${dates.modified ? new Date(dates.modified).toLocaleString() : '—'}</span></div>
    </div>
    <form class="form" id="pdf-form">${F.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(fields[k])}" spellcheck="false"></label>`).join('')}</form>
  </div>`;
  controls.style.display = 'none';
  resetBtn.style.visibility = 'visible';
  resetBtn.textContent = 'Remove all';
  resetBtn.onclick = async () => {
    resetBtn.disabled = applyBtn.disabled = true;
    await api.invoke('editor:strip');
  };
  applyBtn.textContent = 'Save as copy';
  applyBtn.onclick = async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Saving…';
    const fd = new FormData(document.getElementById('pdf-form'));
    await api.invoke('editor:writePdfMeta', Object.fromEntries(fd.entries()));
  };
  footInfo.textContent = `${file.pages} page${file.pages === 1 ? '' : 's'}`;
}

/* ---------- boot ---------- */

const TOOLS = { crop: cropTool, addbg: addBgTool, edit: editTool, annotate: annotateTool, redact: redactTool, metadata: metadataTool };
(TOOLS[tool] || cropTool)();
