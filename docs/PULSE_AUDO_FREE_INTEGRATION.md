# Audo.ai Free Preview — PULSE Studio

Current integration has no browser API keys and **never bills Audo credits**.

Audo's current Free API endpoints:
- `POST https://audo.ai/api/try/remove-noise` — non-generative speech cleanup
- `POST https://audo.ai/api/try/enhance-voice` — speech restoration (can alter original timbre)
- `POST https://audo.ai/api/try/key-bpm` — independent BPM/key estimate
- `POST https://audo.ai/api/try/sound-effect-generator` — text-to-SFX preview (up to 10 seconds)

Server proxy: `api/pulse-audo.js`, free trial only.
- No `AUDO_API_KEY`: unauthenticated Audo Free API, quota-based; no paid action possible.
- With a server-only `AUDO_API_KEY`: every request explicitly sets `free=true`. Never omit `free` or send `free=false`.
- The server requires same-origin requests and explicit consent. New submissions must use `POST /api/pulse-audo?trial=1`. The Vercel WAF rule `PULSE / Audo free API protection` limits **3 new trial requests per IP / 10 min**. Job status polling does not consume the submission quota.
- Browser uploads are capped at 2.4 MB (Vercel ingress). Current edited SOURCE AUDIO is encoded as a short clip. Song Analyzer uses a maximum 20-second excerpt if the original file is large or altered; Vocal Cleanup uses up to 12 seconds. A small unmodified original may be sent whole if no selection is active.
- The key/BPM result is an **independent estimate**; never replace the local beat grid silently.
- Audo's daily free quota may be shared across Vercel IPs and may be depleted by other users. Audo's output links expire. The UI must explain partial/short excerpts.
- Audo's documentation says an unkeyed response may return immediate JSON/audio or 202 with a tokenized status URL. Status polling validates the Audo origin and job path to prevent arbitrary URL proxying. Binary outputs are limited to 3 MB by this gateway.

Before offering full-length commercial processing:
1. Create a server-only Audo account key, durable per-user identity and quotas.
2. Use Audo's quote and an approved positive max_credits per job, plus a global spend cap and monitoring.
3. Use resumable direct storage uploads for files larger than 2.4 MB.
4. Conduct end-to-end browser testing with representative music, dry vocals and speech; never call a short speech enhancement a full-track mix processor.
5. Verify costs and terms at https://audo.ai/docs/api before enabling paid processing.
