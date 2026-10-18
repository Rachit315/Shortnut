// Hidden renderer: PDF rendering + text extraction with pdf.js, and image decoding via Chromium.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const docs = new Map();
let nextId = 1;

async function canvasToBytes(canvas, mime, quality) {
  const blob = await canvas.convertToBlob({ type: mime, quality });
  return new Uint8Array(await blob.arrayBuffer());
}

const methods = {
  async pdfOpen(bytes) {
    const doc = await pdfjs.getDocument({
      data: bytes,
      cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
      isEvalSupported: false,
    }).promise;
    const id = nextId++;
    docs.set(id, doc);
    return { id, numPages: doc.numPages };
  },

  async pdfRender(id, pageNo, scale, mime = 'image/png', quality = 0.92) {
    const doc = docs.get(id);
    if (!doc) throw new Error('PDF not open');
    const page = await doc.getPage(pageNo);
    let viewport = page.getViewport({ scale });
    // Keep canvases within Chromium's limits (~16k px per side / 268M px area).
    const maxSide = 12000;
    const fit = Math.min(1, maxSide / Math.max(viewport.width, viewport.height), Math.sqrt(150e6 / (viewport.width * viewport.height)));
    if (fit < 1) viewport = page.getViewport({ scale: scale * fit });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    page.cleanup();
    return canvasToBytes(canvas, mime, quality);
  },

  async pdfText(id) {
    const doc = docs.get(id);
    if (!doc) throw new Error('PDF not open');
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let text = '';
      let lastY = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > (item.height || 10) * 1.8 && !text.endsWith('\n')) text += '\n';
        text += item.str;
        if (item.hasEOL) text += '\n';
        lastY = y;
      }
      pages.push(text.replace(/[ \t]+\n/g, '\n'));
      page.cleanup();
    }
    return pages;
  },

  async pdfClose(id) {
    const doc = docs.get(id);
    docs.delete(id);
    if (doc) await doc.destroy();
    return true;
  },

  // Readable text from HTML without executing it (DOMParser never runs scripts).
  async htmlText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,template,head').forEach((n) => n.remove());
    const BLOCK = /^(P|DIV|H[1-6]|LI|TR|BR|HR|SECTION|ARTICLE|HEADER|FOOTER|BLOCKQUOTE|PRE|TABLE|UL|OL|DL|DT|DD|FIGURE|NAV|ASIDE|MAIN)$/;
    let out = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.parentElement?.closest('pre') ? child.data : child.data.replace(/\s+/g, ' ');
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const block = BLOCK.test(child.tagName);
          if (block && !out.endsWith('\n')) out += '\n';
          if (child.tagName === 'LI') out += '• ';
          if (child.tagName === 'TD' || child.tagName === 'TH') out += '\t';
          walk(child);
          if (block && !out.endsWith('\n')) out += '\n';
        }
      }
    };
    walk(doc.body || doc.documentElement);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  },

  async decodeImage(bytes, mime) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(data.buffer) };
  },
};

window.bridge.onRequest((method, args) => {
  const fn = methods[method];
  if (!fn) throw new Error(`Unknown worker method ${method}`);
  return fn(...args);
});
