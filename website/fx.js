// Shortnut landing page motion: Lenis smooth scrolling + Motion (motion.dev) for scroll and micro-interactions.
// Everything here is progressive: without these libraries, or with reduced motion on, the page is fully static and usable.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const M = window.Motion;
  if (reduced || !M) {
    root.classList.remove('js-motion');
    return;
  }
  const { animate, scroll, inView, hover, press, stagger } = M;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const EASE = [0.16, 1, 0.3, 1];
  const SPRING = { type: 'spring', stiffness: 380, damping: 26 };

  /* ---------------- smooth scroll (Lenis) ---------------- */

  const lenis = window.Lenis ? new window.Lenis({ lerp: 0.085, smoothWheel: true }) : null;

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id === '#') return;
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : -64, duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    else target.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', id);
  });

  /* ---------------- helpers ---------------- */

  // Wraps every word in .w > .wi so headings can rise word by word from a mask.
  function splitWords(el) {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.append(document.createTextNode(part));
            const w = document.createElement('span');
            w.className = 'w';
            const wi = document.createElement('span');
            wi.className = 'wi';
            wi.textContent = part;
            w.append(wi);
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR' && !n.classList.contains('ichip')) {
          walk(n);
        }
      });
    };
    walk(el);
    return $$('.wi', el);
  }

  function revealGroup(container, items, { y = 28, gap = 0.07, amount = 0.2 } = {}) {
    if (!container || !items.length) return;
    items.forEach((it) => {
      it.style.opacity = '0';
      it.style.transform = `translateY(${y}px)`;
    });
    inView(container, () => {
      animate(items, { opacity: [0, 1], y: [y, 0] }, { duration: 0.9, ease: EASE, delay: stagger(gap) });
    }, { amount });
  }

  /* ---------------- scroll progress + nav ---------------- */

  const bar = document.createElement('div');
  bar.className = 'progress';
  document.body.append(bar);
  scroll((p) => (bar.style.transform = `scaleX(${p})`));

  const nav = $('.nav');
  let lastY = scrollY;
  let navHidden = false;
  addEventListener(
    'scroll',
    () => {
      const y = scrollY;
      const hide = y > lastY && y > 360;
      if (Math.abs(y - lastY) > 4 && hide !== navHidden) {
        navHidden = hide;
        animate(nav, { y: hide ? '-100%' : '0%' }, { duration: 0.45, ease: EASE });
      }
      lastY = y;
    },
    { passive: true }
  );

  /* ---------------- hero ---------------- */

  const hero = $('.hero');
  const lines = $$('.hl');
  const chip = $('.h-chip');
  const chipName = $('.h-name');
  const key = $('.h-key');
  const heroWheel = $('.h-wheel');

  const fan = $$('.fc');

  animate('.hero-pill', { opacity: [0, 1], y: [-10, 0] }, { duration: 0.7, ease: EASE });
  animate(lines, { opacity: [0, 1], y: [60, 0] }, { duration: 1.1, ease: EASE, delay: stagger(0.1, { startDelay: 0.08 }) });
  animate(chip, { scale: [0.3, 1], rotate: [-24, -6] }, { type: 'spring', bounce: 0.45, visualDuration: 0.8, delay: 0.35 });
  animate(heroWheel, { scale: [0, 1] }, { type: 'spring', bounce: 0.5, visualDuration: 0.8, delay: 0.5 });
  animate(key, { opacity: [0, 1], y: [-60, 0] }, { type: 'spring', bounce: 0.5, visualDuration: 0.7, delay: 0.55 });
  animate('.hero-sub, .hero-ctas, .hero-meta', { opacity: [0, 1], y: [20, 0] }, { duration: 0.9, ease: EASE, delay: stagger(0.08, { startDelay: 0.5 }) });
  // Cards fan up from below the stage, centre first.
  const order = [3, 2, 4, 1, 5, 0, 6];
  order.forEach((idx, i) => {
    if (!fan[idx]) return;
    animate(fan[idx], { opacity: [0, 1], translate: ['0 160px', '0 0'] }, { duration: 1.1, ease: EASE, delay: 0.7 + i * 0.06 });
  });

  // The fan opens a little wider as you scroll past the hero.
  scroll(
    (p) => fan.forEach((el, i) => (el.style.rotate = `${(i - 3) * p * 4}deg`)),
    { target: hero, offset: ['start start', 'end start'] }
  );

  // "Tap Shift" works literally: the key presses, the wheel spins up and the file converts.
  const NAMES = ['Sunset.heic', 'Sunset.jpg', 'Sunset.webp', 'Sunset.png'];
  let nameIdx = 0;
  let spinBoost = 0;
  function pressKey() {
    animate(key, { y: [0, 7, 0], borderBottomWidth: ['0.07em', '0.02em', '0.07em'] }, { duration: 0.32, ease: 'easeOut' });
    spinBoost += 520;
    nameIdx = (nameIdx + 1) % NAMES.length;
    animate(chip, { scale: [1, 0.9, 1] }, { type: 'spring', bounce: 0.55, visualDuration: 0.45 });
    animate(chipName, { opacity: 0, y: -4 }, { duration: 0.12 }).then(() => {
      chipName.textContent = NAMES[nameIdx];
      animate(chipName, { opacity: [0, 1], y: [6, 0], backgroundColor: ['#ef4a23', '#2f6fde'] }, { duration: 0.5, ease: EASE });
    });
  }
  let autoKey = null;
  inView(hero, () => {
    autoKey = setInterval(pressKey, 4500);
    return () => clearInterval(autoKey);
  });
  key.addEventListener('click', () => {
    clearInterval(autoKey);
    pressKey();
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Shift' || e.repeat || $('.drag-proxy')) return;
    if (hero.getBoundingClientRect().bottom > 0) {
      clearInterval(autoKey);
      pressKey();
    }
  });
  /* ---------------- one frame loop: Lenis + wheels that react to scroll velocity ---------------- */

  const finalWheel = $('.final-wheel');
  let angle = 0;
  let finalAngle = 0;
  let last = performance.now();
  function tick(t) {
    lenis?.raf(t);
    const dt = Math.min(64, t - last) / 1000;
    last = t;
    const v = Math.abs(lenis ? lenis.velocity : 0);
    spinBoost *= Math.pow(0.05, dt);
    angle += dt * (26 + spinBoost) + v * 0.4;
    finalAngle += dt * 8 + v * 0.12;
    heroWheel.style.rotate = `${angle}deg`;
    finalWheel.style.rotate = `${finalAngle}deg`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------------- headings: words rise from a mask ---------------- */

  $$('.how-copy h2, .sec-head h2, .privacy-h, .oss h2, .faq-head h2, .final h2').forEach((h) => {
    const words = splitWords(h);
    words.forEach((w) => (w.style.transform = 'translateY(110%)'));
    inView(h, () => {
      animate(words, { y: ['110%', '0%'] }, { duration: 1, ease: EASE, delay: stagger(0.05) });
    }, { amount: 0.2 });
  });
  $$('.tag').forEach((t) => revealGroup(t, [t], { y: 12 }));
  $$('.sec-side, .lead, .try').forEach((t) => revealGroup(t, [t], { y: 16 }));

  /* ---------------- how it works + demo ---------------- */

  revealGroup($('.how-steps'), $$('.how-steps li'), { gap: 0.1 });
  const desk = $('.desk');
  desk.style.opacity = '0';
  inView(desk, () => {
    animate(desk, { opacity: [0, 1], scale: [0.93, 1], y: [50, 0] }, { duration: 1.1, ease: EASE });
  }, { amount: 0.2 });

  /* ---------------- where ---------------- */

  revealGroup($('.where-grid'), $$('.where-grid li'), { y: 20, gap: 0.06 });
  /* ---------------- statement: words light up as you read ---------------- */

  const big = $('.big-text');
  splitWords(big);
  const bigItems = $$('.w, .ichip', big);
  scroll(
    (p) => {
      const n = bigItems.length;
      bigItems.forEach((w, i) => {
        const k = Math.min(1, Math.max(0, p * n * 1.2 - i));
        w.style.opacity = String(0.14 + 0.86 * k);
        if (w.classList.contains('ichip')) w.style.scale = String(0.6 + 0.4 * k);
      });
    },
    { target: big, offset: ['start 0.85', 'end 0.5'] }
  );

  // Stats count up (and "0 bytes uploaded" counts down to nothing).
  const stats = $('.stats');
  revealGroup(stats, $$('.stats > div'), { y: 24, gap: 0.08 });
  inView(stats, () => {
    $$('dt', stats).forEach((dt, i) => {
      const text = dt.textContent;
      const m = text.match(/^(\d+)(.*)$/);
      if (m) {
        const to = Number(m[1]);
        animate(to === 0 ? 999 : 0, to, {
          duration: 1.6,
          delay: 0.15 + i * 0.1,
          ease: EASE,
          onUpdate: (v) => (dt.textContent = `${Math.round(v)}${m[2]}`),
        });
      } else {
        const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        animate(0, 1, {
          duration: 1.1,
          delay: 0.15 + i * 0.1,
          onUpdate: (p) => {
            dt.textContent = [...text].map((c, j) => (p * text.length > j ? c : AZ[(Math.random() * 26) | 0])).join('');
          },
        });
      }
    });
  }, { amount: 0.6 });

  /* ---------------- details: animated height for tools + FAQ ---------------- */

  function animatedDetails(list, onOpen) {
    list.forEach((d) => {
      const group = d.getAttribute('name');
      if (group) {
        d.dataset.group = group;
        d.removeAttribute('name'); // we enforce "one open" ourselves so closing can animate
      }
      const summary = $('summary', d);
      const wrap = document.createElement('div');
      wrap.className = 'det-anim';
      while (summary.nextSibling) wrap.append(summary.nextSibling);
      d.append(wrap);
      summary.addEventListener('click', (e) => {
        e.preventDefault();
        if (d.open && !d._closing) close(d);
        else {
          if (d.dataset.group) list.filter((o) => o !== d && o.open && o.dataset.group === d.dataset.group).forEach(close);
          open(d);
        }
      });
    });

    function open(d) {
      const w = d.lastElementChild;
      const tok = (d._tok = {});
      d._closing = false;
      d.open = true;
      w.style.overflow = 'hidden';
      const h = w.scrollHeight;
      animate(w, { height: [0, h], opacity: [0, 1] }, { type: 'spring', visualDuration: 0.55, bounce: 0.1 }).then(() => {
        if (d._tok !== tok) return;
        w.style.height = '';
        w.style.overflow = '';
      });
      onOpen?.(d);
    }

    function close(d) {
      const w = d.lastElementChild;
      const tok = (d._tok = {});
      d._closing = true;
      w.style.overflow = 'hidden';
      animate(w, { height: [w.offsetHeight, 0], opacity: [1, 0] }, { duration: 0.38, ease: [0.4, 0, 0.2, 1] }).then(() => {
        if (d._tok !== tok) return;
        d.open = false;
        d._closing = false;
        w.style.height = '';
        w.style.opacity = '';
        w.style.overflow = '';
      });
    }
  }

  /* ---------------- tools: each illustration performs when its bar opens ---------------- */

  const pop = { type: 'spring', bounce: 0.45, visualDuration: 0.6 };
  const ILL = {
    'ill-convert': (ill) => {
      const [a, b] = $$('.f-card', ill);
      animate(a, { x: [-60, 0], rotate: [-16, -4], opacity: [0, 1] }, { ...SPRING, delay: 0.05 });
      animate($('.ill-arrow', ill), { x: [-14, 0], opacity: [0, 1] }, { duration: 0.5, delay: 0.25, ease: EASE });
      animate(b, { scale: [0.5, 1], rotate: [14, 3], y: [10, -8], opacity: [0, 1] }, { ...pop, delay: 0.38 });
    },
    'ill-compress': (ill) => {
      animate($$('.bar-row', ill), { opacity: [0, 1], x: [-16, 0] }, { duration: 0.6, ease: EASE, delay: stagger(0.08) });
      animate($('.bar i.hot', ill), { width: ['100%', '34%'] }, { duration: 1.2, ease: EASE, delay: 0.35 });
      const n = $('.saved span', ill);
      animate(0, 66, { duration: 1.2, delay: 0.35, ease: EASE, onUpdate: (v) => (n.textContent = `−${Math.round(v)}%`) });
    },
    'ill-crop': (ill) => {
      animate($('.crop-pic', ill), { opacity: [0, 1], y: [20, 0] }, { duration: 0.6, ease: EASE });
      animate($('.crop-frame', ill), { scale: [1.6, 1], opacity: [0, 1] }, { ...SPRING, delay: 0.2 });
      animate($$('.ratios span', ill), { opacity: [0, 1], y: [8, 0] }, { duration: 0.4, delay: stagger(0.05, { startDelay: 0.3 }) });
    },
    'ill-redact': (ill) => {
      animate($('.doc', ill), { opacity: [0, 1], y: [24, 0], rotate: [3, 0] }, { duration: 0.7, ease: EASE });
      animate($('.blk', ill), { scaleX: [0, 1] }, { duration: 0.6, ease: EASE, delay: 0.3 });
      animate($('.pix', ill), { opacity: [0, 1], scaleX: [0.2, 1] }, { duration: 0.6, ease: EASE, delay: 0.45 });
      animate($('.ring-mark', ill), { scale: [0.3, 1], opacity: [0, 1] }, { ...pop, delay: 0.65 });
    },
    'ill-bg': (ill) => {
      animate($('.shot', ill), { opacity: [0, 1], y: [50, 0], rotate: [8, -2], scale: [0.9, 1] }, { ...SPRING, delay: 0.05 });
    },
    'ill-meta': (ill) => {
      const items = $$('li', ill);
      animate(items, { opacity: [0, 1], x: [-14, 0] }, { duration: 0.5, ease: EASE, delay: stagger(0.08) });
      animate($$('s', ill), { textDecorationColor: ['rgba(239,74,35,0)', 'rgba(239,74,35,1)'] }, { duration: 0.4, delay: stagger(0.12, { startDelay: 0.45 }) });
      animate($('.strip-pill', ill), { scale: [0, 1], opacity: [0, 1] }, { ...pop, delay: 0.85 });
    },
    'ill-pdf': (ill) => {
      animate($$('.pg:not(.merged)', ill), { opacity: [0, 1], y: [30, 0] }, { duration: 0.55, ease: EASE, delay: stagger(0.08) });
      animate($('.ill-arrow', ill), { opacity: [0, 1], x: [-12, 0] }, { duration: 0.4, delay: 0.35 });
      animate($('.pg.merged', ill), { scale: [0.4, 1], rotate: [-12, 0], opacity: [0, 1] }, { ...pop, delay: 0.5 });
    },
  };
  function playIllustration(d) {
    const ill = $('.ill', d);
    const fn = ill && ILL[[...ill.classList].find((c) => ILL[c])];
    fn?.(ill);
  }

  const accItems = $$('.acc-item');
  animatedDetails(accItems, playIllustration);
  animatedDetails($$('.faq details'));
  revealGroup($('.acc'), accItems, { y: 30, gap: 0.06, amount: 0.1 });
  inView($('.acc'), () => {
    const first = accItems.find((d) => d.open);
    if (first) setTimeout(() => playIllustration(first), 250);
  }, { amount: 0.25 });
  revealGroup($('.faq'), $$('.faq details'), { y: 18, gap: 0.05 });
  /* ---------------- formats: sliding tab indicator + staggered tags ---------------- */

  const tabs = $('#fmt-tabs');
  const panel = $('#fmt-panel');
  const ind = document.createElement('span');
  ind.className = 'tab-ind';
  tabs.prepend(ind);
  function moveIndicator(instant) {
    const btn = $('[aria-selected="true"]', tabs);
    if (!btn) return;
    const box = { x: btn.offsetLeft, y: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight };
    animate(ind, box, instant ? { duration: 0 } : { type: 'spring', visualDuration: 0.45, bounce: 0.22 });
  }
  moveIndicator(true);
  addEventListener('resize', () => moveIndicator(true));
  document.addEventListener('shortnut:format', () => {
    moveIndicator(false);
    animate($$('.tags span', panel), { opacity: [0, 1], y: [10, 0], scale: [0.94, 1] }, { duration: 0.45, ease: EASE, delay: stagger(0.015) });
  });
  revealGroup($('.fmt'), [$('.fmt')], { y: 40 });

  /* ---------------- privacy: data flows through, never out ---------------- */

  const flow = $('.flow');
  const flowParts = [...$('.flow-row', flow).children];
  revealGroup($('.privacy-grid'), [flow], { y: 30 });
  flowParts.forEach((p) => (p.style.opacity = '0'));
  inView(flow, () => {
    animate(flowParts, { opacity: [0, 1], scale: [0.85, 1] }, { ...SPRING, delay: stagger(0.14, { startDelay: 0.2 }) });
    animate($('.cloud-off', flow), { x: [0, -7, 7, -5, 5, 0] }, { duration: 0.6, delay: 1.1 });
  }, { amount: 0.4 });
  revealGroup($('.checks'), $$('.checks li'), { y: 16, gap: 0.07 });

  /* ---------------- open source: terminal types itself ---------------- */

  const code = $('.term code');
  code.innerHTML = code.innerHTML
    .split('\n')
    .map((l) => `<span class="ln">${l || ' '}</span>`)
    .join('');
  const termLines = $$('.ln', code);
  termLines.at(-1).insertAdjacentHTML('beforeend', '<span class="caret"></span>');
  termLines.forEach((l) => (l.style.opacity = '0'));
  revealGroup($('.oss-grid'), [$('.term')], { y: 40 });
  inView($('.term'), () => {
    animate(termLines, { opacity: [0, 1], x: [-8, 0] }, { duration: 0.3, delay: stagger(0.22, { startDelay: 0.35 }) });
  }, { amount: 0.5 });

  /* ---------------- final CTA ---------------- */

  const card = $('.final-card');
  scroll(
    (p) => {
      card.style.scale = String(0.9 + 0.1 * p);
      card.style.borderRadius = `${60 - 32 * p}px`;
    },
    { target: card, offset: ['start end', 'start 0.4'] }
  );

  /* ---------------- footer wordmark ---------------- */

  const mark = $('.wordmark');
  mark.innerHTML = [...mark.textContent].map((c) => `<span class="lt">${c}</span>`).join('');
  const letters = $$('.lt', mark);
  letters.forEach((l) => (l.style.transform = 'translateY(100%)'));
  inView(mark, () => {
    animate(letters, { y: ['100%', '0%'] }, { type: 'spring', visualDuration: 0.9, bounce: 0.25, delay: stagger(0.05) });
  }, { amount: 0.3 });
  /* ---------------- micro-interactions (kept deliberately small) ---------------- */

  press('.btn, .tabs button', (el) => {
    animate(el, { scale: 0.97 }, { duration: 0.12, ease: 'easeOut' });
    return () => animate(el, { scale: 1 }, { duration: 0.25, ease: EASE });
  });

  const bigArrow = $('.big-link svg');
  hover('.big-link', () => {
    animate(bigArrow, { x: 6 }, { duration: 0.35, ease: EASE });
    return () => animate(bigArrow, { x: 0 }, { duration: 0.35, ease: EASE });
  });

  // Content changed height (details, fonts): keep Lenis' scroll limits in sync.
  document.fonts?.ready.then(() => lenis?.resize());
})();
