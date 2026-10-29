# PULSE Studio 3.6 — Lifetime Access + FREEFOREVER

**Commercial model: $1 USD ONE TIME, not recurring subscription.** The only accepted promo code is `FREEFOREVER`, which grants 100% discount, with no Stripe checkout needed. Free redemptions are unlimited unless an explicit quota is later implemented. Do not market this as an undisclosed limited-use coupon.

## Architecture

- Public `public/index.html` is a responsive PULSE splash screen with 3x3 circles and original #FF2B20 / #F5F4F0 / #191919 identity. It contains no DSP bundle.
- Audio application is bundled to `private/studio.html`. Vercel's `api/studio.js` streams it **only after** Supabase JWT session validation and database entitlement lookup.
- Access is bound to Supabase Auth user ID and persisted in `pulse_entitlements`; refreshable HttpOnly cookies enable returning users to log in again by e-mail. No `localStorage` payment shortcuts.
- Promo redemption checks only the literal `FREEFOREVER` on the server, after login. Fraud/coupon usage is not limited and the code can be shared.
- Stripe Checkout uses `mode=payment`, currency USD, 100 cents. A redirect is **not** proof of purchase; only validated webhook events call the transactional SQL RPC to create/revoke the entitlement.
- A refund / dispute revokes access for the matching payment intent. Webhook event IDs are deduplicated; refund-before-checkout is handled using revocation records.
- Existing BPM, Key Finder, 808 Tuner, cutter, slicer, converter, Smart Master, sound preview and exports remain as they were in v3.5. Disabled YouTube and AI Mix remain disabled.

## Required setup before production activation

1. Create a Supabase project. In **SQL Editor**, execute `docs/lifetime-access-schema.sql` once. Verify tables and RPC exist. Keep RLS enabled.
2. Configure Supabase Authentication -> Email OTP / magic-link template to send the `{{ .Token }}` verification code, not only a clickable link. This app expects a numeric token.
3. Create a Stripe account and configure a webhook to `https://YOUR-DOMAIN/api/stripe-webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`. Use live keys only after completing tests with Stripe test keys and Stripe CLI.
4. In Vercel project Settings -> Environment Variables set:
   - `SUPABASE_URL`: HTTPS origin `https://<project>.supabase.co`
   - `SUPABASE_ANON_KEY`: Supabase Auth public/anon API key (server-only in this implementation)
   - `SUPABASE_SERVICE_ROLE_KEY`: **SECRET**, server-only; never expose to client
   - `STRIPE_SECRET_KEY`: **SECRET** `sk_test_...` for testing, later `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET`: **SECRET** `whsec_...` from the exact webhook endpoint
   - `PULSE_SITE_URL`: exact public URL `https://yourdomain.com` (no trailing slash)
5. Verify a free-code signup, invalid code rejection, $1 Stripe test checkout, duplicate webhook replay, refund and revoked entitlement before allowing a real customer to pay.

**Warning:** Without credentials and database migration, the start screen is visible but auth and checkout intentionally fail closed. Do not merge to `main` / replace the live deployment until the credential setup is complete and verified. Stripe payments will **not** be processed simply by committing this code.

## Development notes

```sh
npm test
npm run build
python3 -m http.server 8080 --directory public
```

The static `python3` preview displays the public splash design, but **cannot** simulate Supabase or Stripe endpoints. Test API handlers in a Vercel preview deployment with configured environment variables; use `vercel dev` for local integration after setting `.env.local`. Browser-cookie auth is separate from entitlement DB status. Supabase OTP delivery is subject to its email rate limits and SMTP configuration.

Production notes: define terms for lifetime access ('for as long as PULSE Studio operates'), privacy policy, refund rights and taxes/VAT before going live. Stripe charges standard fees; $1 microtransactions may yield a small net payment.
