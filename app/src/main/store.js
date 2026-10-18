// Tiny JSON persistence for settings and activity history (atomic writes, defaults merged on load).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  enabled: true,
  triggerKey: 'shift', // shift | ctrl | alt
  outputMode: 'beside', // beside | folder
  outputFolder: '',
  jpgQuality: 90,
  webpQuality: 88,
  avifQuality: 60,
  pdfDpi: 200,
  compressLevel: 'balanced', // light | balanced | strong
  keepMetadata: false,
  openAtLogin: true,
  explorerMenu: true,
  revealAfter: false,
  theme: 'system', // system | light | dark
  onboarded: false,
};

class JsonFile {
  constructor(name, defaults) {
    this.file = path.join(app.getPath('userData'), name);
    this.defaults = defaults;
    this.data = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(this.defaults)) return Array.isArray(raw) ? raw : [];
      return { ...this.defaults, ...raw };
    } catch {
      return Array.isArray(this.defaults) ? [] : { ...this.defaults };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] failed to save', this.file, err);
    }
  }
}

let settingsFile;
let historyFile;

function init() {
  settingsFile = new JsonFile('settings.json', DEFAULT_SETTINGS);
  historyFile = new JsonFile('history.json', []);
}

const settings = {
  get: () => ({ ...settingsFile.data }),
  value: (key) => settingsFile.data[key],
  set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (k in DEFAULT_SETTINGS) settingsFile.data[k] = v;
    }
    settingsFile.save();
    return settings.get();
  },
  defaults: DEFAULT_SETTINGS,
};

const MAX_HISTORY = 300;
const history = {
  list: () => historyFile.data.slice(),
  add(entry) {
    historyFile.data.unshift(entry);
    historyFile.data.length = Math.min(historyFile.data.length, MAX_HISTORY);
    historyFile.save();
  },
  clear() {
    historyFile.data = [];
    historyFile.save();
  },
};

module.exports = { init, settings, history, DEFAULT_SETTINGS };
