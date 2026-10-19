// Site configuration — the only file you need to edit before deploying.
window.SHORTNUT = {
  // Public source repository (used for every GitHub link on the page).
  repo: 'https://github.com/Rachit315/Shortnut',

  // Where every Download button points. Default: the newest GitHub release's Shortnut-Setup.exe
  // (https://github.com/<repo>/releases/latest/download/Shortnut-Setup.exe), uploaded by .github/workflows/release.yml.
  //  - Set `downloadUrl` to use a different installer URL.
  //  - Set `selfHosted: true` if you deploy website/downloads/ (written by `npm run dist` in /app) with the site.
  downloadUrl: null,
  selfHosted: false,
};
