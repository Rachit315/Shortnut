// PDF conversions and tools. Rendering/text extraction via pdf.js (hidden renderer), structure edits via pdf-lib.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sharp = require('sharp');
const { PDFDocument, PDFName, PDFRawStream, PDFNumber, degrees } = require('pdf-lib');
const worker = require('./worker');
const { outputFor, folderFor } = require('./output');

const loadDoc = (file) => PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true, updateMetadata: false });

async function withPdfJs(file, fn) {
  const { id, numPages } = await worker.pdf.open(new Uint8Array(fs.readFileSync(file)));
  try {
    return await fn(id, numPages);
  } finally {
    worker.pdf.close(id).catch(() => {});
  }
}

const pad = (n, width) => String(n).padStart(Math.max(3, width), '0');

/** Render every page to an image. One page -> "Name.jpg"; more -> folder "Name (JPG)/Page 001.jpg". */
async function toImages(file, format, settings, onProgress) {
  const scale = (settings.pdfDpi || 200) / 72;
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const quality = (settings.jpgQuality || 90) / 100;
  return withPdfJs(file, async (id, numPages) => {
    const outputs = [];
    const dir = numPages > 1 ? folderFor(file, format.toUpperCase()) : null;
    for (let p = 1; p <= numPages; p++) {
      const bytes = await worker.pdf.render(id, p, scale, mime, quality);
      const out = dir
        ? path.join(dir, `Page ${pad(p, String(numPages).length)}.${format}`)
        : outputFor(file, format);
      fs.writeFileSync(out, Buffer.from(bytes));
      outputs.push(out);
      onProgress?.(p / numPages);
    }
    return dir ? [dir] : outputs;
  });
}

async function extractText(file) {
  return withPdfJs(file, (id) => worker.pdf.text(id));
}

async function toTxt(file) {
  const pages = await extractText(file);
  return pages.map((t) => t.trim()).join('\n\n\f\n\n').trim() + '\n';
}

async function toDocx(file) {
  const { Document, Packer, Paragraph, TextRun, PageBreak } = require('docx');
  const pages = await extractText(file);
  const children = [];
  pages.forEach((text, i) => {
    const paras = text.split(/\n{2,}/);
    for (const para of paras) {
      const lines = para.split('\n');
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: lines.flatMap((line, j) => (j === 0 ? [new TextRun(line)] : [new TextRun({ text: line, break: 1 })])),
        })
      );
    }
    if (i < pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
  });
  const doc = new Document({
    creator: 'Shortnut',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

async function toHtml(file) {
  const pages = await extractText(file);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const body = pages
    .map((t, i) => `<section class="page"><h2>Page ${i + 1}</h2>${t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n')}</section>`)
    .join('\n');
  const title = esc(path.basename(file, '.pdf'));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#222}.page{border-bottom:1px solid #ddd;padding-bottom:24px;margin-bottom:24px}h2{font-size:13px;color:#999;text-transform:uppercase;letter-spacing:.08em}</style></head><body>${body}</body></html>`;
}

/* ---------- tools ---------- */

async function rotate(file) {
  const doc = await loadDoc(file);
  for (const page of doc.getPages()) page.setRotation(degrees((page.getRotation().angle + 90) % 360));
  return Buffer.from(await doc.save());
}

async function merge(files) {
  const out = await PDFDocument.create();
  out.setProducer('Shortnut');
  for (const f of files) {
    const src = await loadDoc(f);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return Buffer.from(await out.save());
}

async function split(file, onProgress) {
  const src = await loadDoc(file);
  const n = src.getPageCount();
  const dir = folderFor(file, 'Split');
  for (let i = 0; i < n; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    fs.writeFileSync(path.join(dir, `Page ${pad(i + 1, String(n).length)}.pdf`), await doc.save());
    onProgress?.((i + 1) / n);
  }
  return [dir];
}

/**
 * Compress while keeping text selectable: recompress embedded raster images (JPEG and 8-bit Flate RGB/Gray),
 * downscaling oversized ones, then save with object streams. "strong" additionally rasterises pages
 * when that is smaller (useful for scans).
 */
async function compress(file, settings, onProgress) {
  const level = settings.compressLevel || 'balanced';
  const cfg = { light: { q: 80, max: 2400 }, balanced: { q: 65, max: 1800 }, strong: { q: 50, max: 1400 } }[level];
  const original = fs.readFileSync(file);
  const doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const objects = ctx.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream);
  let i = 0;
  for (const [ref, stream] of objects) {
    i++;
    onProgress?.(0.8 * (i / objects.length));
    const dict = stream.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    try {
      const replacement = await recompressImage(stream, cfg);
      if (replacement) ctx.assign(ref, replacement);
    } catch {
      /* leave this image untouched */
    }
  }
  let best = Buffer.from(await doc.save({ useObjectStreams: true }));

  if (level === 'strong') {
    try {
      const raster = await rasterize(file, cfg, (p) => onProgress?.(0.8 + 0.2 * p));
      if (raster.length < best.length) best = raster;
    } catch {
      /* keep the structural result */
    }
  }
  onProgress?.(1);
  return best;
}

async function recompressImage(stream, cfg) {
  const dict = stream.dict;
  const filter = dict.get(PDFName.of('Filter'));
  const filterName = filter && filter.asArray ? (filter.asArray().length === 1 ? filter.asArray()[0] : null) : filter;
  const width = dict.get(PDFName.of('Width'))?.asNumber?.();
  const height = dict.get(PDFName.of('Height'))?.asNumber?.();
  const bpc = dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.();
  if (!width || !height || dict.get(PDFName.of('ImageMask')) || dict.get(PDFName.of('Decode'))) return null;
  if (width * height < 160 * 160) return null;

  let img;
  const original = stream.contents;
  if (filterName === PDFName.of('DCTDecode')) {
    img = sharp(Buffer.from(original), { failOn: 'none' });
    const meta = await img.metadata();
    if (meta.channels === 4 || meta.space === 'cmyk') return null; // CMYK JPEGs: leave as-is
  } else if (filterName === PDFName.of('FlateDecode') && bpc === 8 && !dict.get(PDFName.of('DecodeParms'))) {
    const cs = dict.get(PDFName.of('ColorSpace'));
    const channels = cs === PDFName.of('DeviceRGB') ? 3 : cs === PDFName.of('DeviceGray') ? 1 : 0;
    if (!channels) return null;
    const raw = zlib.inflateSync(Buffer.from(original));
    if (raw.length !== width * height * channels) return null;
    img = sharp(raw, { raw: { width, height, channels } });
  } else {
    return null;
  }

  const scale = Math.min(1, cfg.max / Math.max(width, height));
  const nw = Math.max(1, Math.round(width * scale));
  const nh = Math.max(1, Math.round(height * scale));
  if (scale < 1) img = img.resize(nw, nh);
  const isGray = dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceGray');
  if (isGray) img = img.grayscale();
  const jpeg = await img.jpeg({ quality: cfg.q, mozjpeg: true }).toBuffer();
  if (jpeg.length >= original.length * 0.9) return null;

  const newDict = dict.clone(stream.dict.context);
  newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
  newDict.set(PDFName.of('Width'), PDFNumber.of(nw));
  newDict.set(PDFName.of('Height'), PDFNumber.of(nh));
  newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
  newDict.set(PDFName.of('ColorSpace'), PDFName.of(isGray ? 'DeviceGray' : 'DeviceRGB'));
  newDict.delete(PDFName.of('DecodeParms'));
  newDict.set(PDFName.of('Length'), PDFNumber.of(jpeg.length));
  return PDFRawStream.of(newDict, new Uint8Array(jpeg));
}

/** Re-create the PDF from page images (loses selectable text). */
async function rasterize(file, cfg, onProgress) {
  return withPdfJs(file, async (id, numPages) => {
    const src = await loadDoc(file);
    const out = await PDFDocument.create();
    for (let p = 1; p <= numPages; p++) {
      const bytes = await worker.pdf.render(id, p, 150 / 72, 'image/jpeg', cfg.q / 100);
      const jpg = await out.embedJpg(bytes);
      const { width, height } = src.getPage(p - 1).getSize();
      const page = out.addPage([width, height]);
      page.drawImage(jpg, { x: 0, y: 0, width, height });
      onProgress?.(p / numPages);
    }
    return Buffer.from(await out.save({ useObjectStreams: true }));
  });
}

/** Extract embedded images is approximated by rendering each page to PNG into a folder. */
async function extractPages(file, settings, onProgress) {
  const scale = (settings.pdfDpi || 200) / 72;
  return withPdfJs(file, async (id, numPages) => {
    const dir = folderFor(file, 'Pages');
    for (let p = 1; p <= numPages; p++) {
      const bytes = await worker.pdf.render(id, p, scale, 'image/png', 1);
      fs.writeFileSync(path.join(dir, `Page ${pad(p, String(numPages).length)}.png`), Buffer.from(bytes));
      onProgress?.(p / numPages);
    }
    return [dir];
  });
}

async function readMetadata(file) {
  const doc = await loadDoc(file);
  const stat = fs.statSync(file);
  return {
    file: { size: stat.size, pages: doc.getPageCount(), modified: stat.mtime.toISOString() },
    fields: {
      title: doc.getTitle() || '',
      author: doc.getAuthor() || '',
      subject: doc.getSubject() || '',
      keywords: doc.getKeywords() || '',
      creator: doc.getCreator() || '',
      producer: doc.getProducer() || '',
    },
    dates: {
      created: doc.getCreationDate()?.toISOString() || '',
      modified: doc.getModificationDate()?.toISOString() || '',
    },
  };
}

/** Write new metadata. `strip` clears every info field and the XMP stream. */
async function writeMetadata(file, fields, strip) {
  const doc = await loadDoc(file);
  if (strip) {
    doc.catalog.delete(PDFName.of('Metadata'));
    const infoRef = doc.context.trailerInfo.Info;
    if (infoRef) doc.context.delete(infoRef);
    doc.context.trailerInfo.Info = undefined;
    return Buffer.from(await doc.save({ updateFieldAppearances: false }));
  }
  doc.setTitle(fields.title || '');
  doc.setAuthor(fields.author || '');
  doc.setSubject(fields.subject || '');
  doc.setKeywords((fields.keywords || '').split(/[,;]\s*/).filter(Boolean));
  doc.setCreator(fields.creator || '');
  doc.setProducer(fields.producer || '');
  doc.setModificationDate(new Date());
  return Buffer.from(await doc.save());
}

module.exports = { toImages, toTxt, toDocx, toHtml, rotate, merge, split, compress, extractPages, readMetadata, writeMetadata, extractText };
