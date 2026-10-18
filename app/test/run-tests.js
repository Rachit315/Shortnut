// End-to-end engine test: generates fixtures of every supported kind, runs every wheel action
// on them, and validates the outputs. Run with `npm test` (executes inside Electron).
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const protocol = require('../src/main/protocol');

protocol.registerScheme();
app.disableHardwareAcceleration();

const results = [];
const ok = (name, detail = '') => results.push({ name, pass: true, detail });
const fail = (name, detail) => results.push({ name, pass: false, detail });

async function makeFixtures(dir) {
  const sharp = require('sharp');
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const docx = require('docx');
  const { ffmpegPath } = require('../src/main/engine/media');
  const image = require('../src/main/engine/image');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff5f2e"/><stop offset="1" stop-color="#ffc83d"/></linearGradient></defs><rect width="640" height="420" rx="40" fill="url(#g)"/><circle cx="320" cy="210" r="120" fill="#fff" opacity=".8"/><text x="320" y="225" font-size="48" text-anchor="middle" font-family="Arial">Shortnut</text></svg>`;
  fs.writeFileSync(path.join(dir, 'vector.svg'), svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'photo.png'), png);
  await sharp(png).flatten({ background: '#fff' }).jpeg({ quality: 95 }).withExif({ IFD0: { Make: 'ShortnutCam', Model: 'Test 1', Software: 'fixture' } }).toFile(path.join(dir, 'camera.jpg'));
  await sharp(png).webp().toFile(path.join(dir, 'web.webp'));
  await sharp(png).gif().toFile(path.join(dir, 'anim.gif'));
  fs.writeFileSync(path.join(dir, 'paint.bmp'), await image.encode(sharp(png), 'bmp'));
  fs.writeFileSync(path.join(dir, 'icon.ico'), await image.encodeIco(sharp(png)));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const jpg = await pdf.embedJpg(await sharp(png).resize(1600).flatten({ background: '#fff' }).jpeg({ quality: 98 }).toBuffer());
  for (let i = 1; i <= 3; i++) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`Shortnut test document — page ${i}`, { x: 60, y: 720, size: 20, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('The quick brown fox jumps over the lazy dog.', { x: 60, y: 690, size: 12, font });
    page.drawImage(jpg, { x: 60, y: 260, width: 480, height: 315 });
  }
  pdf.setTitle('Fixture PDF');
  pdf.setAuthor('Test Author');
  fs.writeFileSync(path.join(dir, 'report.pdf'), await pdf.save());

  const d = new docx.Document({
    sections: [{ children: [
      new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun('Quarterly notes')] }),
      new docx.Paragraph({ children: [new docx.TextRun({ text: 'Bold point. ', bold: true }), new docx.TextRun('Regular text for the converter.')] }),
    ] }],
  });
  fs.writeFileSync(path.join(dir, 'notes.docx'), await docx.Packer.toBuffer(d));

  fs.writeFileSync(path.join(dir, 'readme.md'), '# Title\n\nSome **bold** and *italic* text with `code` and a [link](https://example.com).\n\n- one\n- two\n  1. nested\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```\n');
  fs.writeFileSync(path.join(dir, 'plain.txt'), 'Line one\nLine two <with> & special chars\n');
  fs.writeFileSync(path.join(dir, 'page.html'), '<!doctype html><html><body><h1>Hello</h1><p>World paragraph.</p><script>document.body.innerHTML="hacked"</script></body></html>');
  fs.writeFileSync(path.join(dir, 'table.csv'), 'name,age,city\n"Smith, J",42,Paris\nLee,7,"Says ""hi"""\n');
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify([{ a: 1, b: { c: 'x' } }, { a: 2, d: [1, 2] }]));

  const ff = ffmpegPath();
  spawnSync(ff, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'clip.mp4')], { windowsHide: true });
  spawnSync(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', path.join(dir, 'tone.wav')], { windowsHide: true });
}

async function validate(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    const items = fs.readdirSync(file);
    if (!items.length) throw new Error('empty folder');
    for (const i of items) await validate(path.join(file, i));
    return `${items.length} files`;
  }
  if (stat.size === 0) throw new Error('empty file');
  const sharp = require('sharp');
  if (['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'].includes(ext)) {
    const m = await sharp(file).metadata();
    return `${m.width}x${m.height} ${m.format}`;
  }
  if (ext === 'pdf') {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
    return `${doc.getPageCount()} pages`;
  }
  if (ext === 'bmp' && fs.readFileSync(file).subarray(0, 2).toString() !== 'BM') throw new Error('bad BMP header');
  if (ext === 'ico' && fs.readFileSync(file).readUInt16LE(2) !== 1) throw new Error('bad ICO header');
  if (ext === 'docx' && fs.readFileSync(file).subarray(0, 2).toString() !== 'PK') throw new Error('bad DOCX');
  if (ext === 'json') JSON.parse(fs.readFileSync(file, 'utf8'));
  return `${stat.size} bytes`;
}

async function main() {
  require('../src/main/protocol').handle();
  const engine = require('../src/main/engine');
  const { DEFAULT_SETTINGS } = require('../src/main/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortnut-test-'));
  console.log('Fixtures in', dir);
  await makeFixtures(dir);
  const settings = { ...DEFAULT_SETTINGS };
  const fixtures = fs.readdirSync(dir).map((f) => path.join(dir, f));

  for (const file of fixtures) {
    const ext = engine.formats.extOf(file);
    const menu = engine.formats.menuFor([ext]);
    const actions = [...menu.convert, ...menu.tools.filter((t) => !t.editor)];
    for (const action of actions) {
      const name = `${path.basename(file)} → ${action.id}`;
      const t0 = Date.now();
      try {
        const r = await engine.run({ actionId: action.id, files: [file], settings });
        if (r.errors.length) throw new Error(r.errors[0].message);
        if (!r.outputs.length && !r.notes.length) throw new Error('no output');
        const details = [];
        for (const o of r.outputs) details.push(await validate(o));
        ok(name, `${details.join(', ') || r.notes.join(', ')} (${Date.now() - t0} ms)`);
      } catch (err) {
        fail(name, err.message);
      }
    }
  }

  // Batch actions
  const batch = async (name, actionId, files) => {
    try {
      const r = await engine.run({ actionId, files, settings });
      if (r.errors.length || !r.outputs.length) throw new Error(r.errors[0]?.message || 'no output');
      ok(name, await validate(r.outputs[0]));
    } catch (err) {
      fail(name, err.message);
    }
  };
  await batch('3 images → one PDF', 'to:pdf', ['photo.png', 'camera.jpg', 'web.webp'].map((f) => path.join(dir, f)));
  const second = path.join(dir, 'report.pdf');
  await batch('merge 2 PDFs', 'tool:merge', [second, second]);

  // Editor-backed helpers
  try {
    const meta = await engine.image.readMetadata(path.join(dir, 'camera.jpg'));
    if (meta.exif.Make !== 'ShortnutCam') throw new Error('EXIF Make not read: ' + JSON.stringify(meta.exif));
    const { buffer } = await engine.image.stripMetadata(path.join(dir, 'camera.jpg'), settings);
    const exif = await require('exifr').parse(buffer).catch(() => null);
    if (exif && exif.Make) throw new Error('metadata not stripped');
    ok('image metadata read + strip');
  } catch (err) {
    fail('image metadata read + strip', err.message);
  }
  try {
    const m = await engine.pdf.readMetadata(second);
    if (m.fields.author !== 'Test Author') throw new Error('author not read');
    const stripped = await engine.pdf.writeMetadata(second, {}, true);
    fs.writeFileSync(path.join(dir, 'stripped.pdf'), stripped);
    const m2 = await engine.pdf.readMetadata(path.join(dir, 'stripped.pdf'));
    if (m2.fields.author) throw new Error('author survived strip');
    const edited = await engine.pdf.writeMetadata(second, { title: 'New', author: 'Me' }, false);
    fs.writeFileSync(path.join(dir, 'edited.pdf'), edited);
    if ((await engine.pdf.readMetadata(path.join(dir, 'edited.pdf'))).fields.author !== 'Me') throw new Error('edit failed');
    ok('pdf metadata read/strip/edit');
  } catch (err) {
    fail('pdf metadata read/strip/edit', err.message);
  }
  try {
    const txt = fs.readFileSync(fs.readdirSync(dir).map((f) => path.join(dir, f)).find((f) => /report\.txt$/.test(f)), 'utf8');
    if (!/page 1/.test(txt) || !/quick brown fox/.test(txt)) throw new Error('text missing: ' + txt.slice(0, 80));
    const html = fs.readFileSync(path.join(dir, 'page.txt'), 'utf8');
    if (/hacked/.test(html) || !/World paragraph/.test(html)) throw new Error('html text wrong: ' + html);
    ok('extracted text content is correct');
  } catch (err) {
    fail('extracted text content is correct', err.message);
  }

  const passed = results.filter((r) => r.pass).length;
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
  console.log(`\n${passed}/${results.length} passed`);
  require('../src/main/engine/worker').destroy();
  app.exit(passed === results.length ? 0 : 1);
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error(err);
    app.exit(1);
  })
);
