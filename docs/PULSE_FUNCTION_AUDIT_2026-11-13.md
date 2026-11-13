# PULSE / Function audit / 13 November 2026

Scope: 17 visible tools; startup and navigation smoke tests, offline algorithm tests, mocked API contract tests and Vercel Preview build. Status **tested** means automated tests pass; it does not claim a real browser listening session or paid MusicGPT job.

| Tool | Automated checks | Open limitations |
| --- | --- | --- |
| Song Analyzer | BPM, tonal analysis, beat-grid and UI tests | Compare unusual real-world tempo and key estimates by ear |
| Music Tagger | Local measurements, worker and CLAP integration checks | Browser downloading first-use ML model (~160 MB) not reverified |
| Audio Editor | Cut/merge/fade/reverse/undo tests; UI mounts | Manual playback and source-codec smoke still recommended |
| Audio Converter | Codec/format, bitrate, source validation tests | Actual per-browser FFmpeg encode not reverified |
| AI Mastering | DSP, presets, reference matching, A/B and UI tests | True-peak/LUFS values remain estimates; paid cloud option removed |
| Stereo Lab | Mid/side and linked stereo DSP tests | Listening/mono compatibility check recommended |
| Vocal Studio | Local enhancement/doubler tests and protected Voice Changer API mocks | Paid external Voice Changer conversion not executed |
| Beat Lab | Rhythm, loop export and source-change invalidation review | Real-beat accuracy depends on source rhythm |
| Mix Assistant | Summing, gain, stereo render and control tests | Listening to gain suggestions recommended |
| Audio Repair | Spectral noise reduction, profiles, safe limits and worker tests | Avoid overprocessing and audition |
| Pitch & Time | Worker, duration, stereo stability and parameter validation tests | Strong pitch/tempo changes may cause artifacts |
| Smart FX | Rack, chorus, flanger, sidechain and safe-preset tests | Audio listening check recommended |
| Lyrics Generator | Owner gate, consent, API mocks; key scoped to production and preview | Real MusicGPT response and credits not tested |
| AI Music Generator | Two-output v1 MusicAI API mocks, polling, owner gate | Real provider generation and credits not tested |
| Watermark Cleaner | WAV, MP3, FLAC, M4A metadata and text tests | Does not remove acoustic AI watermarks |
| Stem Extraction | Owner gate, multipart v2 API, 23 stem options, polling, URL validation, duplicate-submit prevention | Real paid separation not executed; full songs via supported YouTube URL |
| Audio Visualizer | Mode selection, waveform and visualizer integration tests | Browser media export capability varies |

## Changes

- Live tool list: 17 tools in five areas; all 17 can be mounted from the shell without initialization errors in DOM automation.
- Protected MusicGPT keys for Voice Changer and Lyrics now scoped to **Production + Preview**, without disclosing their values.
- Prevented rapid double click from sending duplicate Extraction charges while a file is loading.
- Extraction now recognizes provider direct-link results and returns a terminal status on a completed job lacking output links.
- Beat Lab analysis invalidates on source load, clear, undo, redo or commit, avoiding stale loops.
- Removed the duplicate “Why this tool” content block, replaced mandatory three-step instructions with collapsed help, and shortened 17 tool summaries and selected module descriptions.
- No paid API calls were made by this audit.

QA: Preview tests **281 passed, 0 failed**, build READY at commit `26378bc`. Production should be validated separately after deploy.
