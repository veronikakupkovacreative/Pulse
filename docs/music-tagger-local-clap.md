# PULSE Music Tagger — local CLAP AI (experimental)

This replaces Audial Music Tagging with on-device zero-shot CLAP inference.

## Privacy
- Music Tagger does not call an audio-processing API, including Audial.
- Audio never leaves the browser. It downsamples or resamples a 2–10 s mono excerpt to 48 kHz and transfers it to a same-origin Web Worker.
- Model files (~160 MB quantized weights plus runtime assets) download from Hugging Face on first use; the model cache may be reused.
- No stems or stem-level tags are generated. Instrument tags refer to the full mix.

## Model and licenses
- LAION CLAP: https://huggingface.co/laion/clap-htsat-unfused — Apache-2.0.
- Browser ONNX conversion: https://huggingface.co/Xenova/clap-htsat-unfused.
- Pinned browser runtime: @xenova/transformers@2.17.2, with local ONNX WASM assets.
- Relative similarity rankings are not calibrated probabilities.

## QA
Run npm install, npm test, npm run build, then node tests/browser/music-tagger-smoke.mjs after installing Playwright.
The Chromium smoke test uses a fake model runtime to verify UI, Worker communication and privacy; it is not a test of real pretrained weights.
Before releasing: test the first full model download and actual ONNX inference on several known tracks in current Chrome/Safari and mobile hardware.
Do not describe a mocked model response as real classification accuracy.

Existing Audial mastering and MusicGPT Voice Changer are separate tools and are not changed by this refactor.
