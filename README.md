# PULSE STUDIO 3.5 — Harmonic Precision

Producer polish following 3.4. The original PULSE visual identity, navigation, audio editing tools, Vercel standalone deployment structure and offline browser audio processing remain unchanged.

## What changed

- **Key Finder**: analyze entire track, 12 seconds starting at the playhead, or enabled LOOP IN/OUT selection; inspect precisely which range was analyzed. Uses the channel with stronger musical energy to avoid phase cancellation in stereo when estimating key. Chroma matching remains an estimate, not statistical certainty.
- **808 Tuner**: analyze 2 seconds from the cursor, up to the first 6 seconds of the file, or enabled LOOP; optionally ignore the first 0/30/60/100/150 ms of attack to focus on the tail. Shows dispersion in cents across stable detection windows, not just a confidence label.
- **Tuning controls**: after detecting a note, choose a target MIDI note within ±12 semitones, with calculated transpose and cent correction. Fine-tune manually using the separate cent slider. If confidence is low, automatic cent correction is deliberately disabled.
- **Non-destructive workflow**: existing preview, apply/undo and WAV export remain. All audio analysis and tuning still happen locally in the browser.

## Tests

```sh
npm test
npm run build
```

The self-contained production file is `public/index.html` (also mirrored as root `index.html`). No server-side audio processing is required for these features. A real-browser Chromium smoke test covered desktop and mobile, sustained A1 (55 Hz) pitch detection, A1→C2 (+3 semitones) output (65 Hz peak), and C-major harmony analysis. **Safari has not been manually verified.** See `docs/harmonic-precision-v35.md` for detail.

---

# PULSE STUDIO 3.4 — Producer Audio Toolkit

Static, browser-based producer toolkit. Based on the latest available **PULSE 3.2.1** source snapshot, with its original visual identity preserved. The HTML is fully self-contained, with separately editable `source/` and a reproducible bundler.

## Previous release: 3.3

- Waveform timeline ruler + visible transport playhead.
- 1×, 2×, 4×, 8× zoom, pan and playback auto-follow.
- Preview loop using IN / OUT points and LOOP ON/OFF.
- Optional file-relative BPM beat snapping.
- Keyboard support: `Space`, arrows, Shift+arrows, `Home`, `End`, `I`, `O`, `L`, `+`, `-`.
- Preserves Sample Slicer shift-click and Loop Cutter's selection controls.

See [`docs/waveform-v33.md`](docs/waveform-v33.md) for behavior and known limits.

## Existing tools preserved

BPM Analyzer, Tap Tempo, Key Finder, 808 Tuner, BPM Calculator, Loop Cutter, Pitch & Time, Sample Slicer, Reverse, Silence Trim, Converter, Normalizer and local Smart Master. The 'AI Mix' card is still planned, not implemented. YouTube Audio remains visibly disabled.

## Run and test

Requires Node.js 20+ for development; no npm dependencies are needed for the local audio toolkit.

```bash
npm test
npm run build
python3 -m http.server 8080 --directory public
```

Open `http://localhost:8080` in your browser, load a WAV/MP3 track and inspect the Producer Toolkit. You can also open the root `index.html` as a self-contained web page.

## Deploy to Vercel

Import this folder/repository, set Framework Preset to **Other**, Build Command to `npm run build`, Output Directory to `public`. The included `vercel.json` supplies the same settings. Deploying to a new preview deployment is safer than replacing the existing production site immediately.

This package intentionally excludes the optional older cloud YouTube backend. YouTube Audio is not enabled, and no third-party credentials are required for the active local audio tools. MP3 encoding may load the external lamejs encoder on demand.

## Important accuracy notes

- Beat Snap is anchored to file time 0, not automatically detected downbeats.
- Preview looping now uses native Web Audio buffer looping, with transport wrap. Audio at mismatched in/out endpoints can still click; enable fades or edit boundaries when exporting.
- Smart Master uses local deterministic DSP; AI Mix is not implemented.
- Vercel deployment was **not** changed by producing this ZIP. Verify compatibility before deploying.


## What's new in 3.4

- **BPM Analyzer:** precise manual BPM correction (20–400; 0.1 precision), retained half/double/reset actions, and an explicit **Použít v toolkitu** action. That action populates Loop Cutter, Pitch & Time and BPM Calculator and updates the visual beat grid. It does not automatically time-stretch the audio.
- **Waveform/Loop preview:** native `AudioBufferSourceNode.loop` replaces repeatedly spawning a new Web Audio source at every boundary. The visual playhead follows the loop position using modulo time. Native browser looping avoids scheduling gaps but does **not** automatically crossfade the material at loop boundaries; non-matching endpoints may still click.
- **Loop Cutter:** audition the current in/out selection repeatedly using the shared transport, with visible exact loop length and equivalent bars at the selected BPM.
- **Sample Slicer:** optional 0/2/5/10 ms edge fades on exported slices (default 2ms). The original audio stays unmodified. Turn fade off when a sample needs sample-accurate untreated edges.

No new AI models, paid features, server processing, or changes to the original color system. YouTube is still disabled. `npm test && npm run build` confirms current static tests. Verify Safari and real full-length source tracks separately before production deployment.

---

# PULSE Studio 3.6 — Lifetime Access Startscreen + FREEFOREVER

New protected public start screen, preserving PULSE branding. Price: **$1 USD one-time lifetime access**, *not a monthly subscription*. The only valid coupon is **FREEFOREVER**, which unlocks access free. Users log in with Supabase e-mail OTP. Stripe verified webhook grants paid entitlements, refund/dispute webhook revokes them. Public `index.html` displays only the start screen; server function `/api/studio` serves the audio app from non-public `private/studio.html` after entitlement verification.

**Not yet live**: configuration requires your own Supabase project, Stripe account, secrets, SQL migration and full payment lifecycle QA. Without these, both payment and promo redemption fail closed. See `docs/lifetime-access-v36.md`. No real payments have been run in this development environment.
