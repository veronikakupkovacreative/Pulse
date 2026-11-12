# PULSE Studio — Local Stereo/Vocals + Authorized Media Sources

This feature replaces **Stem Separator** with **Stereo Lab** in the eight visible AI Studio tools, and replaces the cloud **Neural Voice Isolator** tab inside Vocal Studio with the local **Vocal Doubler** mode.

## What actually works

- **Stereo Lab (local DSP/Web Worker):** Mid/Side stereo width, adjustable mono-bass crossover, pan, output gain, peak protection, correlation and side/mid measurements. Audio is only committed to the shared workspace after render; Undo is available.
- **Vocal Studio / Vocal Enhance (local OfflineAudioContext):** high-pass, warmth, presence, sibilance smoothing and linked compression; no voice model.
- **Vocal Studio / Vocal Doubler (local DSP/Web Worker):** two modulated delay taps with delay, modulation rate/depth, stereo width and wet mix. This is a chorus-like doubling effect, **not** vocal cloning, automatic pitch correction, stem separation or neural isolation.
- **Video to Audio:** local MP4/MOV/WEBM/MKV-to-MP3/WAV/FLAC/AAC/M4A/OGG via existing FFmpeg WASM, plus newly supported directly accessible HTTPS audio/video URLs. The browser downloads the source only if CORS allows GET; media bytes never pass through PULSE servers.
- **YouTube URL:** video preview only. Direct YouTube video/audio downloading is NOT part of this release.

## Direct authorized file URLs — contract

The URL must:
1. use `https://`, have a public host, and not include a username/password or custom port;
2. address a direct media file with a supported media extension (e.g. `.mp4`, `.mov`, `.webm`, `.wav`, `.mp3`), possibly with time-limited signed query parameters;
3. be permitted for the user to access and convert;
4. return an audio/video or binary file response, **not** a login page, HTML, PDF or playlist;
5. allow cross-origin `GET` through `Access-Control-Allow-Origin` (or be accessible from the same origin);
6. be under 100 MB. The cap is enforced while reading even when the server omits Content-Length.

No cookies are sent to third-party origins (`credentials:'omit'`). HTTP redirects are not followed (`redirect:'error'`), preventing an unexpected destination during signed URL import. If a provider uses redirects, provide a direct final authorized media URL instead. Loading happens only when the user clicks **Import File** after confirming media permission. Only local file bytes are then sent to the FFmpeg WASM encoder.

## Future authorized-provider backend

`api/pulse-media-source.js` is an optional **allowlisted resolver architecture**, not an arbitrary URL-to-media proxy.

- Environment variable `PULSE_MEDIA_ALLOWED_HOSTS`: comma-separated **exact** hosts of approved providers, e.g. `assets.example.com,media.example.org`.
- `GET /api/pulse-media-source` returns capabilities, configuration status and client-side CORS transport.
- `POST /api/pulse-media-source` with `{ "url": "https://approved-host/file.mp4", "consent": true }` checks that source domain is allowlisted and returns the same direct media URL if permitted.
- It **never** streams/proxies remote bytes, bypasses website restrictions or supplies missing authorization. It does not require activation for the browser-only direct import.

For **future provider-specific** media downloading, add providers individually through documented, authorized APIs, check authentication and content rights, obtain signed URLs, and expose those URLs directly to the browser/storage worker; never turn a Vercel function into an open proxy. For video files larger than 100 MB or where CORS is unavailable, design a separate authenticated worker/object-storage flow (Vercel Functions have smaller response limits).

## QA

Run `npm test && npm run build`. Test mono and stereo tracks, mono-bass / width / phase and doubled vocal audition. Verify Undo, output peak and stereo correlation. Test direct CORS media URL + invalid YouTube URL + 100 MB cap, and WAV/MP3 conversion with actual owned media in supported browsers. Automated tests cover DSP math, DOM initialization, URL safety, server allowlist, error handling and build; **manual audio listening and full browser media encode have not been proven by the test suite**.

Production `thepulsestudio.eu` should remain unchanged until the preview is manually checked.
