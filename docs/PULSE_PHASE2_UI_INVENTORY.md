# PULSE Studio - Phase 2 / UI preservation inventory

Baseline: accepted Phase 1 preview, commit c2253a6e22fd5d9ae0dc6d22840cd1d2a9d6e96e.
Branch: feature/pulse-phase2-audio-ui-20261114.

## Principle
The uploaded HTML is a design specification, not the runtime. Existing modules continue to mount in the original shared AudioWorkspace. No fictional analysis, dummy tracks, duplicate uploaders, or disconnected controls. All module copy, warnings, nested modes, status text and labels stay.

## Visual foundations
- Canvas #0e0e0f; panels #141416; nested fields #19191b; borders #2a2a2e.
- Orange #ff4d1c for active controls, audio selection, focus and primary actions. Dark #14130f ink on orange fills. White/off-white #f4f2ee text, secondary #bdbab1 and labels #9e9a91.
- Space Grotesk headings, Inter body and JetBrains Mono metadata.
- 14px radius, focus outlines and responsive horizontal split above 1050px, stacked below.
- phase-two-audio.css is a last-loaded, ID-scoped visual adapter over production styles. phase-two-runtime.mjs adds only breadcrumbs and shared-source metadata. No engine or API replacement.

## Actual capabilities retained beyond HTML prototype

### Song Analyzer (song-analyzer)
Existing shared SOURCE AUDIO, rhythm and harmony workers, BPM estimates/confidence/stability, candidate tempos, half/double/reset controls, shared beat markers, key/Camelot/confidence, approximate chord timeline, explicit Audo consent and independent cross-check, copy BPM, existing workspace preview/export affordances. Audo remains an opt-in cloud step. No hardcoded prototype BPM/key.

### Audio Editor (editor)
Live trim and cut based on waveform selection, merging up to seven additional files, fade in/out and duration, numeric gain, 3/10/20-band EQ, live response graph, genre/mastering presets, per-band gain, shared playback, zoom, loop, undo/redo, reset and existing export controls. Reverse and fake export from prototype are NOT added because accepted baseline intentionally excludes Reverse mode.

### Audio Converter (wav)
Seven original formats: MP3, WAV, FLAC, AAC, M4A, OGG, WMA. Sample-rate options, bitrate, WAV bit depth, OGG quality, FLAC compression, local FFmpeg WASM progress/errors, automatic settings and original MP3 bitrate guidance. The production form is not simplified to the prototype's five formats.

### Music Tagger (music-tagger)
Existing local peak, RMS, crest factor, spectral centroid, transient density, stereo correlation and frequency balance. CLAP/ONNX genre, mood and instrument predictions; stop/progress; JSON export; privacy and model-download warnings. The sample genre tags in the prototype are not used.

### Remaining tools
The full 22-module registry, three categories and every selection tab remain. API routes and their consent copy remain. A shared baseline skin applies to all tool screens; specialized AI Studio panels can be refined in a subsequent phase.

## Regression requirements
- Build gate stays npm test && npm run build.
- The original app.mjs module mounting and cleanup remain.
- One AudioWorkspace; no moving live controls into hidden legacy hosts.
- Real uploaded File/AudioBuffer, DSP, edit history, export and provider logic unchanged.
- Preview manually at 375px, 768px and desktop: upload WAV, play/pause/selection, BPM and key, editor trim+undo, codec options, tagger progress and single footer.
