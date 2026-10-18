// Serves src/renderer over app://shortnut/... so pages get a real origin (ES modules, fetch, workers)
// without exposing the rest of the filesystem.
const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', 'renderer');

function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

function handle() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

module.exports = { registerScheme, handle };
