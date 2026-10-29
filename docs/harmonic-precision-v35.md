# PULSE Studio 3.5 — Harmonic Precision

### Key Finder
- Range: whole file, 12-second selection starting at current playhead (clamped at EOF), or a currently enabled LOOP IN/OUT region.
- A selected loop must contain at least 2 seconds for the key analyzer.
- Long tracks use three musically spaced windows inside the selected range; shorter ranges use one window.
- Stereo selection uses the louder channel to avoid mid-channel cancellation. The selected input is still a rough chroma model, not guaranteed key detection, especially with percussion, modulations or ambiguous chords.
- Key Finder result displays the exact analyzed range and alternatives.

### 808 Tuner
- Modes: two seconds from the cursor, whole audio (first six seconds scanned), or enabled LOOP. At least 130 ms must remain after optional attack skip.
- Attack skip: 0 / 30 / 60 / 100 / 150 ms. Recommended default is 60 ms for 808 tails.
- Shows nearest detected note, frequency, cents, confidence and the RMS spread in cents of stable frames. A changing pitch sweep may yield an uncertain reading.
- Target note is generated dynamically for detected MIDI ±12, and manual transpose/fine-tune remain editable. The signal is pitch-shifted by `targetMidi - detectedMidi - detectedCents/100` semitones; automatic cent correction is disabled at low confidence.
- Apply pushes existing workspace Undo state; export creates 24-bit PCM WAV. No original file is overwritten.

### QA / known limitations
- 38/38 automated Node tests passing, including new range and note math tests.
- Real Chromium with 1440×900 and 390×844 viewports: upload, 808 frequency / target selection, Key Finder analysis, no JS page errors or horizontal overflow.
- Transposed 55 Hz A1 source to C2 target: rendered 24-bit WAV with approximately 65 Hz fundamental, close to C2 = 65.41 Hz.
- A minor and C major share notes: a chord-specific key estimate may remain ambiguous. Avoid presenting confidence labels as calibrated probabilities.
- Safari/iOS audio playback and long-file memory usage still need testing on actual devices.

### Files
- `source/dsp/harmonic-workflow.mjs`: range, MIDI target and correction utilities
- `source/tools.mjs`: selection, worker payloads, display and producer controls
- `source/dsp/production-tools.mjs`: stable-window spread metric
- `source/index.html` and `source/style.css`: control UI in existing visual system
- `scripts/build.mjs`: worker/utility self-contained production bundle
- `tests/harmonic-workflow.test.mjs`: boundary and regression checks
