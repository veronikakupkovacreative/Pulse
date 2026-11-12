/**
 * Netlify adapter for existing PULSE Node API handlers.
 *
 * Netlify's modern Web Request/Response functions preserve all the
 * owner-gated Vercel handler contracts without moving API keys into
 * public/ or the browser. Only seven explicitly allowed /api/* names
 * are exposed. A single function keeps provider logic in one source.
 *
 * Secret values are configured in Netlify's site environment under
 * Functions scope; never store credentials in Git or netlify.toml.
 */
import pulseAI from '../../api/pulse-ai.js';
import pulseLyrics from '../../api/pulse-lyrics.js';
import pulseMastering from '../../api/pulse-mastering.js';
import pulseMediaSource from '../../api/pulse-media-source.js';
import pulseMusicGPT from '../../api/pulse-musicgpt.js';
import pulseStems from '../../api/pulse-stems.js';
import pulseYoutube from '../../api/pulse-youtube.js';

export const config = {path: '/api/:endpoint'};

const API_ROUTES = Object.freeze({
  'pulse-ai': pulseAI,
  'pulse-lyrics': pulseLyrics,
  'pulse-mastering': pulseMastering,
  'pulse-media-source': pulseMediaSource,
  'pulse-musicgpt': pulseMusicGPT,
  'pulse-stems': pulseStems,
  'pulse-youtube': pulseYoutube
});

const MAX_INPUT_BYTES = 5_200_000;

function json(status, payload) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function createExpressLikeResponse() {
  let code = 200;
  let sent = false;
  let payload = null;
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  const output = {
    setHeader(name, value) {
      headers.set(name, String(value));
      return this;
    },
    getHeader(name) {
      return headers.get(name);
    },
    status(value) {
      code = Number(value);
      return this;
    },
    writeHead(value, extra = {}) {
      code = Number(value);
      for (const [key, val] of Object.entries(extra)) headers.set(key, String(val));
      return this;
    },
    json(value) {
      sent = true;
      headers.set('Content-Type', 'application/json; charset=utf-8');
      payload = JSON.stringify(value);
      return this;
    },
    send(value) {
      sent = true;
      if (value == null) payload = '';
      else if (typeof value === 'string' || value instanceof Uint8Array || value instanceof ArrayBuffer) payload = value;
      else {
        headers.set('Content-Type', 'application/json; charset=utf-8');
        payload = JSON.stringify(value);
      }
      return this;
    },
    end(value) {
      sent = true;
      payload = value == null ? '' : value;
      return this;
    },
    toResponse() {
      if (!sent) return json(500, {error: 'API_HANDLER_RETURNED_NO_RESPONSE'});
      // Prevent accidentally caching security-sensitive configuration checks.
      headers.set('Cache-Control', 'private, no-store');
      if (code === 204 || code === 304) return new Response(null, {status: code, headers});
      return new Response(payload, {status: code, headers});
    }
  };
  return output;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const endpoint = url.pathname.replace(/\/+$/, '').split('/').pop();
  const selected = Object.hasOwn(API_ROUTES, endpoint) ? API_ROUTES[endpoint] : null;
  if (!selected || !url.pathname.startsWith('/api/')) {
    return json(404, {error: 'UNKNOWN_API_ROUTE'});
  }

  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const headerBytes = Number(request.headers.get('content-length') || 0);
    if (headerBytes > MAX_INPUT_BYTES) return json(413, {error: 'REQUEST_BODY_TOO_LARGE'});
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) {
      return json(413, {error: 'REQUEST_BODY_TOO_LARGE'});
    }
    if (raw.length) {
      const mime = (request.headers.get('content-type') || '').toLowerCase();
      if (!mime.includes('application/json')) return json(415, {error: 'JSON_ONLY'});
      try { body = JSON.parse(raw); }
      catch { return json(400, {error: 'INVALID_JSON'}); }
    }
  }

  // The legacy handlers use req.headers.host to verify same-origin requests.
  // Construct it from the trusted incoming Request URL, not a user input field.
  const headers = Object.fromEntries(request.headers.entries());
  headers.host = url.host;

  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body,
    query: Object.fromEntries(url.searchParams)
  };
  const response = createExpressLikeResponse();
  try {
    await selected(req, response);
    return response.toResponse();
  } catch (error) {
    // Never echo upstream exceptions, environment values or credentials.
    console.error('PULSE Netlify API route failed:', endpoint, error?.name || 'Error');
    return json(500, {error: 'PULSE_API_UNAVAILABLE'});
  }
}
