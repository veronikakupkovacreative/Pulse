# PULSE Studio — AI Master 2026-11-02 integration

This change preserves PULSE Studio's existing tool IDs, category structure, waveform transport, audio engine and site design. Four new modules retain their exact requested names:

- AI Voice Cleaner: local high-pass / gate fallback; neural voice isolation via protected ElevenLabs proxy when configured.
- Speech Enhancer: locally processed EQ, compression, and tonal presets; optional neural pre-cleaning when configured.
- Voice Cloning: explicit authorization and protected ElevenLabs create/TTS/delete operations. Requires backend credentials.
- Advanced Music Visualizer: FFT, spectrum, mirror, oscilloscope, stereo scope, particle modes, visual presets, PNG output, supported realtime video/audio capture.

## AUTO settings

Audio Converter defaults to format-aware values: 44.1 kHz music sample rate, MP3 320 kbps, AAC/M4A 256 kbps, WMA 192 kbps, WAV 24-bit PCM, Vorbis Q6 and FLAC compression level 5. Users can explicitly choose Original source sample rate or manual settings. Resample & WAV uses AUTO 44.1 kHz; File Size Calculator uses AUTO 320 kbps. Visualizer defaults to AUTO 2048 FFT at 1920 × 1080, and Normalizer's AUTO profile is −1 dBFS / 24-bit WAV.

## Protected cloud setup

The deployment must have **server-side** `ELEVENLABS_API_KEY` and `PULSE_AI_GATE_TOKEN` environment variables configured in the Vercel project. The token is not a customer authorization system and **must not** be inserted in frontend bundles, source control, screenshots or any public website text. Local modes remain usable without these variables. Cloud actions cannot be declared operational until credentials and third-party calls are verified. For public billable access, implement user authentication, quotas, billing rules and data processing disclosures.

The server endpoint restricts uploads to 2.4 MB and responses to 4 MB; requests are synchronous, protected by an owner-only access token and same-origin checks.

## Deployment verification

Run `npm test && npm run build`. Verify live category navigation changes the exact tool heading, description and usage steps. Manual browser smoke-test representative conversion profiles, local voice DSP, visualizer playback and WAV export. Cloud ElevenLabs calls require protected credentials and explicit authorization.