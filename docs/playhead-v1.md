# PULSE Studio 3.2 — Playhead and Waveform Seek

## Scope

This update adds a visible vertical playhead with a red triangle indicator to the BPM Analyzer waveform and the shared toolkit waveform. User clicks move the playhead and begin playback from the selected position; dragging scrubs and plays from the release location. Current position is updated from the Web Audio clock with `requestAnimationFrame`.

### Toolkit interaction rules

- Click or drag anywhere in the waveform outside of a draggable slice marker: seek and play from that time.
- While playing, the cursor tracks the actual playback position. Pausing preserves that position.
- Arrow Left/Right moves by 1 s; Shift+Arrow moves by 5 s; Home/End go to the boundaries; Space toggles playback when the waveform has keyboard focus.
- In **Loop Cutter**, Shift+click changes the nearer cut boundary. The existing START/END controls are unchanged.
- In **Sample Slicer**, pointer-down within 6 px of an interior slice marker moves the marker; Shift+click away from a marker adds one; Shift+click on an interior marker removes it. Regular clicks elsewhere seek instead of inserting markers.
- A mastering/quick-tool preview retains its selected preview source and volume when the playhead is relocated during playback, unless the user switches tools or loads a new source.
- Scrubbing never rewrites the PCM buffers, markers or original project file.

### Implementation

- `source/playhead.mjs`: safe, pure position mapping, clamping and keyboard stepping.
- `source/app.mjs`: BPM seek playback tied to existing native range slider, visible indicator.
- `source/tools.mjs`: shared preview transport, audible seek and continuous visual position, preserving slice/cutter editing.
- `source/index.html` and `source/style.css`: accessible waveform position controls and responsive visual playhead.
- `scripts/build.mjs`: bundles the new module into the offline standalone HTML.
- `tests/playhead.test.mjs`: boundary cases, position-to-time math, compiled UI assertions.

### QA performed

- `npm test`: 45/45 passing.
- `npm run build`: successful output in `public/index.html` and root `index.html`.
- Chromium desktop 1440×900 and mobile 390×844: actual WAV import, click-to-play, drag-to-scrub, pause, BPM seek, persistent cutter selection, and no horizontal overflow or JS page errors.
- Slicer: 16 automatically detected slices, ordinary click did not add a marker, Shift+click did add a marker, keyboard nudge worked.
- Safari not verified in this environment; the native slider and Pointer Events implementation should be checked on macOS/iOS Safari before merging to production.

### User privacy / deployment

All audio processing remains in the browser. This is a development-branch feature; production Vercel is unchanged until the corresponding PR is merged and deployed. YouTube remains disabled / Coming Soon. Payment activation is not included.
