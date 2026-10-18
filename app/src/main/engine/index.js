// Engine entry point: turns an action id ("to:jpg", "tool:compress") and a list of files into output files.
const fs = require('fs');
const path = require('path');
const formats = require('./formats');
const output = require('./output');
const image = require('./image');
const pdf = require('./pdf');
const docs = require('./docs');
const media = require('./media');

const { extOf, canonical, categoryOf, LABELS } = formats;

const write = (file, data) => {
  fs.writeFileSync(file, typeof data === 'string' ? data : Buffer.from(data));
  return file;
};

/** Human titles for a job while running and once finished. */
function describe(actionId, count) {
  const [kind, name] = actionId.split(':');
  if (kind === 'to') {
    const label = LABELS[name] || name.toUpperCase();
    return { title: `Converting to ${label}`, doneTitle: `Converted to ${label}` };
  }
  const verbs = {
    compress: ['Compressing', 'Compressed'],
    rotate: ['Rotating', 'Rotated'],
    merge: [`Merging ${count} PDFs`, `Merged ${count} PDFs`],
    split: ['Splitting pages', 'Split into pages'],
    images: ['Extracting pages', 'Extracted pages'],
    mute: ['Removing audio', 'Audio removed'],
    hd720: ['Resizing to 720p', 'Resized to 720p'],
    thumbnail: ['Grabbing thumbnail', 'Thumbnail saved'],
    normalize: ['Normalizing volume', 'Volume normalized'],
    mono: ['Converting to mono', 'Converted to mono'],
  };
  const [title, doneTitle] = verbs[name] || ['Working', 'Done'];
  return { title, doneTitle };
}

/**
 * Convert a single file.
 * @returns {Promise<string[]>} created paths (files or folders)
 */
async function convertOne(file, target, settings, ctx) {
  const cat = categoryOf(file);
  const src = canonical(extOf(file));
  if (!cat) throw new Error(`Unsupported file type .${extOf(file) || '?'}`);
  if (src === target) throw new Error(`Already a ${target.toUpperCase()}`);

  if (cat === 'image') {
    if (target === 'pdf') return [write(output.outputFor(file, 'pdf'), await image.imagesToPdf([file]))];
    return [write(output.outputFor(file, target), await image.convert(file, target, settings))];
  }
  if (cat === 'pdf') {
    if (target === 'jpg' || target === 'png') return pdf.toImages(file, target, settings, ctx.onFileProgress);
    if (target === 'txt') return [write(output.outputFor(file, 'txt'), await pdf.toTxt(file))];
    if (target === 'docx') return [write(output.outputFor(file, 'docx'), await pdf.toDocx(file))];
    if (target === 'html') return [write(output.outputFor(file, 'html'), await pdf.toHtml(file))];
  }
  if (cat === 'doc' || cat === 'text' || cat === 'data') {
    return [write(output.outputFor(file, target), await docs.convert(file, target))];
  }
  if (cat === 'video' || cat === 'audio') {
    const args = media.convertArgs(target);
    if (!args) throw new Error(`Can't convert to ${target.toUpperCase()}`);
    const out = output.outputFor(file, target);
    await media.run(file, args, out, { onProgress: ctx.onFileProgress, signal: ctx.signal });
    return [out];
  }
  throw new Error(`Can't convert ${src.toUpperCase()} to ${target.toUpperCase()}`);
}

async function toolOne(file, tool, settings, ctx) {
  const cat = categoryOf(file);
  const src = canonical(extOf(file));

  if (cat === 'image' && tool === 'compress') {
    const before = fs.statSync(file).size;
    const { buffer, format } = await image.compress(file, settings);
    if (buffer.length >= before && format === src) {
      return { outputs: [], note: 'Already optimized', before, after: before };
    }
    return { outputs: [write(output.outputFor(file, format, 'Compressed'), buffer)], before, after: buffer.length };
  }

  if (cat === 'pdf') {
    switch (tool) {
      case 'compress': {
        const before = fs.statSync(file).size;
        const buf = await pdf.compress(file, settings, ctx.onFileProgress);
        if (buf.length >= before) return { outputs: [], note: 'Already optimized', before, after: before };
        return { outputs: [write(output.outputFor(file, 'pdf', 'Compressed'), buf)], before, after: buf.length };
      }
      case 'rotate':
        return { outputs: [write(output.outputFor(file, 'pdf', 'Rotated'), await pdf.rotate(file))] };
      case 'split':
        return { outputs: await pdf.split(file, ctx.onFileProgress) };
      case 'images':
        return { outputs: await pdf.extractPages(file, settings, ctx.onFileProgress) };
    }
  }

  if (cat === 'video' || cat === 'audio') {
    const { args, ext } = media.toolArgs(tool, src, cat, settings.compressLevel);
    const suffix = { compress: 'Compressed', mute: 'Muted', hd720: '720p', rotate: 'Rotated', thumbnail: 'Thumbnail', normalize: 'Normalized', mono: 'Mono' }[tool];
    const out = output.outputFor(file, ext, suffix);
    const before = fs.statSync(file).size;
    await media.run(file, args, out, { onProgress: ctx.onFileProgress, signal: ctx.signal });
    const after = fs.statSync(out).size;
    if (tool === 'compress' && after >= before) {
      fs.rmSync(out, { force: true });
      return { outputs: [], note: 'Already optimized', before, after: before };
    }
    return { outputs: [out], before: tool === 'compress' ? before : undefined, after: tool === 'compress' ? after : undefined };
  }

  throw new Error(`${tool} isn't available for .${extOf(file)} files`);
}

/**
 * Run an action over files, reporting progress. Never throws for per-file errors; they are collected.
 * @param {{ actionId: string, files: string[], settings: object, signal?: AbortSignal,
 *           onProgress?: (p: {done:number,total:number,fraction:number}) => void }} job
 */
async function run({ actionId, files, settings, signal, onProgress }) {
  output.configure(settings);
  const [kind, name] = actionId.split(':');
  const result = { outputs: [], errors: [], notes: [], before: 0, after: 0 };
  const total = files.length;
  const report = (done, partial = 0) => onProgress?.({ done, total, fraction: Math.min(1, (done + partial) / total) });

  // Whole-batch actions
  if (kind === 'to' && name === 'pdf' && total > 1 && files.every((f) => categoryOf(f) === 'image')) {
    report(0);
    const name0 = total > 1 ? `${output.baseName(files[0])} and ${total - 1} more` : output.baseName(files[0]);
    const out = output.uniquePath(output.outputDir(files[0]), name0, 'pdf');
    write(out, await image.imagesToPdf(files));
    result.outputs.push(out);
    report(total);
    return result;
  }
  if (kind === 'tool' && name === 'merge') {
    report(0);
    const out = output.uniquePath(output.outputDir(files[0]), `${output.baseName(files[0])} Merged`, 'pdf');
    write(out, await pdf.merge(files));
    result.outputs.push(out);
    report(total);
    return result;
  }

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) break;
    const file = files[i];
    const ctx = { signal, onFileProgress: (p) => report(i, p) };
    try {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('File not found');
      if (kind === 'to') {
        result.outputs.push(...(await convertOne(file, name, settings, ctx)));
      } else {
        const r = await toolOne(file, name, settings, ctx);
        result.outputs.push(...r.outputs);
        if (r.note) result.notes.push(`${path.basename(file)}: ${r.note}`);
        if (r.before) {
          result.before += r.before;
          result.after += r.after;
        }
      }
    } catch (err) {
      if (err.cancelled) break;
      result.errors.push({ file, message: err.message || String(err) });
    }
    report(i + 1);
  }
  return result;
}

module.exports = { run, describe, formats, image, pdf, docs, media };
