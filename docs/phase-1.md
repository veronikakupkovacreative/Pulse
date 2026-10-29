# PULSE Studio 3.0 — Phase 1 / Quick Tools

This is an implemented browser-only audio production toolkit phase. The development branch is not automatically deployed to the public Vercel site.

## New working tools

- **Audio Reverse** — reverses actual mono/stereo PCM samples in the browser. Preview, apply to working audio, WAV 24-bit export.
- **Silence Trimmer** — 5 ms RMS windows, adjustable threshold (-80..-18 dBFS), padding (0..500 ms). Preview, apply, WAV 24-bit export. Silence below threshold produces an explicit error.
- **BPM Calculator** — straight, dotted and triplet durations in ms for whole, half, quarter, eighth and sixteenth notes; copy individual values.
- **Audio Normalizer** — peak dBFS target or integrated LUFS with K-weighting and absolute (-70 LUFS) and relative (-10 LU) gates. Gain-only, with user-defined sample peak ceiling, preview, apply, WAV 24-bit export. Reports when requested LUFS cannot be reached due to ceiling. No compressor/limiter is claimed.
- **Shared Audio Workspace foundation** — original source, working audio, last four undo steps, redo, reset to original. Existing Converter/Key Finder/Loop Cutter act on the working audio without reuploading. The existing BPM Analyzer's "Use track" action loads that same audio into the workspace.

## Technical architecture

- `source/dsp/quick-tools.mjs`: pure DSP operating on Float32Arrays; real computations, no external services.
- `source/core/audio-workspace.mjs`: original/working buffers and bounded in-memory history.
- `source/tools.mjs`: integrates the quick tools with the existing audio import, waveform, playback and export.
- `source/index.html` + `source/style.css`: existing visual language, new tool panels and workspace controls.
- `scripts/build.mjs`: bundles new ES Modules into original standalone `index.html` and `public/index.html`.
- `tests/quick-tools.test.mjs`: deterministic DSP and workspace tests.

## Build / run

From project root:

```sh
npm test
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser. The generated standalone `index.html` can also be used by Vercel with `vercel.json`. No npm packages are needed for the new DSP components.

## Tested in this phase

- 27/27 Node tests pass.
- Standalone build passes.
- Automated Chromium smoke: real WAV import, reverse download, apply and undo, silence trim preview, calculator, LUFS normalization, existing Converter/Key Finder/Loop Cutter tabs and disabled YouTube tab.
- Browser import also tested with MP3 and stereo WAV at 44.1 kHz. WAV import preserves native WAV sample rate where metadata provides it.
- Mobile Chromium viewport (390px) renders without horizontal document overflow.
- LUFS for a 4-second 1 kHz tone agrees with ffmpeg `ebur128` within ~0.1 LU.

## Limitations / upcoming

- Safari hands-on verification has **not** yet been completed.
- Audio playback is based on the existing Web Audio API and still requires a user gesture.
- Codec support for compressed formats depends on the browser; MP3/WAV were tested in Chromium.
- Peak ceiling uses **sample peak**, not inter-sample true-peak limiting. No dynamics compression or brickwall limiter.
- Processing for very large inputs runs on the main thread in this phase; a worker-based processing pipeline is a Phase 2/3 performance task.
- Undo history is in memory; reload drops working changes. No persistence of private audio to a server.
- The $1 **one-time** lifetime purchase UI remains a separate, inactive prototype in `feature/lifetime-access-1usd`; access control and payment are not live. Do not claim otherwise.
- YouTube Audio stays disabled / Coming Soon. No YouTube requests are made by the active toolkit.
- The start-screen art concept supplied in conversation is not part of the repository's current interactive production UI. It has not been silently replaced.
