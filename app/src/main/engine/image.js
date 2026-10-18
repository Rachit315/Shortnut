// Image conversion, compression and encoding (sharp + small hand-written BMP/ICO encoders).
const fs = require('fs');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const worker = require('./worker');
const { extOf, canonical } = require('./formats');

sharp.cache(false); // don't hold file handles open on Windows

const ANIMATED = new Set(['gif', 'webp']);

/**
 * Open any supported image as a sharp pipeline.
 * HEIC/HEIF is decoded with libheif (wasm), BMP/ICO through Chromium.
 */
async function load(file, { animated = false } = {}) {
  const ext = canonical(extOf(file));
  if (ext === 'heic') {
    const decode = require('heic-decode');
    const { width, height, data } = await decode({ buffer: fs.readFileSync(file) });
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
  }
  if (ext === 'bmp' || ext === 'ico') {
    const mime = ext === 'bmp' ? 'image/bmp' : 'image/x-icon';
    const { width, height, data } = await worker.decodeImage(new Uint8Array(fs.readFileSync(file)), mime);
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
  }
  const opts = { failOn: 'none', limitInputPixels: 0 };
  if (ext === 'svg') opts.density = 300;
  if (animated && ANIMATED.has(ext)) opts.animated = true;
  return sharp(file, opts).rotate(); // honour EXIF orientation
}

function applyMetadata(img, keepMetadata) {
  return keepMetadata ? img.keepMetadata() : img;
}

/** Encode a sharp pipeline into the requested format. Returns a Buffer. */
async function encode(img, format, q = {}) {
  switch (format) {
    case 'jpg':
      return img.flatten({ background: '#ffffff' }).jpeg({ quality: q.jpg ?? 90, mozjpeg: true }).toBuffer();
    case 'png':
      return q.palette
        ? img.png({ palette: true, quality: q.pngQuality ?? 80, effort: 10, compressionLevel: 9 }).toBuffer()
        : img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    case 'webp':
      return img.webp({ quality: q.webp ?? 88, effort: 5 }).toBuffer();
    case 'avif':
      return img.avif({ quality: q.avif ?? 60, effort: 4 }).toBuffer();
    case 'gif':
      return img.gif({ effort: 8 }).toBuffer();
    case 'tiff':
      return img.tiff({ compression: 'lzw' }).toBuffer();
    case 'bmp':
      return encodeBmp(img);
    case 'ico':
      return encodeIco(img);
    default:
      throw new Error(`Unsupported image format: ${format}`);
  }
}

/** 24-bit uncompressed BMP (alpha flattened onto white). */
async function encodeBmp(img) {
  const { data, info } = await img.flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buf = Buffer.alloc(54 + pixelBytes);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(54 + pixelBytes, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38); // 72 DPI
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 3;
    const dst = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const s = src + x * 3;
      const d = dst + x * 3;
      buf[d] = data[s + 2];
      buf[d + 1] = data[s + 1];
      buf[d + 2] = data[s];
    }
  }
  return buf;
}

/** Multi-resolution Windows icon with PNG-compressed entries (Vista+). */
async function encodeIco(img, sizes = [256, 128, 64, 48, 32, 16]) {
  const base = await img.png().toBuffer();
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(base).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    )
  );
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    header[e] = s >= 256 ? 0 : s;
    header[e + 1] = s >= 256 ? 0 : s;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([header, ...pngs]);
}

/** Add an image as a page to a pdf-lib document (page size = pixel size at 96 DPI). */
async function addImagePage(doc, file) {
  const img = await load(file);
  const meta = await img.clone().metadata();
  const hasAlpha = meta.hasAlpha || meta.channels === 4;
  const bytes = hasAlpha ? await img.png().toBuffer() : await img.jpeg({ quality: 92 }).toBuffer();
  const embedded = hasAlpha ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const w = embedded.width * 0.75;
  const h = embedded.height * 0.75;
  const page = doc.addPage([w, h]);
  page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
}

async function imagesToPdf(files) {
  const doc = await PDFDocument.create();
  doc.setProducer('Shortnut');
  doc.setCreator('Shortnut');
  for (const f of files) await addImagePage(doc, f);
  return Buffer.from(await doc.save());
}

/** Convert one image file to `format`. */
async function convert(file, format, s) {
  const animated = ANIMATED.has(format);
  const img = applyMetadata(await load(file, { animated }), s.keepMetadata);
  return encode(img, format, { jpg: s.jpgQuality, webp: s.webpQuality, avif: s.avifQuality });
}

const COMPRESS_PRESETS = {
  light: { jpg: 85, webp: 82, avif: 55, pngQuality: 90, maxSide: 0 },
  balanced: { jpg: 72, webp: 72, avif: 45, pngQuality: 75, maxSide: 0 },
  strong: { jpg: 58, webp: 58, avif: 35, pngQuality: 60, maxSide: 2560 },
};

/** Re-encode an image smaller in its own format. Returns the buffer and the format used. */
async function compress(file, s) {
  const p = COMPRESS_PRESETS[s.compressLevel] || COMPRESS_PRESETS.balanced;
  let format = canonical(extOf(file));
  if (['heic', 'svg', 'ico', 'bmp'].includes(format)) format = format === 'bmp' ? 'png' : 'jpg';
  let img = await load(file, { animated: ANIMATED.has(format) });
  if (p.maxSide) img = img.resize(p.maxSide, p.maxSide, { fit: 'inside', withoutEnlargement: true });
  img = applyMetadata(img, s.keepMetadata);
  const buffer = await encode(img, format, { jpg: p.jpg, webp: p.webp, avif: p.avif, palette: true, pngQuality: p.pngQuality });
  return { buffer, format };
}

/** PNG buffer for previews/editors (any input format, EXIF-rotated). */
async function toPng(file, maxSide = 0) {
  let img = await load(file);
  if (maxSide) img = img.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true });
  return img.png().toBuffer();
}

/** Re-encode an edited PNG (from the editor canvas) into the target format. */
async function fromPng(pngBuffer, format, s) {
  return encode(sharp(pngBuffer), format, { jpg: s.jpgQuality, webp: s.webpQuality, avif: s.avifQuality });
}

async function stripMetadata(file, s) {
  const format = canonical(extOf(file));
  const target = ['heic', 'svg', 'ico'].includes(format) ? 'png' : format;
  const img = await load(file, { animated: ANIMATED.has(target) });
  // sharp drops EXIF/XMP/IPTC unless keepMetadata() is called.
  return { buffer: await encode(img, target, { jpg: 95, webp: 95, avif: 70 }), format: target };
}

async function readMetadata(file) {
  const out = { file: {}, exif: {} };
  const stat = fs.statSync(file);
  out.file = { size: stat.size, modified: stat.mtime.toISOString(), created: stat.birthtime.toISOString() };
  try {
    const img = await load(file);
    const m = await img.metadata();
    Object.assign(out.file, { width: m.width, height: m.height, format: m.format, space: m.space, hasAlpha: m.hasAlpha, density: m.density });
  } catch {
    /* dimensions are optional */
  }
  try {
    const exifr = require('exifr');
    const data = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, ihdr: false, translateValues: true });
    // Structural header fields aren't metadata a user would want to see or strip.
    const STRUCTURAL = new Set(['ImageWidth', 'ImageHeight', 'BitDepth', 'ColorType', 'Compression', 'Filter', 'Interlace', 'ExifImageWidth', 'ExifImageHeight']);
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (STRUCTURAL.has(k)) continue;
        if (v == null || typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) continue;
        if (v instanceof Uint8Array) continue;
        out.exif[k] = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(', ') : v;
      }
    }
  } catch {
    /* no metadata */
  }
  return out;
}

module.exports = { load, encode, convert, compress, imagesToPdf, toPng, fromPng, stripMetadata, readMetadata, encodeIco };
