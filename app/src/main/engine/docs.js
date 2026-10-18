// Word, text, Markdown, HTML and CSV/JSON conversions.
const fs = require('fs');
const path = require('path');
const worker = require('./worker');
const { extOf, canonical } = require('./formats');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const PRINT_CSS = `
  body { font: 11pt/1.55 "Segoe UI", Calibri, Arial, sans-serif; color: #1d1d1f; margin: 0; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 .5em; }
  h1 { font-size: 22pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  p { margin: 0 0 .7em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #c8c8c8; padding: 4px 8px; vertical-align: top; }
  pre, code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 9.5pt; }
  pre { background: #f5f5f7; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; }
  blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 12px; color: #555; }
  pre.plain { background: none; padding: 0; font: 10.5pt/1.5 Consolas, "Cascadia Mono", monospace; }
`;

const htmlDoc = (title, body, css = PRINT_CSS) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
const titleOf = (file) => path.basename(file, path.extname(file));

/* ---------- DOCX ---------- */

async function docxToHtmlBody(file) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.convertToHtml({ path: file });
  return value;
}

/* ---------- Markdown -> DOCX ---------- */

function inlineRuns(tokens, docx, style = {}) {
  const { TextRun, ExternalHyperlink } = docx;
  const runs = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case 'strong':
        runs.push(...inlineRuns(t.tokens, docx, { ...style, bold: true }));
        break;
      case 'em':
        runs.push(...inlineRuns(t.tokens, docx, { ...style, italics: true }));
        break;
      case 'del':
        runs.push(...inlineRuns(t.tokens, docx, { ...style, strike: true }));
        break;
      case 'codespan':
        runs.push(new TextRun({ ...style, text: decode(t.text), font: 'Consolas' }));
        break;
      case 'link':
        runs.push(new ExternalHyperlink({ link: t.href, children: inlineRuns(t.tokens, docx, { ...style, style: 'Hyperlink' }) }));
        break;
      case 'br':
        runs.push(new TextRun({ ...style, text: '', break: 1 }));
        break;
      default:
        if (t.tokens) runs.push(...inlineRuns(t.tokens, docx, style));
        else runs.push(new TextRun({ ...style, text: decode(t.text ?? t.raw ?? '') }));
    }
  }
  return runs;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function markdownToDocxChildren(md, docx) {
  const { marked } = require('marked');
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = docx;
  const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const out = [];
  const walk = (tokens, level = 0) => {
    for (const t of tokens) {
      switch (t.type) {
        case 'heading':
          out.push(new Paragraph({ heading: H[t.depth], children: inlineRuns(t.tokens, docx) }));
          break;
        case 'paragraph':
          out.push(new Paragraph({ spacing: { after: 160 }, children: inlineRuns(t.tokens, docx) }));
          break;
        case 'list':
          t.items.forEach((item, i) => {
            const [first, ...rest] = item.tokens;
            const prefix = t.ordered ? `${(t.start || 1) + i}. ` : '• ';
            out.push(
              new Paragraph({
                indent: { left: 360 * (level + 1), hanging: 260 },
                children: [new TextRun(prefix), ...inlineRuns(first?.tokens || [first].filter(Boolean), docx)],
              })
            );
            walk(rest, level + 1);
          });
          break;
        case 'code':
          t.text.split('\n').forEach((line) => out.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 19 })] })));
          out.push(new Paragraph(''));
          break;
        case 'blockquote':
          walk(t.tokens, level + 1);
          break;
        case 'hr':
          out.push(new Paragraph({ thematicBreak: true }));
          break;
        case 'table':
          out.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [t.header, ...t.rows].map(
                (row, r) =>
                  new TableRow({
                    children: row.map((cell) => new TableCell({ children: [new Paragraph({ children: inlineRuns(cell.tokens, docx, r === 0 ? { bold: true } : {}) })] })),
                  })
              ),
            })
          );
          break;
        case 'space':
          break;
        default:
          if (t.text) out.push(new Paragraph(decode(t.text)));
      }
    }
  };
  walk(marked.lexer(md));
  return out;
}

async function buildDocx(children, title) {
  const docx = require('docx');
  const doc = new docx.Document({
    creator: 'Shortnut',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: children(docx) }],
  });
  return docx.Packer.toBuffer(doc);
}

/* ---------- CSV / JSON ---------- */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const delim = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

function csvToJson(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return '[]\n';
  const coerce = (v) => (v === '' ? '' : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v);
  return JSON.stringify(rows.map((r) => Object.fromEntries(header.map((h, i) => [h || `column${i + 1}`, coerce(r[i] ?? '')]))), null, 2) + '\n';
}

function jsonToCsv(text) {
  let data = JSON.parse(text);
  if (!Array.isArray(data)) {
    const arr = Object.values(data).find(Array.isArray);
    data = arr || [data];
  }
  const flat = data.map((item) => (item && typeof item === 'object' ? flatten(item) : { value: item }));
  const cols = [...new Set(flat.flatMap(Object.keys))];
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(cell).join(','), ...flat.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

/* ---------- dispatcher ---------- */

/** Convert a document/text/data file. Returns a Buffer or string to write. */
async function convert(file, target) {
  const src = canonical(extOf(file));
  const title = titleOf(file);

  if (src === 'docx') {
    const mammoth = require('mammoth');
    if (target === 'txt') return (await mammoth.extractRawText({ path: file })).value;
    if (target === 'md') return (await mammoth.convertToMarkdown({ path: file })).value;
    const body = await docxToHtmlBody(file);
    if (target === 'html') return htmlDoc(title, body, PRINT_CSS + 'body{max-width:760px;margin:40px auto;padding:0 20px}');
    if (target === 'pdf') return worker.htmlToPdf({ html: htmlDoc(title, body) });
  }

  if (src === 'txt') {
    const text = readText(file);
    if (target === 'pdf') return worker.htmlToPdf({ html: htmlDoc(title, `<pre class="plain">${esc(text)}</pre>`) });
    if (target === 'html') return htmlDoc(title, `<pre class="plain">${esc(text)}</pre>`);
    if (target === 'md') return text;
    if (target === 'docx')
      return buildDocx((d) => text.split(/\r?\n/).map((line) => new d.Paragraph({ children: [new d.TextRun(line)] })), title);
  }

  if (src === 'md') {
    const md = readText(file);
    const { marked } = require('marked');
    const body = marked.parse(md, { gfm: true });
    if (target === 'html') return htmlDoc(title, body, PRINT_CSS + 'body{max-width:760px;margin:40px auto;padding:0 20px}');
    if (target === 'pdf') return worker.htmlToPdf({ html: htmlDoc(title, body) });
    if (target === 'txt') return md;
    if (target === 'docx') return buildDocx((d) => markdownToDocxChildren(md, d), title);
  }

  if (src === 'html') {
    if (target === 'pdf') return worker.htmlToPdf({ file });
    const text = await worker.htmlToText(file);
    if (target === 'txt' || target === 'md') return text;
    if (target === 'docx')
      return buildDocx((d) => text.split(/\r?\n/).map((line) => new d.Paragraph({ children: [new d.TextRun(line)] })), title);
  }

  if (src === 'csv' && target === 'json') return csvToJson(readText(file));
  if (src === 'json' && target === 'csv') return jsonToCsv(readText(file));

  throw new Error(`Can't convert ${src.toUpperCase()} to ${target.toUpperCase()}`);
}

module.exports = { convert, csvToJson, jsonToCsv, parseCsv };
