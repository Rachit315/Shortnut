// Shortnut landing page: links/config, release info, format tabs and the interactive drag + Shift demo.
(() => {
  const cfg = window.SHORTNUT || {};
  const repo = (cfg.repo || 'https://github.com/shortnut/shortnut').replace(/\/$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------------- links & release ---------------- */

  $$('[data-repo]').forEach((a) => (a.href = repo));
  $$('[data-repo-path]').forEach((a) => (a.href = repo + a.dataset.repoPath));
  $$('[data-repo-text]').forEach((el) => (el.textContent = repo));
  $('#year').textContent = new Date().getFullYear();

  const isWindows = /Win/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
  if (!isWindows) $('#os-note').hidden = false;

  const formatSize = (n) => (n > 1048576 ? `${Math.round(n / 1048576)} MB` : `${Math.round(n / 1024)} KB`);

  function setDownload(url, label) {
    if (url) $$('[data-download]').forEach((a) => {
      a.href = url;
      if (!/^https?:/.test(url) || url.startsWith(location.origin)) a.setAttribute('download', '');
    });
    if (label) {
      $('#release-meta').textContent = `${label} · MIT licensed · 100% offline · No account`;
      $('#download-fine').textContent = `${label} · Windows 10/11 · 64-bit · Free & open source`;
    }
  }

  // Default: the stable asset name the release workflow uploads to GitHub Releases.
  setDownload(cfg.downloadUrl || `${repo}/releases/latest/download/Shortnut-Setup.exe`);
  if (!cfg.downloadUrl) {
    fetch('downloads/release.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(async (rel) => {
        // Only switch to the self-hosted file if it was actually deployed alongside release.json.
        const url = `downloads/${encodeURIComponent(rel.file)}`;
        const head = await fetch(url, { method: 'HEAD' });
        setDownload(head.ok ? url : undefined, `v${rel.version} · ${formatSize(rel.size)}`);
      })
      .catch(() => {});
  }

  /* ---------------- nav & reveal ---------------- */

  const nav = $('.nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  $$('.step, .feature, .fmt-panel, .faq details, .checks li').forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });

  /* ---------------- formats ---------------- */

  const FORMATS = {
    Images: {
      opens: ['JPG', 'PNG', 'WEBP', 'AVIF', 'HEIC', 'GIF', 'TIFF', 'BMP', 'SVG', 'ICO'],
      to: ['PNG', 'JPG', 'WEBP', 'AVIF', 'GIF', 'BMP', 'TIFF', 'ICO', 'PDF'],
      tools: ['Compress', 'Crop', 'Add background', 'Annotate', 'Redact', 'Edit & resize', 'Metadata'],
    },
    PDF: { opens: ['PDF'], to: ['DOCX', 'JPG', 'PNG', 'TXT', 'HTML'], tools: ['Compress', 'Merge', 'Split', 'Rotate', 'Extract pages', 'Metadata'] },
    Documents: { opens: ['DOCX', 'TXT', 'MD', 'HTML', 'CSV', 'JSON'], to: ['PDF', 'DOCX', 'TXT', 'HTML', 'MD', 'CSV ⇄ JSON'], tools: [] },
    Video: {
      opens: ['MP4', 'MOV', 'MKV', 'WEBM', 'AVI', 'WMV', 'M4V', 'FLV', '3GP', 'MPG'],
      to: ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI', 'GIF', 'MP3', 'WAV'],
      tools: ['Compress', 'Mute', '720p', 'Rotate', 'Thumbnail'],
    },
    Audio: { opens: ['MP3', 'WAV', 'M4A', 'AAC', 'OGG', 'FLAC', 'OPUS', 'WMA', 'AIFF'], to: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC', 'OPUS', 'AAC'], tools: ['Compress', 'Normalize', 'Mono'] },
  };
  const tabs = $('#fmt-tabs');
  const panel = $('#fmt-panel');
  const tags = (list, hot) => `<div class="tags ${hot ? 'hot' : ''}">${list.map((x) => `<span>${x}</span>`).join('')}</div>`;
  function showFormat(name) {
    $$('button', tabs).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === name)));
    const f = FORMATS[name];
    panel.innerHTML = `<div><h4>Drop these</h4>${tags(f.opens)}</div><div><h4>Get these</h4>${tags(f.to, true)}</div><div><h4>Tools</h4>${f.tools.length ? tags(f.tools) : '<p style="margin:0;color:var(--ink-3)">Conversion only</p>'}</div>`;
  }
  tabs.innerHTML = Object.keys(FORMATS).map((k) => `<button role="tab" data-k="${k}">${k}</button>`).join('');
  tabs.addEventListener('click', (e) => e.target.dataset.k && showFormat(e.target.dataset.k));
  showFormat('Images');

  /* ---------------- demo ---------------- */

  const desk = $('#desk');
  const filesEl = $('#files');
  const wheelEl = $('#dwheel');
  const toastEl = $('#dtoast');
  const hint = $('#desk-hint');
  const ghost = $('#ghost');
  const shiftBtn = $('#shift-btn');

  const ICONS = {
    compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
    pen: '<circle cx="12" cy="12" r="9.5"/><path d="M14.6 6.4l3 3L11 16l-3 1 1-3z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L6 21"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/>',
    eyeoff: '<path d="M10.7 5.1A10.7 10.7 0 0 1 22 12a10.8 10.8 0 0 1-1.4 2.4M14.1 14.2a3 3 0 0 1-4.2-4.2M17.5 17.5A10.8 10.8 0 0 1 2 12a10.7 10.7 0 0 1 4.4-5.4M2 2l20 20"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
    split: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>',
    convert: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  };
  const ico = (n, s = 17) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

  $$('[data-ico]').forEach((el) => (el.innerHTML = ico(el.dataset.ico, 22)));

  const MENUS = {
    img: {
      label: '1.2 MB',
      convert: ['WEBP', 'AVIF', 'JPG', 'GIF', 'BMP', 'PDF', 'ICO', 'TIFF'],
      tools: [['Compress', 'compress'], ['Metadata', 'tag'], ['Edit', 'sliders'], ['Annotate', 'pen'], ['Add BG', 'image'], ['Crop', 'crop'], ['Redact', 'eyeoff']],
    },
    pdf: { label: '1.1 MB', convert: ['DOCX', 'JPG', 'PNG', 'TXT', 'HTML'], tools: [['Compress', 'compress'], ['Metadata', 'tag'], ['Rotate', 'rotate'], ['Split', 'split'], ['Extract', 'image']] },
    vid: { label: '24 MB', convert: ['MP4', 'WEBM', 'MKV', 'AVI', 'GIF', 'MP3', 'WAV'], tools: [['Compress', 'compress'], ['Mute', 'mute'], ['720p', 'crop'], ['Rotate', 'rotate'], ['Thumbnail', 'image']] },
    doc: { label: '86 KB', convert: ['PDF', 'TXT', 'HTML', 'MD'], tools: [] },
  };

  const KIND_OF = { png: 'img', jpg: 'img', webp: 'img', avif: 'img', gif: 'img', bmp: 'img', ico: 'img', tiff: 'img', pdf: 'pdf', mov: 'vid', mp4: 'vid', webm: 'vid', mkv: 'vid', avi: 'vid', docx: 'doc', txt: 'doc', html: 'doc', md: 'doc', mp3: 'aud', wav: 'aud' };
  const THUMB = { img: 'img', pdf: 'doc', vid: 'vid', doc: 'doc', aud: 'zip' };

  let files = [];
  function addFile(name, x, y, isNew = false) {
    const ext = name.split('.').pop().toLowerCase();
    const kind = KIND_OF[ext] || 'doc';
    const el = document.createElement('div');
    el.className = `dfile${isNew ? ' new' : ''}`;
    el.innerHTML = `<div class="thumb ${THUMB[kind]}"></div><div class="name">${name}</div>`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    filesEl.appendChild(el);
    const f = { name, kind, x, y, el, generated: isNew };
    files.push(f);
    el.addEventListener('pointerdown', (e) => startDrag(e, f));
    const gen = files.filter((g) => g.generated);
    if (gen.length > 5) {
      const old = gen[0];
      old.el.remove();
      files = files.filter((g) => g !== old);
    }
    return f;
  }

  function layoutInitial() {
    filesEl.innerHTML = '';
    files = [];
    const w = desk.clientWidth;
    addFile('Page 001.pdf', 26, 26);
    addFile('Sunset.png', 26, 150);
    addFile('Trip.mov', 26, 274);
    addFile('Notes.docx', Math.max(150, w - 140), 26);
  }

  /* wheel */
  const G = { size: 330, outer: 160, ringOuter: 151, ringInner: 64, gap: 7, round: 6 };
  const C = G.size / 2;
  const polar = (r, a) => [C + r * Math.sin(a), C - r * Math.cos(a)];
  function sector(a0, a1) {
    const ro = G.ringOuter - G.round;
    const ri = G.ringInner + G.round;
    const go = (G.gap / 2 + G.round) / ro;
    const gi = (G.gap / 2 + G.round) / ri;
    const [x0, y0] = polar(ro, a0 + go);
    const [x1, y1] = polar(ro, a1 - go);
    const [x2, y2] = polar(ri, a1 - gi);
    const [x3, y3] = polar(ri, a0 + gi);
    return `M${x0},${y0} A${ro},${ro} 0 0 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 0 0 ${x3},${y3} Z`;
  }

  const wheel = { open: false, mode: 'convert', items: [], active: null, kind: null, x: 0, y: 0 };

  function renderWheel() {
    const m = MENUS[wheel.kind];
    const tools = wheel.mode === 'tools';
    wheel.items = tools ? m.tools.map(([l, i]) => ({ label: l, icon: i })) : m.convert.map((l) => ({ label: l }));
    const n = wheel.items.length;
    const span = (Math.PI * 2) / n;
    let svg = `<svg viewBox="0 0 ${G.size} ${G.size}" width="${G.size}" height="${G.size}"><defs><linearGradient id="dseg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeadb"/><stop offset="1" stop-color="#ffd5bb"/></linearGradient></defs><circle class="ring" cx="${C}" cy="${C}" r="${G.outer}"/>`;
    let labels = '';
    wheel.items.forEach((it, i) => {
      const a0 = i * span - span / 2;
      svg += `<path class="seg" data-i="${i}" d="${sector(a0, a0 + span)}"/>`;
      const [lx, ly] = polar((G.ringInner + G.ringOuter) / 2 + 2, a0 + span / 2);
      labels += `<div class="lbl" data-i="${i}" style="left:${lx}px;top:${ly}px">${it.icon ? ico(it.icon) : ''}<span>${it.label}</span></div>`;
    });
    svg += '</svg>';
    const sub = m.tools.length ? (tools ? 'Shift · formats' : 'Shift · tools') : '';
    wheelEl.className = `dwheel ${wheel.open ? 'open' : ''} ${tools ? 'tools' : ''}`;
    wheelEl.innerHTML = `${svg}${labels}<div class="hub"><div class="pill">${m.label}</div><div class="hint">${sub}</div></div>`;
    wheel.active = null;
  }

  function setActive(i) {
    if (i === wheel.active) return;
    wheel.active = i;
    $$('.seg, .lbl', wheelEl).forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === i));
    if (drag?.proxy) drag.proxy.querySelector('.badge').hidden = i === null;
  }

  function openWheel(x, y, kind) {
    Object.assign(wheel, { open: true, mode: 'convert', kind, x, y });
    wheelEl.hidden = false;
    wheelEl.style.left = `${x}px`;
    wheelEl.style.top = `${y}px`;
    renderWheel();
    requestAnimationFrame(() => wheelEl.classList.add('open'));
    hint.style.opacity = 0;
  }

  function toggleMode() {
    if (!wheel.open || !MENUS[wheel.kind].tools.length) return;
    wheel.mode = wheel.mode === 'convert' ? 'tools' : 'convert';
    renderWheel();
    wheelEl.classList.add('open');
  }

  function closeWheel() {
    wheel.open = false;
    wheelEl.classList.remove('open');
    setTimeout(() => !wheel.open && (wheelEl.hidden = true), 200);
  }

  function hitTest(x, y) {
    const dx = x - wheel.x;
    const dy = y - wheel.y;
    const r = Math.hypot(dx, dy);
    if (r < G.ringInner || r > G.outer + 6) return null;
    const n = wheel.items.length;
    const span = (Math.PI * 2) / n;
    const a = (Math.atan2(dx, -dy) + span / 2 + Math.PI * 4) % (Math.PI * 2);
    return Math.floor(a / span) % n;
  }

  /* result */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (name) => name.replace(/\.[^.]+$/, '');
  const extOf = (name) => name.split('.').pop();

  async function runAction(file, item, x, y, mode) {
    let title;
    let out;
    let extra = '';
    if (mode === 'convert') {
      title = `Converting to ${item.label}`;
      out = `${base(file.name)}.${item.label.toLowerCase()}`;
    } else {
      const suffix = { Compress: 'Compressed', Crop: 'Cropped', 'Add BG': 'With Background', Annotate: 'Annotated', Redact: 'Redacted', Edit: 'Edited', Metadata: 'Clean', Rotate: 'Rotated', Mute: 'Muted', '720p': '720p', Split: 'Split', Extract: 'Pages', Thumbnail: 'Thumbnail' }[item.label] || 'Edited';
      title = item.label === 'Compress' ? 'Compressing' : item.label === 'Metadata' ? 'Removing metadata' : `${item.label}…`;
      const ext = item.label === 'Add BG' ? 'png' : item.label === 'Thumbnail' ? 'jpg' : extOf(file.name);
      out = `${base(file.name)} ${suffix}.${ext}`;
      if (item.label === 'Compress') extra = ' · 1.2 MB → 412 KB';
    }
    const tx = Math.min(Math.max(x, 150), desk.clientWidth - 150);
    const ty = Math.min(Math.max(y, 60), desk.clientHeight - 60);
    toastEl.hidden = false;
    toastEl.style.left = `${tx}px`;
    toastEl.style.top = `${ty}px`;
    toastEl.innerHTML = `<b>${title}</b><small>0 of 1 saved</small><div class="bar"><i></i></div>`;
    await sleep(60);
    $('.bar i', toastEl).style.width = '100%';
    await sleep(750);
    $('small', toastEl).textContent = `1 of 1 saved${extra}`;
    const nx = Math.min(file.x + 124, desk.clientWidth - 120);
    let ny = file.y;
    while (files.some((f) => Math.abs(f.x - nx) < 60 && Math.abs(f.y - ny) < 60) && ny < desk.clientHeight - 200) ny += 116;
    addFile(out, nx, ny, true);
    await sleep(1300);
    toastEl.hidden = true;
  }

  /* pointer drag */
  let drag = null;
  let userTookOver = false;

  function deskPoint(e) {
    const r = desk.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function startDrag(e, f) {
    if (e.button !== 0) return;
    e.preventDefault();
    stopAutoplay();
    const p = deskPoint(e);
    drag = { f, start: p, moved: false, proxy: null, pointerType: e.pointerType, stillTimer: null, offset: { x: p.x - f.x, y: p.y - f.y - 34 } };
    desk.setPointerCapture(e.pointerId);
  }

  function moveProxy(p) {
    drag.proxy.style.left = `${p.x - drag.offset.x}px`;
    drag.proxy.style.top = `${p.y - drag.offset.y}px`;
  }

  desk.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = deskPoint(e);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 5) {
      drag.moved = true;
      drag.f.el.classList.add('dragging-src');
      const proxy = drag.f.el.cloneNode(true);
      proxy.classList.add('drag-proxy');
      proxy.classList.remove('new', 'dragging-src');
      proxy.insertAdjacentHTML('beforeend', '<span class="badge" hidden>+</span>');
      desk.appendChild(proxy);
      drag.proxy = proxy;
    }
    if (!drag.moved) return;
    moveProxy(p);
    drag.last = p;
    if (wheel.open) setActive(hitTest(p.x, p.y));
    // Touch devices have no Shift key: holding still for a moment opens the wheel too.
    if (drag.pointerType !== 'mouse' && !wheel.open) {
      clearTimeout(drag.stillTimer);
      drag.stillTimer = setTimeout(() => drag && !wheel.open && openWheel(p.x, p.y, drag.f.kind), 650);
    }
  });

  async function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearTimeout(d.stillTimer);
    d.f.el.classList.remove('dragging-src');
    d.proxy?.remove();
    const item = wheel.open && wheel.active !== null ? wheel.items[wheel.active] : null;
    const mode = wheel.mode;
    const { x, y } = wheel;
    if (wheel.open) closeWheel();
    if (item) await runAction(d.f, item, x, y, mode);
    else if (d.moved) hint.style.opacity = 1;
  }
  desk.addEventListener('pointerup', endDrag);
  desk.addEventListener('pointercancel', endDrag);

  function pressShift() {
    if (!drag?.moved) return;
    if (!wheel.open) openWheel(drag.last.x, drag.last.y, drag.f.kind);
    else toggleMode();
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && !e.repeat) pressShift();
    if (e.key === 'Escape' && drag) {
      wheel.active = null;
      endDrag();
    }
  });
  shiftBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    shiftBtn.classList.add('pressed');
    pressShift();
  });
  shiftBtn.addEventListener('pointerup', () => shiftBtn.classList.remove('pressed'));

  /* autoplay: a ghost cursor shows the gesture until the visitor tries it */
  let auto = { running: false, cancelled: false };

  function stopAutoplay() {
    userTookOver = true;
    auto.cancelled = true;
    ghost.classList.remove('on');
    // Drop any drag the ghost cursor was in the middle of.
    if (drag && !drag.pointerType) {
      drag.f.el.classList.remove('dragging-src');
      drag.proxy?.remove();
      drag = null;
      if (wheel.open) closeWheel();
    }
  }

  async function glide(from, to, ms, onStep) {
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      if (auto.cancelled) throw new Error('cancelled');
      const t = i / steps;
      const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      ghost.style.left = `${p.x}px`;
      ghost.style.top = `${p.y}px`;
      onStep?.(p);
      await sleep(16);
    }
  }

  async function wait(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (auto.cancelled) throw new Error('cancelled');
      await sleep(30);
    }
  }

  async function autoplayOnce(scenario) {
    const f = files.find((x) => x.name === scenario.file);
    if (!f) return;
    const grab = { x: f.x + 54, y: f.y + 34 + 40 };
    const drop = { x: desk.clientWidth * 0.58, y: desk.clientHeight * 0.52 };
    ghost.style.left = `${desk.clientWidth * 0.8}px`;
    ghost.style.top = `${desk.clientHeight * 0.85}px`;
    ghost.classList.add('on');
    await glide({ x: desk.clientWidth * 0.8, y: desk.clientHeight * 0.85 }, grab, 700);
    await wait(250);
    // emulate a drag
    drag = { f, start: grab, moved: true, proxy: null, offset: { x: grab.x - f.x, y: grab.y - f.y - 34 } };
    f.el.classList.add('dragging-src');
    const proxy = f.el.cloneNode(true);
    proxy.classList.add('drag-proxy');
    proxy.classList.remove('new', 'dragging-src');
    proxy.insertAdjacentHTML('beforeend', '<span class="badge" hidden>+</span>');
    desk.appendChild(proxy);
    drag.proxy = proxy;
    await glide(grab, drop, 900, (p) => {
      moveProxy(p);
      drag.last = p;
    });
    await wait(250);
    shiftBtn.classList.add('pressed');
    openWheel(drop.x, drop.y, f.kind);
    await wait(160);
    shiftBtn.classList.remove('pressed');
    if (scenario.tools) {
      await wait(700);
      toggleMode();
    }
    await wait(500);
    const idx = wheel.items.findIndex((i) => i.label === scenario.pick);
    const n = wheel.items.length;
    const a = idx * ((Math.PI * 2) / n);
    const r = (G.ringInner + G.ringOuter) / 2;
    const target = { x: drop.x + r * Math.sin(a), y: drop.y - r * Math.cos(a) };
    await glide(drop, target, 600, (p) => {
      moveProxy(p);
      setActive(hitTest(p.x, p.y));
    });
    await wait(450);
    await endDrag();
    ghost.classList.remove('on');
  }

  const SCENARIOS = [
    { file: 'Sunset.png', pick: 'JPG' },
    { file: 'Page 001.pdf', pick: 'DOCX' },
    { file: 'Sunset.png', pick: 'Add BG', tools: true },
    { file: 'Trip.mov', pick: 'GIF' },
  ];

  async function autoplay() {
    if (auto.running || userTookOver) return;
    auto = { running: true, cancelled: false };
    let i = 0;
    try {
      await wait(900);
      while (!auto.cancelled) {
        await autoplayOnce(SCENARIOS[i % SCENARIOS.length]);
        i++;
        await wait(1600);
        if (i % SCENARIOS.length === 0) {
          layoutInitial();
          await wait(600);
        }
      }
    } catch {
      // Cancelled (scrolled away or the visitor took over): tidy up a half-finished ghost drag.
      if (drag && !drag.pointerType) {
        drag.f.el.classList.remove('dragging-src');
        drag.proxy?.remove();
        drag = null;
        if (wheel.open) closeWheel();
      }
    } finally {
      auto.running = false;
      ghost.classList.remove('on');
    }
  }

  layoutInitial();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    new IntersectionObserver(
      (entries) => {
        const visible = entries[0].isIntersecting;
        if (visible) autoplay();
        else if (auto.running) auto.cancelled = true;
      },
      { threshold: 0.4 }
    ).observe(desk);
  }
  desk.addEventListener('pointerdown', () => stopAutoplay(), true);
})();
