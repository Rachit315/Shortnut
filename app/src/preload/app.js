// Shared preload for every Shortnut UI window. Exposes a small, whitelisted API.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set([
  'app:getState', 'app:quit', 'settings:get', 'settings:set', 'history:list', 'history:clear',
  'menu:forDrag', 'menu:forPaths', 'formats:catalog',
  'overlay:drop', 'overlay:pick', 'overlay:close', 'wheel:openForPaths',
  'dialog:openFiles', 'dialog:chooseFolder',
  'job:cancel', 'toast:resize', 'toast:dismiss',
  'shell:reveal', 'shell:open', 'shell:external',
  'editor:init', 'editor:save', 'editor:strip', 'editor:writePdfMeta', 'editor:close', 'editor:pickImage',
  'sample:path',
]);

const EVENTS = new Set([
  'overlay:open', 'overlay:toggle', 'overlay:hide', 'toast:update',
  'settings:changed', 'history:changed', 'state:changed', 'nav',
]);

contextBridge.exposeInMainWorld('shortnut', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`Blocked channel ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, cb) {
    if (!EVENTS.has(channel)) throw new Error(`Blocked channel ${channel}`);
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  startSampleDrag: () => ipcRenderer.send('sample:startDrag'),
});
