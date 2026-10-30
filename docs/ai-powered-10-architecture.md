# PULSE · AI-powered audio modules — implementation contract

## Product rule
A module is labeled "AI-powered" **only** if it performs real learned-model inference on the uploaded audio, or uses a learned model to recommend processing parameters based on audio-derived features. The latter must be labeled "AI-assisted DSP", not "neural audio processing". Deterministic BPM detection, Web Audio nodes, preset sliders and heuristic analysis alone never meet this criterion.

## Architecture
- Browser editor: source/index.html + source/app.mjs + source/tools.mjs. Preserve approved design, shared audio workspace, Undo/Redo, waveform and all existing tabs.
- Local AI inference: existing ONNX Runtime Web + Web Worker Demucs; use dedicated Workers, lazy-download, resource budgeting and cancellation.
- Cloud inference: separate authenticated AI processing service, with user-configurable providers, job IDs, upload size limits, consent, failure states and immediate expiration/deletion. No API secrets in frontend. Do not deploy inference work to a static Vercel frontend.
- AI results produce parameter suggestions or separate audio buffers. Users preview A/B and explicitly Apply; retain original unchanged. Display model name/version and distinguish local/cloud.

## Module requirements and acceptance criteria
1. **Separate into Stems** — existing Demucs ONNX worker, four stems vocals/drums/bass/other, cancellation, validation and individual stem export. Neural inference implemented in existing architecture; runtime QA required.
2. **Auto-Tune/Pitch Correction** — neural f0 estimator (e.g. CREPE/torchcrepe or another trained compatible model) + pitch-preserving correction engine, key/scale, natural/hard controls, confidence and A/B. Existing monophonic autocorrelation/granular code is a DSP-only fallback, not an AI implementation.
3. **Chorus/Phaser/Flanger** — learned music-context classifier or parameter-recommendation model selecting LFO rate/depth/wet mix, with editable settings; Web Audio renders selected modulation. Model must be backed by real inference, not heuristics.
4. **Time-Stretch/Match BPM** — tempo/beat tracking with learned beat model and a validated pitch-preserving stretching algorithm. Update actual timeline clip duration and preserve project BPM metadata.
5. **Sidechain Compressor** — trained instrument/transient classification to select detector/target and envelope settings, with true sidechain detector path and threshold/ratio/attack/release; no conflation with ordinary automation/ducking.
6. **Clip Volume & Pan** — learned source separation or sound-stage analysis for gain/pan suggestions; per-clip GainNode/StereoPannerNode chain, editable waveform clip control, Undo/Redo.
7. **Custom Plug-ins** — model-backed recommendations for chain composition and settings plus an explicit trusted-plugin registry. Never execute arbitrary uploaded JS by default; sandbox and authorization required.
8. **Help / Shortcuts** — genuinely functional C/M/?/Esc, and optional model-driven personalized shortcut recommendations. Static keyboard handling does not become AI merely by labeling it.
9. **Transient Shaper / De-Esser** — learned drum/vocal/sibilance detection yields attack/sustain/threshold targets, deterministic real-time processing applies them, with manual override.
10. **Normalize / Export** — learned content-class/target recommendation, actual peak/BS.1770 integrated LUFS and true-peak measurement with ceiling; include measured output values. Target suggestions can be AI-assisted, normalization math remains DSP.

## Deployment gate
- No 'AI-powered' labels without a configured, tested trained-model inference path.
- Tests: model-unavailable fallbacks, abort, stale generation, long track and memory limits, audio samples finite and bounded, latency, channel count, clip durations, audio A/B, peak and LUFS.
- Current deployment reference: 7d4a285458081df6abff5b6078a39e608b344006 (known READY production).
- Do not replace production until automated tests pass, staging is READY, and at least one representative audio fixture has been tested through each new AI pipeline.
- Required infrastructure still missing: selected trained models for features 2–10, model rights/licensing, inference worker/server capacity, production credentials, and service URL.
