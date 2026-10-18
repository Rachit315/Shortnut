<p align="center"><img src="website/assets/logo.svg" width="96" height="96" alt="Shortnut logo"></p>

<h1 align="center">Shortnut</h1>
<p align="center"><b>Convert files with just drag + Shift.</b><br>A free, open-source Windows app. Drag any file, tap Shift, drop it on a format.</p>

---

## What it does

1. **Drag** any file anywhere in Windows (Explorer, desktop, browser downloads, email attachments…).
2. **Tap Shift** while dragging and a radial wheel opens under the cursor. Tap Shift again to switch between **formats** and **tools**.
3. **Release on a choice.** The result is saved next to the original, which is never modified or overwritten.

| Files | Converts to | Tools |
| --- | --- | --- |
| Images: JPG, PNG, WEBP, AVIF, HEIC, GIF, TIFF, BMP, SVG, ICO | PNG, JPG, WEBP, AVIF, GIF, BMP, TIFF, ICO, PDF | Compress, Crop, Add background, Annotate, Redact, Edit/resize, Metadata |
| PDF | DOCX, JPG, PNG, TXT, HTML | Compress, Merge, Split, Rotate, Extract pages, Metadata |
| DOCX, TXT, Markdown, HTML | PDF, DOCX, TXT, HTML, MD | — |
| CSV / JSON | JSON / CSV | — |
| Video: MP4, MOV, MKV, WEBM, AVI, WMV… | MP4, MOV, WEBM, MKV, AVI, GIF, MP3, WAV | Compress, Mute, 720p, Rotate, Thumbnail |
| Audio: MP3, WAV, M4A, AAC, OGG, FLAC, OPUS… | MP3, WAV, M4A, OGG, FLAC, OPUS, AAC | Compress, Normalize, Mono |

Also: drop several files to batch convert (several images → one PDF), the **Convert with Shortnut** entry in Explorer's right-click menu, a tray icon, start with Windows, Shift/Ctrl/Alt as the trigger key, quality settings, and an activity history. Everything runs offline, with no accounts and no telemetry.

## Repository layout

```
app/        Electron desktop app (Windows)
  src/main/       main process: drag watcher, wheel overlay, jobs, editors, Explorer menu
    engine/       conversion engine (sharp, ffmpeg, pdf.js, pdf-lib, mammoth, docx)
  src/preload/    context-isolated bridges
  src/renderer/   UI: overlay wheel, progress toast, main window, tool editors, hidden worker
  test/           end-to-end engine tests (116 cases)
  scripts/        icon generation, vendoring, publishing the installer to the website
website/    static landing page (no build step)
.github/    release workflow (builds + self-tests + publishes the installer on tag)
```

## Develop

Requires Windows 10/11 x64 and Node.js 20+.

```bash
cd app
npm install        # also vendors pdf.js into src/renderer/vendor
npm start          # run the app (tray icon + main window)
npm test           # 116 conversion tests across every format and tool
```

Other scripts: `npm run dev` (opens DevTools), `npm run shots -- <dir>` (screenshots every window), `npm run icons`.

### How the drag + Shift detection works

`src/main/dragWatcher.js` polls `GetAsyncKeyState` (via [koffi](https://koffi.dev), no hooks or injected DLLs) to notice "primary mouse button held + cursor moved + trigger key pressed". It then shows a transparent, always-on-top window under the cursor. That window is a normal OLE drop target, so Windows delivers the real file drag to it. The wheel reads the dragged file types during `dragenter`, highlights the segment under the cursor, and gets the file paths on `drop`. Drops are always accepted as **copy**, so the source file is never moved.

## Build the installer

```bash
cd app
npm run dist
```

This produces `app/dist/Shortnut-Setup-<version>.exe` (an NSIS installer, per-user, no admin needed). It also copies the installer to `website/downloads/` and writes `website/downloads/release.json` so the landing page's download buttons point at it.

Verify any build with the built-in self-test:

```bash
app/dist/win-unpacked/Shortnut.exe --self-test report.json
```

> The installer is not code-signed, so Windows SmartScreen will show "Unknown publisher" until you sign it.
> To sign it, set `CSC_LINK` / `CSC_KEY_PASSWORD` before `npm run dist` (see electron-builder docs).

## Deploy the website

`website/` is plain static HTML/CSS/JS, so any static host works.

1. Set your repository URL in **`website/config.js`** (`repo`).
2. Host the installer:
   - **Recommended:** push a tag (`git tag v1.0.0 && git push --tags`). The GitHub Action builds and self-tests the installer and attaches it to a GitHub Release as `Shortnut-Setup.exe`. The site links to `…/releases/latest/download/Shortnut-Setup.exe` by default.
   - **Or self-host:** run `npm run dist` and deploy `website/downloads/` with the site. The page detects `release.json` and links to the local file. Many static hosts cap single files at about 100 MB and the installer is about 130 MB, so check your host's limit first.
3. Deploy:
   - **Vercel:** import the repo and set *Root Directory* to `website` (uses `website/vercel.json`).
   - **Netlify:** import the repo (uses `netlify.toml`, publish dir `website`).
   - **Cloudflare Pages / GitHub Pages:** publish the `website` folder; no build command.

Preview locally: `python -m http.server 5173 --directory website`.

## License

MIT. See [LICENSE](LICENSE). Bundled third-party components (including FFmpeg, GPL) are listed in [app/THIRD_PARTY_NOTICES.md](app/THIRD_PARTY_NOTICES.md).
