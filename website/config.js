// Site configuration — the only file you need to edit before deploying.
window.SHORTNUT = {
  // Public source repository (used for every GitHub link on the page).
  repo: 'https://github.com/Rachit315/Shortnut',

  // Where the installer is downloaded from. By default the page asks GitHub for the latest release of `repo` and links
  // its .exe directly; if no release is published yet, the buttons explain that instead of linking to a missing file.
  //  - Set `downloadUrl` to force one fixed installer URL.
  //  - Set `selfHosted: true` if you deploy website/downloads/ (written by `npm run dist` in /app) with the site.
  downloadUrl: null,
  selfHosted: false,
};
