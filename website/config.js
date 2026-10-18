// Site configuration — the only file you need to edit before deploying.
window.SHORTNUT = {
  // Public source repository (used for every GitHub link on the page).
  repo: 'https://github.com/shortnut/shortnut',

  // Where the installer is downloaded from.
  //  - "release.json" (default): served from this site's /downloads folder. `npm run dist` in /app copies the
  //    installer there and writes release.json with version, size and SHA-256.
  //  - Or set `downloadUrl` to a fixed URL such as GitHub Releases:
  //    'https://github.com/shortnut/shortnut/releases/latest/download/Shortnut-Setup.exe'
  downloadUrl: null,
};
