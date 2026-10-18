// Video and audio via the bundled ffmpeg binary.
const { spawn } = require('child_process');
const fs = require('fs');

function ffmpegPath() {
  // Inside a packaged app the binary lives in app.asar.unpacked.
  return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
}

const parseTime = (s) => {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

/**
 * Run ffmpeg with progress reporting. Rejects with the tail of stderr on failure.
 * @param {string[]} args arguments after the input
 */
function run(input, args, output, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const full = ['-hide_banner', '-nostdin', '-y', '-i', input, ...args, output];
    const proc = spawn(ffmpegPath(), full, { windowsHide: true });
    let duration = 0;
    let tail = '';
    const abort = () => proc.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      tail = (tail + s).slice(-4000);
      if (!duration) {
        const d = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(tail);
        if (d) duration = parseTime(d[1]);
      }
      const t = /time=\s*(\d+:\d+:\d+(?:\.\d+)?)/g;
      let m;
      let last = null;
      while ((m = t.exec(s))) last = m[1];
      if (last && duration) onProgress?.(Math.min(0.99, parseTime(last) / duration));
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        fs.rm(output, { force: true }, () => {});
        return reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
      }
      if (code === 0) return resolve(output);
      fs.rm(output, { force: true }, () => {});
      const lines = tail.trim().split(/\r?\n/).filter((l) => !/^\s*(frame|size)=/.test(l));
      reject(new Error(lines.slice(-2).join(' ').slice(0, 300) || `ffmpeg exited with code ${code}`));
    });
  });
}

const H264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
const AAC = ['-c:a', 'aac', '-b:a', '192k'];

const VIDEO_ARGS = {
  mp4: [...H264, ...AAC, '-movflags', '+faststart'],
  mov: [...H264, ...AAC, '-movflags', '+faststart'],
  mkv: [...H264, ...AAC],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k'],
  avi: ['-c:v', 'libxvid', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '3'],
  gif: ['-vf', 'fps=12,scale=min(640\\,iw):-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0'],
};

const AUDIO_ARGS = {
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  aac: ['-vn', '-c:a', 'aac', '-b:a', '192k', '-f', 'adts'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
  flac: ['-vn', '-c:a', 'flac'],
};

function convertArgs(target) {
  return VIDEO_ARGS[target] || AUDIO_ARGS[target] || null;
}

const COMPRESS_CRF = { light: 24, balanced: 28, strong: 32 };
const AUDIO_BITRATE = { light: '160k', balanced: '128k', strong: '96k' };

/** Args for video/audio tools; returns { args, ext } where ext may differ from the source. */
function toolArgs(tool, srcExt, category, level = 'balanced') {
  const crf = String(COMPRESS_CRF[level] || 28);
  if (category === 'video') {
    const ext = ['mp4', 'mov', 'mkv'].includes(srcExt) ? srcExt : 'mp4';
    const video = ['-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p'];
    switch (tool) {
      case 'compress': {
        const cap = level === 'strong' ? 1280 : 1920;
        return { ext, args: [...video, '-vf', `scale='min(${cap},iw)':-2`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'] };
      }
      case 'mute':
        return { ext: srcExt, args: ['-c:v', 'copy', '-an'] };
      case 'hd720':
        return { ext, args: [...video.slice(0, 5), '22', '-pix_fmt', 'yuv420p', '-vf', "scale=-2:'min(720,ih)'", ...AAC, '-movflags', '+faststart'] };
      case 'rotate':
        return { ext, args: ['-vf', 'transpose=1', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy'] };
      case 'thumbnail':
        return { ext: 'jpg', args: ['-vf', "thumbnail,scale='min(1920,iw)':-2", '-frames:v', '1', '-q:v', '2'] };
    }
  }
  if (category === 'audio') {
    const ext = srcExt;
    const codec = AUDIO_ARGS[ext] || AUDIO_ARGS.mp3;
    const outExt = AUDIO_ARGS[ext] ? ext : 'mp3';
    switch (tool) {
      case 'compress':
        if (['wav', 'flac', 'aiff', 'wma'].includes(ext)) return { ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame', '-b:a', AUDIO_BITRATE[level]] };
        if (ext === 'mp3') return { ext, args: ['-vn', '-c:a', 'libmp3lame', '-b:a', AUDIO_BITRATE[level]] };
        if (ext === 'ogg') return { ext, args: ['-vn', '-c:a', 'libvorbis', '-b:a', AUDIO_BITRATE[level]] };
        if (ext === 'opus') return { ext, args: ['-vn', '-c:a', 'libopus', '-b:a', level === 'strong' ? '48k' : '64k'] };
        return { ext: outExt === 'aac' ? 'aac' : 'm4a', args: ['-vn', '-c:a', 'aac', '-b:a', AUDIO_BITRATE[level], ...(outExt === 'aac' ? ['-f', 'adts'] : [])] };
      case 'normalize':
        return { ext: outExt, args: ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', ...codec] };
      case 'mono':
        return { ext: outExt, args: ['-ac', '1', ...codec] };
    }
  }
  throw new Error(`Unknown tool ${tool}`);
}

module.exports = { run, convertArgs, toolArgs, ffmpegPath };
