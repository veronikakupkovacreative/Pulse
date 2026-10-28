# PULSE Studio 3.0 — Phase 2 implementation

This branch extends Phase 1 without overwriting the original audio tools.

## New working tools

- **Pitch & Time**: select original/target BPM, semitones -12..+12, fine tune -100..+100 cents and Preserve Pitch. Original BPM is estimated from source if there is enough rhythmic material (>6 seconds); you can override the estimate. Key display follows the separate Key Finder estimate. DSP: stereo-synchronized WSOLA-like waveform similarity overlap/add and resampling. Processing in a dedicated web worker. Preview, apply to shared workspace, export 24-bit WAV, Undo/Redo/Reset.
- **808 Tuner**: estimates the fundamental of tonal 808/bass material using an adapted YIN difference function. Displays note, frequency, cents, and confidence; a noisy kick or gliding pitch can give a low-confidence or unstable estimate. Transposition uses the same pitch engine. Preview/apply/export.
- **Sample Slicer**: amplitude-envelope onset detection, sensitivity, manual markers (click waveform to insert; drag an interior marker; Shift+click to delete), preview current slice, individual 24-bit WAV, and genuine stored ZIP of all slices with CRC32 and central directory.

## Shared workspace

- Imported audio is decoded once, then stored separately from its working render.
- The Phase 1 workspace provides 4 bounded Undo revisions, Redo, and Reset to Original; subsequent operations use the working audio.
- DSP work is pushed to Web Workers where computationally expensive; sources are copied before transfer, preserving the original buffers.
- Local processing, no audio upload. User file stays in memory until removed or page closed.

## Run and test

```sh
npm test
npm run build
python3 -m http.server 8000
```

Open http://localhost:8000. Alternatively, open the self-contained `index.html` in an appropriate local browser context. The build produces `public/index.html` and `index.html` from source.

Automated tests: BPM regression, format/export, normalization, workspace, fundamental pitch, time stretch, transient detection, ZIP CRC/headers. Local Chromium smoke test: real WAV import, tuner, Pitch WAV export, apply/undo, auto-slice, ZIP containing valid extractable WAV files, viewport 390 and 1440 px; no console exceptions.

## Technical boundaries and honest limitations

- **Pitch quality**: custom WSOLA-like processing is practical for moderate tempo/pitch changes, but may sound grainy at large shifts or on vocals and complex harmonic material; it is not a licensed commercial phase-vocoder/Rubber Band replacement. Evaluate and license an appropriate high-quality DSP implementation before claiming transparent studio-grade quality.
- **Tempo**: detection can return half/double tempo (e.g. 60 vs 120 BPM); UI makes this explicit and manual override has priority.
- **Fundamental**: 808/kick pitch may glide or be inharmonic, so note is an estimate, never a guaranteed musical key.
- **Slicer**: envelope-flux onsets work particularly for sharp drums; low-amplitude or legato material needs manual marker refinement. Marker precision is approximately 7.5 ms plus attack-envelope latency; use manual adjustments when precision matters. ZIP files are stored (uncompressed) to protect existing PCM and avoid extra libraries.
- **Memory**: large pitch renders are capped (about 220 MiB of float channel data); sample ZIP is capped at 380 MiB and 200 slices. The frontend accepts at most 100 MB / 20 min source audio; exported WAV size may exceed input size significantly.
- **Codec**: MP3, M4A, FLAC etc. input decoding depends on browser support; tested WAV/MP3 in Chromium. Safari/native audio codecs and long mobile sessions still require device testing.
- **Not done**: Phase 3 Analyzer/Batch Processor, Phase 4 Stem Separator, server-validated lifetime payment, and production deployment.

No external DSP packages were added; Phase 2 uses original code, native Web Audio API, Web Workers and ES Modules. YouTube Audio is still a disabled Coming Soon tab. No previously removed marketing slogans were reintroduced.
