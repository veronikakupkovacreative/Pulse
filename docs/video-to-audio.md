# Video to Audio — PULSE Studio

New visible tool under **03 / EXPORT → Video to Audio**, retaining the existing Audio Converter.

## Supported and tested workflow

1. If desired, paste a YouTube watch, short, live or youtu.be link and click **Preview Video**. This loads an official youtube-nocookie.com iframe. It **does not download** media from YouTube.
2. For a video you own or have permission to process, obtain the original file through an authorized channel. Videos uploaded by the user can be downloaded in YouTube Studio.
3. Upload the local video file to PULSE Studio (MP4, MOV, WEBM, MKV and commonly recognized media containers; 100 MB maximum).
4. Choose audio export format: MP3, WAV, FLAC, AAC, M4A or OGG; select bitrate, WAV bit depth and 44.1/48 kHz or original sample rate.
5. Confirm that you own the media or have permission to convert the audio; click **Convert & Download**.
6. PULSE uses the existing pinned, browser-local FFmpeg WASM encoder, discarding video frames with `-vn` and selecting the first audio stream `-map 0:a:0`. The output is downloaded locally. The source video is not sent to PULSE servers.

## Limitations

- YouTube does **not** provide a general authorized method for a third-party public web app to download arbitrary video/audio streams from a pasted link. Do not add a nonfunctional or hidden scraper workflow that promises URL-to-MP3.
- The YouTube preview iframe requires user interaction and network access, and may be unavailable for restricted or unembeddable videos.
- FFmpeg processing depends on browser memory, supported codecs and the source container; source files without an audio stream yield an encoding error.
- First conversion may load a relatively large WASM engine. The current workspace limits source files to 100 MB. Very large or long videos may fail due to browser memory.
- Converting compressed content to WAV does not restore quality already lost in the source.
- For a permitted direct cloud import workflow in future, an authorized provider and separately designed backend would be required; generic YouTube Data API keys are not such a provider.

## Relevant files

- `source/modules/video-audio-tool.mjs`: player URL validation, upload, format selection, consent and UI.
- `source/modules/converter.mjs`: shared FFmpeg engine, video demux and audio-only export.
- `source/modules/index.mjs`: registration in visible Export category.
- `source/modules/pulse-design-system.css`: red/black styling matching Beat Lab.
- `tests/video-to-audio.test.mjs`: URL security validation, formats, FFmpeg mapping and DOM initialization.

## QA

`npm test && npm run build` passed 236 tests on 2026-11-12. This validates codec argument wiring and UI mounting; live video transcode in a real browser still requires manual sample-based QA before production.
