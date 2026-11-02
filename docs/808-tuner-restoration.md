# 808 Tuner restoration — PULSE Studio

**Historical source:** Vercel preview `pulse-studio-2-jptpr4qdq-veronikas-projects-c6e47f86.vercel.app` maps to Git commit `64482c71d9607f0c24dd6be00b621cfcec23dcec` in `feature/pulse-toolkit-restructure-20261031`.

The original YIN fundamental detector, note/cents converter and WSOLA-based pitch renderer were extracted from `source/dsp/production-tools.mjs` without changing their math and copied into `source/modules/808-tuner-dsp.mjs`.

## Integration

- ANALYZE registers `tuner` / **808 Tuner** in `source/modules/features.mjs`.
- Current SOURCE AUDIO timeline is reused; no second loader.
- Analyze cursor (2s), first 6s or selected timeline range, with attack skip 0–150ms.
- Detect fundamental within 28–260Hz; report note, Hz, cents, confidence, stability.
- Target note ±12 semitones; manual fine tune ±100 cents.
- Preview, Apply with Undo, WAV 24-bit export. Processing runs in an ESM Web Worker.
- DSP and WAV work without an API key or external network.
- This is pitch estimation + deterministic DSP, not a trained AI model.
- Tuned sample rendering is limited to 90s / 12M float samples to prevent excessive memory use.
- The renderer is WSOLA-like and can introduce artifacts on transient-rich/polyphonic tracks.
- Links in the ANALYZE footer and editorial copy were registered.

## Files

- `source/modules/808-tuner-dsp.mjs` — original algorithm + range helper
- `source/modules/808-tuner-worker.mjs` — off-main-thread analysis/render
- `source/modules/808-tuner.mjs` — current workspace adapter and controls
- `source/modules/808-tuner.css` — native PULSE UI
- `tests/808-tuner.test.mjs` — DSP, UI, registry and export regression checks

## Deployment procedure

This feature branch is intended for preview review **before a separate production release**. Run `npm test && npm run build`, open the preview, check A1/C2 sample detection, switch all three analysis ranges, apply ±12 semitone correction, use Undo and export 24-bit WAV. Deploy to production only after visual and audio QA.