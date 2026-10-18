const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  onRequest(handler) {
    ipcRenderer.on('worker:req', async (_e, { id, method, args }) => {
      try {
        const result = await handler(method, args);
        ipcRenderer.send('worker:res', { id, result });
      } catch (err) {
        ipcRenderer.send('worker:res', { id, error: (err && err.message) || String(err) });
      }
    });
    ipcRenderer.send('worker:ready');
  },
});
