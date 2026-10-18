// Renders the logo SVG into every icon the app, installer and website need.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { encodeIco } = require('../src/main/engine/image');

const root = path.join(__dirname, '..');
const logo = fs.readFileSync(path.join(root, 'src', 'renderer', 'shared', 'logo.svg'));
const website = path.join(root, '..', 'website', 'assets');

const png = (size) => sharp(logo, { density: Math.max(72, (size / 512) * 72 * 4) }).resize(size, size).png();

(async () => {
  for (const dir of ['build', 'assets']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  const big = await png(1024).toBuffer();
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), await encodeIco(sharp(big)));
  await png(512).toFile(path.join(root, 'assets', 'icon.png'));
  await png(256).toFile(path.join(root, 'build', 'icon.png'));
  await png(16).toFile(path.join(root, 'assets', 'tray.png'));
  await png(32).toFile(path.join(root, 'assets', 'tray@2x.png'));
  await png(24).toFile(path.join(root, 'assets', 'tray@1.5x.png'));

  if (fs.existsSync(path.dirname(website))) {
    fs.mkdirSync(website, { recursive: true });
    fs.copyFileSync(path.join(root, 'src', 'renderer', 'shared', 'logo.svg'), path.join(website, 'logo.svg'));
    fs.writeFileSync(path.join(website, 'favicon.ico'), await encodeIco(sharp(big), [64, 48, 32, 16]));
    await png(180).toFile(path.join(website, 'apple-touch-icon.png'));
    await png(512).toFile(path.join(website, 'icon-512.png'));

    // Social preview card (1200×630)
    const logoInline = logo.toString().replace('<svg ', '<svg x="96" y="96" width="120" height="120" ');
    const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs>
        <radialGradient id="a" cx="0.85" cy="0.2" r="0.8"><stop offset="0" stop-color="#ff7a3d" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>
        <radialGradient id="b" cx="1" cy="1" r="0.7"><stop offset="0" stop-color="#7b4ab8" stop-opacity=".35"/><stop offset="1" stop-color="#7b4ab8" stop-opacity="0"/></radialGradient>
        <linearGradient id="k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff453a"/><stop offset=".55" stop-color="#ff7a38"/><stop offset="1" stop-color="#ffc14a"/></linearGradient>
      </defs>
      <rect width="1200" height="630" fill="#fff8f2"/><rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/>
      ${logoInline}
      <text x="236" y="178" font-family="Segoe UI, Arial" font-weight="700" font-size="54" fill="#1d130e">Shortnut</text>
      <text x="96" y="330" font-family="Segoe UI, Arial" font-weight="800" font-size="84" fill="#1d130e">Convert files with</text>
      <text x="96" y="430" font-family="Segoe UI, Arial" font-weight="800" font-size="84" fill="#1d130e">just drag +</text>
      <rect x="560" y="352" width="290" height="104" rx="20" fill="url(#k)"/>
      <text x="705" y="430" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="72" fill="#fff">⇧ Shift</text>
      <text x="96" y="540" font-family="Segoe UI, Arial" font-weight="600" font-size="30" fill="#5f4e45">Free &amp; open source for Windows · 100% offline</text>
    </svg>`;
    await sharp(Buffer.from(og)).png().toFile(path.join(website, 'og.png'));
  }
  console.log('[icons] generated');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
