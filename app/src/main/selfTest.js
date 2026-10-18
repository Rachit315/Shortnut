// `Shortnut.exe --self-test <report.json>`: exercises every native dependency from the installed
// layout (sharp, ffmpeg, pdf.js worker, koffi) and writes a JSON report. Used to verify release builds.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = async function selfTest(reportPath) {
  const engine = require('./engine');
  const { DEFAULT_SETTINGS } = require('./store');
  const media = require('./engine/media');
  const watcher = require('./dragWatcher');
  const sharp = require('sharp');
  const { PDFDocument, StandardFonts } = require('pdf-lib');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortnut-selftest-'));
  const settings = { ...DEFAULT_SETTINGS };
  const checks = [];
  const check = async (name, fn) => {
    try {
      checks.push({ name, ok: true, detail: await fn() });
    } catch (err) {
      checks.push({ name, ok: false, detail: err.message });
    }
  };

  const png = path.join(dir, 'test.png');
  await sharp({ create: { width: 320, height: 200, channels: 4, background: '#ff6a3d' } }).png().toFile(png);
  const pdfFile = path.join(dir, 'test.pdf');
  const doc = await PDFDocument.create();
  doc.addPage().drawText('Shortnut self test', { x: 50, y: 700, size: 24, font: await doc.embedFont(StandardFonts.Helvetica) });
  fs.writeFileSync(pdfFile, await doc.save());
  const wav = path.join(dir, 'test.wav');

  await check('koffi / key watcher', () => {
    watcher.start();
    const ok = watcher.running;
    watcher.stop();
    if (!ok) throw new Error('watcher did not start');
    return 'running';
  });
  await check('ffmpeg binary', () => {
    const r = spawnSync(media.ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=duration=1', wav], { windowsHide: true });
    if (r.status !== 0) throw new Error(String(r.stderr).slice(-200));
    return media.ffmpegPath();
  });
  for (const [name, actionId, file] of [
    ['image → JPG (sharp)', 'to:jpg', png],
    ['image → BMP', 'to:bmp', png],
    ['image → PDF', 'to:pdf', png],
    ['PDF → PNG (pdf.js worker)', 'to:png', pdfFile],
    ['PDF → TXT', 'to:txt', pdfFile],
    ['PDF → DOCX (docx)', 'to:docx', pdfFile],
    ['PDF compress', 'tool:compress', pdfFile],
    ['WAV → MP3 (ffmpeg)', 'to:mp3', wav],
  ]) {
    await check(name, async () => {
      const r = await engine.run({ actionId, files: [file], settings });
      if (r.errors.length) throw new Error(r.errors[0].message);
      return r.outputs.map((o) => path.basename(o)).join(', ') || r.notes.join(', ');
    });
  }
  await check('TXT → PDF (print engine)', async () => {
    const txt = path.join(dir, 'note.txt');
    fs.writeFileSync(txt, 'hello');
    const r = await engine.run({ actionId: 'to:pdf', files: [txt], settings });
    if (r.errors.length) throw new Error(r.errors[0].message);
    return path.basename(r.outputs[0]);
  });

  const report = { ok: checks.every((c) => c.ok), packaged: require('electron').app.isPackaged, checks };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
  return report.ok;
};
