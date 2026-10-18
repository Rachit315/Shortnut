// The radial menu. Pure SVG, rebuilt on every render (it has at most 9 segments).
import { icon, esc } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';

export const GEOMETRY = { size: 440, outer: 214, ringOuter: 202, ringInner: 86, gap: 9, round: 8 };

const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

function sectorPath(cx, cy, r1, r2, a0, a1, gap, round) {
  // Inset by `round` so a same-colour stroke of 2*round gives rounded corners.
  const ro = r2 - round;
  const ri = r1 + round;
  const go = (gap / 2 + round) / ro;
  const gi = (gap / 2 + round) / ri;
  const [x0, y0] = polar(cx, cy, ro, a0 + go);
  const [x1, y1] = polar(cx, cy, ro, a1 - go);
  const [x2, y2] = polar(cx, cy, ri, a1 - gi);
  const [x3, y3] = polar(cx, cy, ri, a0 + gi);
  const largeO = a1 - a0 - 2 * go > Math.PI ? 1 : 0;
  const largeI = a1 - a0 - 2 * gi > Math.PI ? 1 : 0;
  return `M${x0},${y0} A${ro},${ro} 0 ${largeO} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${largeI} 0 ${x3},${y3} Z`;
}

/**
 * @param {HTMLElement} host element the wheel is drawn into
 */
export function createWheel(host) {
  const g = GEOMETRY;
  const c = g.size / 2;
  let items = [];
  let active = null;

  host.classList.add('wheel');
  host.style.width = host.style.height = `${g.size}px`;
  host.innerHTML = `
    <svg class="wheel-svg" viewBox="0 0 ${g.size} ${g.size}" width="${g.size}" height="${g.size}">
      <defs>
        <radialGradient id="wheelRing" cx="50%" cy="40%" r="60%">
          <stop offset="0" style="stop-color:var(--ring-a)"/>
          <stop offset="1" style="stop-color:var(--ring-b)"/>
        </radialGradient>
        <linearGradient id="segFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--seg-a)"/>
          <stop offset="1" style="stop-color:var(--seg-b)"/>
        </linearGradient>
      </defs>
      <circle class="ring" cx="${c}" cy="${c}" r="${g.outer}" />
      <g class="segments"></g>
      <circle class="hub" cx="${c}" cy="${c}" r="${g.ringInner - 8}" />
    </svg>
    <div class="labels"></div>
    <div class="center"><div class="center-pill"><span class="center-main"></span></div><span class="center-sub"></span></div>`;

  const segG = host.querySelector('.segments');
  const labels = host.querySelector('.labels');
  const centerMain = host.querySelector('.center-main');
  const centerSub = host.querySelector('.center-sub');

  function render({ items: next, mode = 'convert', center = '', sub = '', skeleton = false }) {
    items = next || [];
    active = null;
    host.dataset.mode = mode;
    host.classList.toggle('skeleton', skeleton);
    host.classList.toggle('empty', !skeleton && !items.length);
    segG.textContent = '';
    labels.textContent = '';
    const n = skeleton ? 8 : items.length;
    const span = (Math.PI * 2) / Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      const a0 = i * span - span / 2;
      const a1 = a0 + span;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', n === 1 ? sectorPath(c, c, g.ringInner, g.ringOuter, -Math.PI + 0.001, Math.PI - 0.001, 0, g.round) : sectorPath(c, c, g.ringInner, g.ringOuter, a0, a1, g.gap, g.round));
      path.setAttribute('class', 'seg-path');
      path.style.setProperty('--i', i);
      segG.appendChild(path);
      if (skeleton) continue;
      const item = items[i];
      const mid = (a0 + a1) / 2;
      const [lx, ly] = polar(c, c, (g.ringInner + g.ringOuter) / 2 + 2, mid);
      const label = document.createElement('div');
      label.className = 'seg-label' + (item.icon ? ' has-icon' : '');
      label.style.left = `${lx}px`;
      label.style.top = `${ly}px`;
      label.style.setProperty('--i', i);
      label.innerHTML = `${item.icon ? icon(item.icon, 22) : ''}<span>${esc(item.label)}</span>`;
      if (item.hint) label.title = item.hint;
      labels.appendChild(label);
    }
    centerMain.textContent = center;
    centerSub.textContent = sub;
  }

  /** Map a point (relative to the host) to a segment index, 'center', or null when outside. */
  function hitTest(x, y) {
    const dx = x - c;
    const dy = y - c;
    const r = Math.hypot(dx, dy);
    if (r <= g.ringInner - 4) return 'center';
    if (r > g.outer + 6 || !items.length) return null;
    let a = Math.atan2(dx, -dy); // 0 = up, clockwise
    const span = (Math.PI * 2) / items.length;
    a = (a + span / 2 + Math.PI * 4) % (Math.PI * 2);
    return Math.floor(a / span) % items.length;
  }

  function setActive(index) {
    if (index === active) return;
    active = typeof index === 'number' ? index : null;
    const paths = segG.children;
    const ls = labels.children;
    for (let i = 0; i < paths.length; i++) {
      paths[i].classList.toggle('active', i === active);
      ls[i]?.classList.toggle('active', i === active);
    }
    host.classList.toggle('center-hot', index === 'center');
  }

  return {
    render,
    hitTest,
    setActive,
    get active() {
      return active;
    },
    get items() {
      return items;
    },
  };
}
