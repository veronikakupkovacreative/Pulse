# PULSE 3.1 — Smart Master v1 & Toolkit Categories

## Deliverable

Phase 2 is preserved. All existing DSP and UI features remain present. A separate `AI STUDIO` category contains one fully working **Smart Master v1**. **AI Mix is explicitly planned, not enabled**, as genuine multi-track mixing needs a dedicated track/channel workflow. YouTube Audio is visibly disabled / Coming Soon. No live billing or faux `localStorage` paywall is added.

### Grouped tools

- **ANALYZE:** BPM Analyzer, Tap Tempo, Key Finder, 808 Tuner, BPM Calculator.
- **EDIT:** Loop Cutter, Pitch & Time, Sample Slicer, Audio Reverse, Silence Trimmer.
- **EXPORT:** Audio Converter, Audio Normalizer.
- **AI STUDIO:** Smart Master v1; AI Mix (planned).
- YouTube Audio stays **Coming Soon** and disabled.

### Smart Master v1 implementation

1. Decode existing WAV / MP3 through the same file input and working audio buffer as the toolkit. No server uploads.
2. Compute real peak, RMS, crest factor, and K-weighted gated integrated LUFS. Estimate low / high balance for conservative EQ recommendations.
3. Choose Balanced, Warm or Loud; optionally customize target integrated LUFS (−22 to −8). Suggested EQ shelves are capped to ±1.5 dB.
4. Run two shelving biquads, linked stereo dynamics compression, loudness gain and a 3 ms look-ahead sample-peak limiter in a Web Worker.
5. Show measured BEFORE and AFTER loudness, output sample peak, and applied EQ adjustments.
6. A/B audio playback with optional *attenuation-only* loudness matching. Playback level adjustment NEVER changes export data. Playback restarts from the beginning when switching A/B.
7. Apply the generated audio to the existing Shared Audio Workspace (undo / redo / reset to original) or export a real WAV 24-bit PCM.

The source and output are always distinct Float32 arrays; the source buffer is not mutated. The worker receives cloned channel buffers via transferable objects. The program limits the mastering input to 30 million PCM samples (approximately 5 minutes stereo at 48 kHz) to constrain memory usage in the browser.

### Important limitations

- **This is adaptive DSP, not a trained neural AI model.** It is presented transparently as Smart Master v1 inside AI STUDIO. It should never be advertised as neural AI mastering.
- Ceiling is **sample-peak**, not certified inter-sample true peak. No 4x oversampled true-peak measurement, multiband compression, ML reference matching or perceptual mastering model yet.
- Target LUFS is not guaranteed. The output is measured after limiting; the display always reports the actual result instead of falsely claiming the selected target was reached.
- UI only supports 1 mono or stereo track, not genuine multi-track AI mixing. AI Mix requires a distinct aligned-stems source model and mixer.
- Master quality is intended as a starting point. A/B evaluation by ear remains essential.
- Browser automated QA is Chromium; Safari and real-world commercial track validation are still recommended.

### QA performed

- `npm test`: 42/42 pass, including tests for mono/stereo, non-mutation, limiter ceiling, LUFS output, presets, invalid input, and category navigation.
- `npm run build`: standalone HTML build passes.
- Chromium browser smoke with synthetic stereo WAV (44.1 kHz, 3 seconds) on desktop 1440px and mobile 390px: category navigation, upload, Generate Master, A/B, export 24-bit PCM WAV (validated with Python wave), and no JS errors / horizontal overflow.
- UI screenshots in `docs/qa-ai-desktop.png`, `docs/qa-ai-mobile.png`.

### Run

```bash
npm test
npm run build
python3 -m http.server 8080 --directory public
```

Open `http://localhost:8080`. No extra Python server, API key, GPU or external service is required for Smart Master. The original hosted YouTube extraction remains disabled. The public production deployment is unchanged unless this branch is merged.
