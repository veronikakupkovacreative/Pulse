# PULSE Studio 3.4 — Producer Polish

Base: PULSE Studio 3.3 source package. This is a new, self-contained build, **not** a production deployment.

## Function upgrades

1. **BPM Analyzer:** validated manual BPM input in range 20–400, 0.1 BPM increments, retained x2/÷2/reset, explicit sync button to fill BPM Calculator, Loop Cutter, Pitch & Time, and beat grid. No implicit audio time-stretch.
2. **Waveform transport:** native `AudioBufferSourceNode.loop` for repeat preview, modulo playhead transport. Live Loop Cutter selection edits update native loop boundaries. Native loop avoids a callback restart gap; source discontinuities can still click at nonmatching waveform endpoints.
3. **Loop Cutter:** one-click recurring audition of selected region and exact duration + computed 4/4 bars. Export behavior stays unchanged.
4. **Sample Slicer:** configurable 0, 2, 5, 10 ms end fades for exported WAV slices (default 2 ms). Normal single-slice preview plays once, regardless of any previously active global loop. WAV input/working buffer remains immutable.

## QA

- `npm run build` passed, standalone HTML generated.
- `npm test`: 33/33 passed, including native loop time math, fade source immutability, and bundled-control checks.
- Chromium 1440x900 and 390x844: imported real synthetic 12-second PCM WAV, corrected BPM to 137.5, synced tools, auditioned Loop Cutter, generated automatic slicer markers, and changed anti-click fade. No JavaScript page errors or horizontal page overflow.
- Chromium 1280x900: 1-bar loop repeated for >4 seconds without script errors; downloaded 24-bit WAV from Loop Cutter and Slicer, both parsed successfully as PCM WAV.

## Known limits

- BPM, key, and pitch results remain estimates and need musical verification.
- Native looping is scheduler gap-free in Web Audio but source discontinuities at loop boundary can still be audible. The export fades can also create audible amplitude dips if used on long sustained loops.
- Sample fades are baked into *exported slices*, not non-destructive preview processing.
- Safari/macOS/iOS, long source files, and cross-browser MP3 encoding still require separate real-device tests.
- YouTube Audio remains disabled. AI Mix remains a future placeholder. No payment gating was enabled.
- This ZIP does not change Vercel, GitHub or any external backend.
