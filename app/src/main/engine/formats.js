// File type detection and the catalogue of actions offered for each kind of file.
const path = require('path');

const CATEGORIES = {
  image: ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'bmp', 'heic', 'heif', 'svg', 'ico'],
  pdf: ['pdf'],
  doc: ['docx'],
  text: ['txt', 'md', 'markdown', 'html', 'htm'],
  data: ['csv', 'json'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', '3gp', 'mpg', 'mpeg', 'ts'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'wma', 'aiff', 'aif'],
};

// Canonical extension used when comparing "is the source already this format?"
const CANONICAL = { jpeg: 'jpg', jfif: 'jpg', tif: 'tiff', heif: 'heic', markdown: 'md', htm: 'html', oga: 'ogg', aif: 'aiff', m4v: 'mp4' };

const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/gif': 'gif', 'image/tiff': 'tiff', 'image/bmp': 'bmp', 'image/x-ms-bmp': 'bmp', 'image/heic': 'heic',
  'image/heif': 'heic', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt', 'text/markdown': 'md', 'text/x-markdown': 'md', 'text/html': 'html',
  'text/csv': 'csv', 'application/vnd.ms-excel': 'csv', 'application/json': 'json',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/webm': 'webm',
  'video/x-msvideo': 'avi', 'video/avi': 'avi', 'video/x-ms-wmv': 'wmv', 'video/x-flv': 'flv', 'video/3gpp': '3gp',
  'video/mpeg': 'mpg', 'video/mp2t': 'ts',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
  'audio/x-flac': 'flac', 'audio/opus': 'opus', 'audio/x-ms-wma': 'wma', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
};

const extOf = (file) => path.extname(file).slice(1).toLowerCase();
const canonical = (ext) => CANONICAL[ext] || ext;

function categoryOfExt(ext) {
  for (const [cat, exts] of Object.entries(CATEGORIES)) if (exts.includes(ext)) return cat;
  return null;
}

const categoryOf = (file) => categoryOfExt(extOf(file));

function extFromMime(mime) {
  if (!mime) return null;
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  if (mime.startsWith('image/')) return 'png';
  if (mime.startsWith('video/')) return 'mp4';
  if (mime.startsWith('audio/')) return 'mp3';
  return null;
}

// Convert targets per category, in wheel order (clockwise from the top).
const CONVERT_TARGETS = {
  image: ['png', 'webp', 'avif', 'jpg', 'gif', 'bmp', 'pdf', 'ico', 'tiff'],
  pdf: ['docx', 'jpg', 'png', 'txt', 'html'],
  doc: ['pdf', 'txt', 'html', 'md'],
  text: ['pdf', 'docx', 'html', 'txt', 'md'],
  data: ['json', 'csv'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'gif', 'mp3', 'wav'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'opus', 'aac'],
};

const TOOLS = {
  image: [
    { id: 'compress', label: 'Compress', icon: 'compress' },
    { id: 'metadata', label: 'Metadata', icon: 'tag', editor: true },
    { id: 'edit', label: 'Edit', icon: 'sliders', editor: true },
    { id: 'annotate', label: 'Annotate', icon: 'pen', editor: true },
    { id: 'addbg', label: 'Add BG', icon: 'image', editor: true },
    { id: 'crop', label: 'Crop', icon: 'crop', editor: true },
    { id: 'redact', label: 'Redact', icon: 'eyeoff', editor: true },
  ],
  pdf: [
    { id: 'compress', label: 'Compress', icon: 'compress' },
    { id: 'metadata', label: 'Metadata', icon: 'tag', editor: true },
    { id: 'rotate', label: 'Rotate', icon: 'rotate' },
    { id: 'merge', label: 'Merge', icon: 'merge', multi: true },
    { id: 'split', label: 'Split', icon: 'split' },
    { id: 'images', label: 'Extract', icon: 'layers' },
  ],
  video: [
    { id: 'compress', label: 'Compress', icon: 'compress' },
    { id: 'mute', label: 'Mute', icon: 'mute' },
    { id: 'hd720', label: '720p', icon: 'resize' },
    { id: 'rotate', label: 'Rotate', icon: 'rotate' },
    { id: 'thumbnail', label: 'Thumbnail', icon: 'image' },
  ],
  audio: [
    { id: 'compress', label: 'Compress', icon: 'compress' },
    { id: 'normalize', label: 'Normalize', icon: 'wave' },
    { id: 'mono', label: 'Mono', icon: 'speaker' },
  ],
  doc: [],
  text: [],
  data: [],
};

const LABELS = { jpg: 'JPG', png: 'PNG', webp: 'WEBP', avif: 'AVIF', gif: 'GIF', bmp: 'BMP', pdf: 'PDF', ico: 'ICO', tiff: 'TIFF',
  docx: 'DOCX', txt: 'TXT', html: 'HTML', md: 'MD', json: 'JSON', csv: 'CSV', mp4: 'MP4', mov: 'MOV', webm: 'WEBM', mkv: 'MKV',
  avi: 'AVI', mp3: 'MP3', wav: 'WAV', m4a: 'M4A', ogg: 'OGG', flac: 'FLAC', opus: 'OPUS', aac: 'AAC' };

/**
 * Build the wheel menu for a set of files described by extension.
 * @param {string[]} exts lower-case extensions of the dragged files
 */
function menuFor(exts) {
  const cats = [...new Set(exts.map(categoryOfExt))];
  const cat = cats.length === 1 ? cats[0] : null;
  const count = exts.length;
  if (!cat) {
    return { category: cats.includes(null) ? 'unknown' : 'mixed', convert: [], tools: [] };
  }
  const sources = new Set(exts.map(canonical));
  let targets = CONVERT_TARGETS[cat].filter((t) => !(sources.size === 1 && sources.has(t)));
  // Ring holds up to 8 items comfortably.
  targets = targets.slice(0, 8);
  const convert = targets.map((t) => ({
    id: `to:${t}`,
    label: LABELS[t] || t.toUpperCase(),
    hint: cat === 'image' && t === 'pdf' && count > 1 ? `Combine ${count} into one PDF` : '',
  }));
  const tools = (TOOLS[cat] || [])
    .filter((t) => (t.multi ? count > 1 : true))
    .map((t) => ({ id: `tool:${t.id}`, label: t.label, icon: t.icon, editor: !!t.editor }));
  return { category: cat, convert, tools };
}

module.exports = { CATEGORIES, LABELS, extOf, canonical, categoryOf, categoryOfExt, extFromMime, menuFor, CONVERT_TARGETS, TOOLS };
