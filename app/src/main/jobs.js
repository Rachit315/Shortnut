// Runs engine actions as jobs, streams progress to the toast and records history.
const { EventEmitter } = require('events');
const { shell } = require('electron');
const path = require('path');
const engine = require('./engine');
const store = require('./store');
const toast = require('./toast');

const events = new EventEmitter();
const jobs = new Map();
let seq = 0;
let pushTimer = null;

const publicJob = (j) => ({
  id: j.id,
  title: j.status === 'done' ? j.doneTitle || j.title : j.title,
  status: j.status,
  total: j.total,
  done: j.done,
  fraction: j.fraction,
  outputs: j.outputs,
  errors: j.errors,
  notes: j.notes,
  before: j.before,
  after: j.after,
  finishedAt: j.finishedAt || 0,
});

function push(anchor) {
  clearTimeout(pushTimer);
  pushTimer = null;
  const list = [...jobs.values()].slice(-3).map(publicJob);
  toast.update(list, anchor);
}

function schedulePush() {
  if (!pushTimer) pushTimer = setTimeout(() => push(), 50);
}

/** Record something done outside the engine (editor saves) so it shows in the toast and history. */
function recordInstant({ title, outputs, files, anchor, before, after }) {
  const job = { id: ++seq, title, status: 'done', total: 1, done: 1, fraction: 1, outputs, errors: [], notes: [], before, after, finishedAt: Date.now(), files };
  jobs.set(job.id, job);
  addHistory(job, 'editor');
  push(anchor);
  return job.id;
}

function addHistory(job, actionId) {
  store.history.add({
    id: `${Date.now()}-${job.id}`,
    time: Date.now(),
    title: job.status === 'done' ? job.doneTitle || job.title : job.title,
    action: actionId,
    inputs: job.files,
    outputs: job.outputs,
    errors: job.errors.map((e) => `${path.basename(e.file)}: ${e.message}`),
    status: job.status,
    before: job.before,
    after: job.after,
  });
  events.emit('history');
}

function start({ actionId, files, anchor }) {
  const settings = store.settings.get();
  const controller = new AbortController();
  const job = {
    id: ++seq,
    ...engine.describe(actionId, files.length),
    status: 'running',
    total: files.length,
    done: 0,
    fraction: 0,
    outputs: [],
    errors: [],
    notes: [],
    files,
    controller,
  };
  jobs.set(job.id, job);
  push(anchor);

  engine
    .run({
      actionId,
      files,
      settings,
      signal: controller.signal,
      onProgress: ({ done, fraction }) => {
        job.done = done;
        job.fraction = fraction;
        schedulePush();
      },
    })
    .then((r) => {
      Object.assign(job, r);
      job.status = controller.signal.aborted ? 'cancelled' : r.errors.length && !r.outputs.length ? 'error' : 'done';
      job.done = job.total;
      job.fraction = 1;
    })
    .catch((err) => {
      job.status = 'error';
      job.errors.push({ file: files[0], message: err.message || String(err) });
    })
    .finally(() => {
      job.finishedAt = Date.now();
      push();
      addHistory(job, actionId);
      if (job.status === 'done' && settings.revealAfter && job.outputs[0]) shell.showItemInFolder(job.outputs[0]);
      // Forget finished jobs after a while so the toast list stays short.
      setTimeout(() => jobs.delete(job.id), 15000);
    });
  return job.id;
}

function cancel(id) {
  const job = jobs.get(id);
  if (job && job.status === 'running') job.controller.abort();
}

function dismissFinished() {
  for (const [id, j] of jobs) if (j.status !== 'running') jobs.delete(id);
  if (![...jobs.values()].length) toast.hide();
}

const hasRunning = () => [...jobs.values()].some((j) => j.status === 'running');

module.exports = { start, cancel, recordInstant, dismissFinished, hasRunning, events };
