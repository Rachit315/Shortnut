// Progress cards for running jobs. Auto-hides a few seconds after everything finished (unless hovered).
import { icon, formatBytes, esc } from '../shared/icons.js';

const api = window.shortnut;
const list = document.getElementById('list');
let jobs = [];
let hideTimer = null;
let hovering = false;

const basename = (p) => p.split(/[\\/]/).pop();

function subline(j) {
  if (j.status === 'running') {
    return `${j.done} of ${j.total} saved`;
  }
  if (j.status === 'cancelled') return 'Cancelled';
  const saved = j.outputs.length;
  const parts = [];
  if (j.errors.length) {
    parts.push(`<span class="status-icon bad">${icon('x', 11)}</span><span class="err" title="${esc(j.errors.map((e) => `${basename(e.file)}: ${e.message}`).join('\n'))}">${esc(j.errors.length === 1 ? j.errors[0].message : `${j.errors.length} files failed`)}</span>`);
  }
  if (saved) {
    parts.push(`<span class="status-icon">${icon('check', 11)}</span><span>${saved === 1 ? esc(basename(j.outputs[0])) : `${saved} saved`}</span>`);
  } else if (j.notes.length && !j.errors.length) {
    parts.push(`<span class="status-icon">${icon('check', 11)}</span><span>${esc(j.notes[0].split(': ').pop())}</span>`);
  }
  if (j.before && j.after && j.after < j.before) {
    const pct = Math.round((1 - j.after / j.before) * 100);
    parts.push(`<span class="saving">${formatBytes(j.before)} → ${formatBytes(j.after)} (−${pct}%)</span>`);
  }
  return parts.join('');
}

function render() {
  list.innerHTML = jobs
    .map((j) => {
      const running = j.status === 'running';
      const pct = Math.round((j.fraction || 0) * 100);
      const indeterminate = running && pct === 0;
      return `<div class="card ${j.status}" data-id="${j.id}">
        <button class="close" data-act="${running ? 'cancel' : 'dismiss'}" title="${running ? 'Cancel' : 'Dismiss'}">${icon('x', 12)}</button>
        <div class="title">${esc(j.status === 'error' ? `${j.title} failed` : j.title)}</div>
        <div class="sub">${subline(j)}</div>
        ${running ? `<div class="bar"><i class="${indeterminate ? 'indeterminate' : ''}" style="width:${pct}%"></i></div>` : ''}
        ${!running && j.outputs.length ? `<div class="actions"><button class="link" data-act="reveal">${icon('folder', 13)} Show in folder</button>${j.outputs.length === 1 ? `<button class="link" data-act="open">${icon('external', 13)} Open</button>` : ''}</div>` : ''}
      </div>`;
    })
    .join('');
  requestAnimationFrame(() => api.invoke('toast:resize', list.offsetHeight));
  scheduleHide();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  if (hovering || !jobs.length || jobs.some((j) => j.status === 'running')) return;
  const hasError = jobs.some((j) => j.errors?.length);
  hideTimer = setTimeout(() => {
    document.querySelectorAll('.card').forEach((c) => c.classList.add('leaving'));
    setTimeout(() => {
      jobs = [];
      list.innerHTML = '';
      api.invoke('toast:dismiss');
    }, 200);
  }, hasError ? 8000 : 4500);
}

list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.closest('.card').dataset.id);
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  switch (btn.dataset.act) {
    case 'cancel':
      api.invoke('job:cancel', id);
      break;
    case 'dismiss':
      jobs = jobs.filter((j) => j.id !== id);
      if (!jobs.length) api.invoke('toast:dismiss');
      else render();
      break;
    case 'reveal':
      api.invoke('shell:reveal', job.outputs[0]);
      break;
    case 'open':
      api.invoke('shell:open', job.outputs[0]);
      break;
  }
});

document.addEventListener('mouseenter', () => {
  hovering = true;
  clearTimeout(hideTimer);
});
document.addEventListener('mouseleave', () => {
  hovering = false;
  scheduleHide();
});

api.on('toast:update', (next) => {
  jobs = next;
  render();
});
