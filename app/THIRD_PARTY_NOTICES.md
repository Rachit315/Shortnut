# Third-party notices

Shortnut's own source code is licensed under the MIT License (see `LICENSE`).
The installer also ships the following third-party components, each under its own license.

| Component | Used for | License |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | Application runtime | MIT |
| [FFmpeg](https://ffmpeg.org/) (via `ffmpeg-static`, gyan.dev "essentials" build) | Video and audio conversion | GPL-3.0-or-later — source available at https://ffmpeg.org/download.html and https://www.gyan.dev/ffmpeg/builds/ |
| [sharp](https://sharp.pixelplumbing.com/) / [libvips](https://www.libvips.org/) | Image conversion | Apache-2.0 / LGPL-3.0-or-later |
| [libheif](https://github.com/strukturag/libheif) (via `heic-decode`) | HEIC decoding | LGPL-3.0 |
| [pdf.js](https://mozilla.github.io/pdf.js/) | PDF rendering and text extraction | Apache-2.0 |
| [pdf-lib](https://pdf-lib.js.org/) | PDF editing | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX reading | BSD-2-Clause |
| [docx](https://docx.js.org/) | DOCX writing | MIT |
| [marked](https://marked.js.org/) | Markdown parsing | MIT |
| [exifr](https://github.com/MikeKovarik/exifr) | Metadata reading | MIT |
| [koffi](https://koffi.dev/) | Reading keyboard/mouse state on Windows | MIT |

FFmpeg is invoked as a separate executable (`ffmpeg.exe`) and is not linked into Shortnut.
You may replace it with any compatible FFmpeg build.
