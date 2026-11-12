# PULSE Studio / Essentia.js Song Analyzer — experimental implementation

This experimental branch keeps the existing Producer Toolkit Song Analyzer UI and shared waveform. It adds an **Essentia WASM** engine selector (selected by default in this branch) and preserves the old **Classic** analyzer as an explicit fallback. No audio is uploaded to a server.

## Algorithms

| Feature | Implementation |
| --- | --- |
| BPM | Essentia.js 0.1.3 RhythmExtractor2013 (multifeature, 40–220 BPM) |
| Real beat markers | ticks from RhythmExtractor2013 shifted into the original waveform timeline |
| Tempo alternatives | Clustering returned estimates, plus half/double-time interpretation |
| Rhythm confidence | Qualitative heuristic from raw Essentia confidence and number of measured ticks; NOT a calibrated probability |
| Rhythm stability | Median absolute deviation of measured inter-beat intervals; estimate only |
| Musical key | KeyExtractor bgate profile, with krumhansl and temperley alternative profiles |
| Camelot | Deterministic tonic/mode mapping (including enharmonic notes) |
| Chord timeline | Windowing + Spectrum + SpectralPeaks + HPCP, classified between measured beats with ChordsDetectionBeats |
| Chord confidence | Normalized chord-algorithm strength, NOT a calibrated accuracy probability |
| Waveform grid | AudioWorkspace.setMarkers() receives measured ticks within the analyzed region only |

## Worker and privacy architecture

- source/modules/essentia-client.mjs validates source, picks the user-selected region or a centered 90-second window, copies input channels and starts a cancellable classic Web Worker.
- source/modules/essentia-worker.mjs imports pinned same-origin Essentia WASM/runtime assets with importScripts and loads the pure DSP engine module. Separate Worker instances run rhythm then harmony using measured beat ticks.
- source/modules/essentia-algorithms.mjs contains actual Essentia DSP calls, key mapping and normalized results.
- scripts/build.mjs copies the same-origin Essentia WASM, UMD core, Worker entrypoint and upstream LICENSE into /vendor/essentia/. The Worker must live alongside the WASM because Emscripten resolves the binary relative to the Worker script location. No runtime CDN or API credentials.
- Analysis is confined to at most 90 seconds; Shift-drag on the waveform selects a region. Measured markers never silently extend to the unanalyzed parts of a longer song.
- Half-time uses every other measured tick. Double-time inserts clearly identified interpolated midpoint subdivisions. Other tempo candidates do not fabricate uniform markers.
- Only the shared AudioWorkspace buffer is used; it is never modified by analysis. Workers terminate on completion or cancellation.

## Benchmarks and limits

Automated WebAssembly tests use synthetic percussion at 70, 140, 80 and 160 BPM, a 48 kHz fixture, C major sine triads and chord timeline boundaries. These synthetic tests are not accuracy claims for real master recordings, syncopation, swing or tempo changes.

The 90-second cap is a deliberate bounded-memory choice, not full track coverage. A four-minute track has measured ticks only in the analyzed region, or the selected region.

## AGPL-3.0 compliance / release gate

Essentia.js 0.1.3 is AGPL-3.0. This branch redistributes its WASM and UMD runtime with the upstream license. Source code for the experimental integration is published in GitHub. This is NOT a legal conclusion that PULSE has met all copyleft/network obligations. DO NOT MERGE into a closed-source commercial production release without AGPL compliance review or an appropriate alternative license from the authors.

The branch is experimental until license review and browser/audio QA.

## Test and review

Run npm install, npm test, npm run build.

Manual QA should include desktop Chrome, Safari and mobile; 44.1/48kHz imports; four-minute songs; 25-second user-selection; cancellation; 70/140 and 80/160 comparisons; measured tick alignment; chords compared with known musical recordings.
