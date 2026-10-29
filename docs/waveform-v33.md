# PULSE STUDIO 3.3 — Waveform controls

This release builds on PULSE Studio 3.2.1, retaining the Circle-inspired cream/black/red design, the four main categories, their outlined subtools, and existing audio tools.

## Added

- Timeline ruler on the shared Producer Toolkit waveform, with time labels and a contrast playhead.
- 1x / 2x / 4x / 8x zoom; horizontal viewport pan; auto-follow while playing.
- Local playback loop with `IN`, `OUT`, `LOOP ON/OFF` controls and a visible loop overlay.
- Beat snapping (optional) aligned to **file time 0**, using the BPM value in Loop Cutter. This does **not** detect musical downbeats.
- Keyboard controls while the waveform is focused: `I`, `O`, `L`, `+`, `-`, arrows, Shift+arrows, Home/End, Space.
- Loop edges and marker placement stay at absolute source positions while zooming, not at viewport-relative positions.
- Compatible with Sample Slicer marker editing and Loop Cutter's existing selection sliders. Shift+click behavior stays tool-specific.

## Limits

- The full waveform audio source remains immutable; the viewport changes only rendering and transport coordinates.
- The loop uses repeated Web Audio buffer playback and is **not guaranteed gapless/sample-accurate at its boundary**, especially on mobile Safari. An AudioWorklet or scheduled overlapping sources will be required for seamless sustained musical loops.
- Snap lines are an even BPM grid from 0:00; tracks with pickup or off-grid downbeats require manual verification.
- Browser-based render tests passed on desktop 1440px and mobile 390px Chromium; Safari needs separate real-device QA.
- The current YouTube Audio tool remains disabled. AI Mix remains planned.

## QA

`npm test && npm run build`

Smoke test: upload a WAV, click/drag waveform, zoom and pan, mark IN/OUT, toggle LOOP, verify playback seeks and loops, switch to Loop Cutter and Sample Slicer, confirm export unaffected. Disable Snap before precise manual sample cut if source beat phase is not zero.
