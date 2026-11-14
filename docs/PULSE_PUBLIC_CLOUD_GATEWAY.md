# PULSE public MusicGPT cloud gateway

MusicGPT provider credentials remain in **Vercel server-only environment variables**:
`MUSICGPT_LYRICS_API_KEY`, `MUSICGPT_MUSICAI_V2_API_KEY`, `MUSICGPT_API_KEY`, `MUSICGPT_EXTRACTION_API_KEY`.
Clients never receive any provider key or owner token.

Enable public processing with `PULSE_PUBLIC_CLOUD_ENABLED=true` on Production and Preview, **only after** the Vercel WAF rule is active. When disabled, all four cloud APIs report `configured:false` and POST fails closed.

Vercel Firewall custom rule: `PULSE / MusicGPT credit protection`
- Path regex: `^/api/pulse-(extraction|lyrics|musicai-v2|musicgpt)$`
- Method: `POST`
- Query param: `charge=1`
- Rate limit: fixed window, **3 requests / IP / 600 seconds**, action HTTP 429.

All four server endpoints explicitly require the exact `?charge=1` URL **for billable actions only**, so removing the query cannot bypass rate limiting. Read-only result checks and the voice catalog do not spend credits and use the same API without that query.

Security notes: IP-based rate limiting is an abuse control, **not user authentication**, and cannot provide a hard global cost ceiling against distributed attackers. Set MusicGPT account-level spend/credit limits or install a durable per-user quota and identity system before offering unlimited public usage. User-facing consent remains mandatory; a timeout must never trigger an automatic paid retry. Monitor Vercel WAF and MusicGPT credit usage. Check service pricing before changing the public limit. The legacy `PULSE_MUSICGPT_OWNER_TOKEN` environment variable is no longer used by these public four API routes and may be removed separately after verifying no other integrations depend on it.
