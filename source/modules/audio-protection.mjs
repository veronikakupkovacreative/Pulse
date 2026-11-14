/** PULSE Audio Protection v1 — local-first, dependency-free browser DSP. */
const PAYLOAD_BITS = 64;
const PAIRS_PER_BIT = 5;
const MIN_DURATION = 8;
const MAX_DURATION = 20 * 60;
const encoder = new TextEncoder();

function assertAudio(channels, rate) {
  if (!Array.isArray(channels) || !channels.length || channels.length > 2 ||
      channels.some(ch => !(ch instanceof Float32Array) || ch.length !== channels[0].length)) {
    throw new Error('Expected one or two Float32Array audio channels with matching length.');
  }
  if (!Number.isInteger(rate) || rate < 16000 || rate > 192000) {
    throw new Error('Supported sample rate: 16–192 kHz.');
  }
  const duration = channels[0].length / rate;
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    throw new Error('Track duration must be between 8 seconds and 20 minutes.');
  }
}
function assertIdentity(owner, assetId, secret) {
  if (typeof owner !== 'string' || !owner.trim() || owner.length > 120 ||
      typeof assetId !== 'string' || !assetId.trim() || assetId.length > 120 ||
      typeof secret !== 'string' || secret.length < 12) {
    throw new Error('Set an owner, track ID and private passphrase of at least 12 characters.');
  }
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto needs localhost or HTTPS.');
}

async function secretBytes(owner, assetId, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hmac = async label => new Uint8Array(await crypto.subtle.sign('HMAC', key,
    encoder.encode(`PULSE-WM-1\u0000${owner}\u0000${assetId}\u0000${label}`)));
  return { payload: await hmac('signature'), layout: await hmac('layout') };
}
function seededRandom(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let a = view.getUint32(0, true) || 1;
  let b = view.getUint32(4, true) || 2;
  let c = view.getUint32(8, true) || 3;
  let d = view.getUint32(12, true) || 4;
  return () => {
    // sfc32 (noncryptographic PRNG); the input seed is a secret HMAC.
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = (d + 1) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
function fftSize(rate) {
  let size = 8192;
  while (size < 32768 && ((Math.min(6200, rate * .40) - 1350) * size / rate / 2) < PAYLOAD_BITS * PAIRS_PER_BIT + 5) {
    size *= 2;
  }
  if (((Math.min(6200, rate * .40) - 1350) * size / rate / 2) < PAYLOAD_BITS * PAIRS_PER_BIT + 5) {
    throw new Error('Insufficient spectral bandwidth for this file.');
  }
  return size;
}
function layout(rate, size, hmac) {
  const first = Math.ceil(1350 * size / rate);
  const last = Math.floor(Math.min(6200, rate * .40) * size / rate) - 1;
  // Use non-overlapping, neighbouring bins to minimize host-spectrum bias.
  const pool = [];
  for (let i = first; i + 1 <= last; i += 2) pool.push(i);
  if (pool.length < PAYLOAD_BITS * PAIRS_PER_BIT) throw new Error('Audio sample rate is not supported.');
  const random = seededRandom(hmac.layout);
  for (let i = pool.length - 1; i > 0; --i) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const result = [];
  let at = 0;
  for (let bit = 0; bit < PAYLOAD_BITS; bit++) {
    for (let pair = 0; pair < PAIRS_PER_BIT; pair++) {
      result.push({ bit, left: pool[at++], polarity: random() < .5 ? -1 : 1 });
    }
  }
  return result;
}
function bitsOf(payload) {
  return Array.from({ length: PAYLOAD_BITS }, (_, i) => (payload[i >>> 3] >>> (7 - (i & 7))) & 1);
}

/** In-place radix-2 complex FFT. Inverse divides by n. */
function wmFFT(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < (len >> 1); j++) {
        const p = i + j, q = p + (len >> 1);
        const tr = re[q] * cr - im[q] * ci;
        const ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti;
        re[p] += tr; im[p] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function hann(size) {
  const array = new Float64Array(size);
  for (let i = 0; i < size; i++) array[i] = .5 - .5 * Math.cos(2 * Math.PI * i / size);
  return array;
}
function analyseFrame(src, start, size, window, re, im) {
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const at = start + i;
    const sample = (at >= 0 && at < src.length) ? src[at] : 0;
    re[i] = sample * window[i]; im[i] = 0;
    sum += sample * sample;
  }
  if (sum / size < 0.000012) return false; // no watermark over near-silence
  wmFFT(re, im);
  return true;
}
const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Embed keyed 64-bit spectral watermark into local PCM.
 * Not a neural model or a legal certificate. Export result as WAV for best retention.
 * onProgress receives 0..1. signal optional AbortSignal.
 */
export async function embedWatermark({ channels, sampleRate, owner, assetId, secret, strength = .13, onProgress, signal }) {
  assertAudio(channels, sampleRate); assertIdentity(owner, assetId, secret);
  if (!Number.isFinite(strength) || strength < .06 || strength > .20) throw new Error('Strength must be 0.06–0.20.');
  const hmac = await secretBytes(owner, assetId, secret);
  const bits = bitsOf(hmac.payload), n = fftSize(sampleRate), hop = n >>> 2;
  const pairs = layout(sampleRate, n, hmac), win = hann(n);
  const output = [];
  for (let channel = 0; channel < channels.length; channel++) {
    const src = channels[channel], out = new Float64Array(src.length), norm = new Float64Array(src.length);
    const re = new Float64Array(n), im = new Float64Array(n);
    const frameCount = Math.ceil((src.length + n / 2) / hop);
    for (let f = 0; f < frameCount; f++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const start = -n / 2 + f * hop;
      const active = analyseFrame(src, start, n, win, re, im);
      if (active) {
        for (const { bit, left, polarity } of pairs) {
          const sign = (bits[bit] ? 1 : -1) * polarity;
          const a = Math.exp(sign * strength), b = 1 / a;
          const ra = re[left] * a, ia = im[left] * a;
          const rb = re[left + 1] * b, ib = im[left + 1] * b;
          re[left] = ra; im[left] = ia; re[left + 1] = rb; im[left + 1] = ib;
          re[n - left] *= a; im[n - left] *= a;
          re[n - (left + 1)] *= b; im[n - (left + 1)] *= b;
        }
        wmFFT(re, im, true);
      } else {
        // analyseFrame returned time-domain windowed data without taking the FFT.
      }
      const begin = Math.max(0, -start), end = Math.min(n, src.length - start);
      for (let i = begin; i < end; i++) {
        const pos = start + i, w = win[i];
        out[pos] += re[i] * w;
        norm[pos] += w * w;
      }
      if (f % 12 === 0) {
        onProgress?.((channel + f / frameCount) / channels.length);
        await yieldUI();
      }
    }
    const finished = new Float32Array(src.length);
    for (let i = 0; i < finished.length; i++) finished[i] = norm[i] > 1e-9 ? out[i] / norm[i] : src[i];
    output.push(finished);
  }
  let peak = 0;
  for (const ch of output) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak > .99) {
    const gain = .99 / peak;
    for (const ch of output) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  }
  onProgress?.(1);
  return { channels: output, sampleRate, assetId, version: 'pulse-wm-1', peak: Math.min(.99, peak) };
}

/** Check a candidate copy using the same owner + assetId + PRIVATE secret. */
export async function verifyWatermark({ channels, sampleRate, owner, assetId, secret, onProgress, signal }) {
  assertAudio(channels, sampleRate); assertIdentity(owner, assetId, secret);
  const hmac = await secretBytes(owner, assetId, secret);
  const bits = bitsOf(hmac.payload), n = fftSize(sampleRate), hop = n >>> 2;
  const pairs = layout(sampleRate, n, hmac), win = hann(n);
  const src = channels.length === 1 ? channels[0] : (() => {
    const mono = new Float32Array(channels[0].length);
    for (let i = 0; i < mono.length; i++) mono[i] = (channels[0][i] + channels[1][i]) * .5;
    return mono;
  })();
  const evidence = new Float64Array(PAYLOAD_BITS), total = new Float64Array(PAYLOAD_BITS);
  const re = new Float64Array(n), im = new Float64Array(n);
  const count = Math.max(0, Math.ceil((src.length - n) / hop));
  const stride = Math.max(1, Math.floor(count / 190));
  let frames = 0;
  for (let f = 0; f < count; f += stride) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!analyseFrame(src, f * hop, n, win, re, im)) continue;
    frames++;
    for (const { bit, left, polarity } of pairs) {
      const a = Math.hypot(re[left], im[left]);
      const b = Math.hypot(re[left + 1], im[left + 1]);
      if (a < 0.0001 || b < 0.0001) continue;
      // Clamp outliers from tonal notes; prevents one frequency bin dominating.
      const difference = Math.max(-2, Math.min(2, Math.log(a / b)));
      evidence[bit] += difference * polarity;
      total[bit]++;
    }
    if (f % (stride * 12) === 0) { onProgress?.(Math.min(.99, f / count)); await yieldUI(); }
  }
  if (frames < 8) return { detected: false, matchedBits: 0, totalBits: PAYLOAD_BITS, frames, score: 0, reason: 'Not enough non-silent audio.' };
  let matches = 0, score = 0, supported = 0;
  for (let bit = 0; bit < PAYLOAD_BITS; bit++) {
    const avg = total[bit] ? evidence[bit] / total[bit] : 0;
    if (total[bit] >= 10) {
      supported++;
      const correct = bits[bit] ? avg > 0 : avg < 0;
      if (correct) matches++;
      score += (bits[bit] ? 1 : -1) * avg;
    }
  }
  score = supported ? score / supported : 0;
  const detected = supported === PAYLOAD_BITS && matches >= 55 && score >= .055;
  onProgress?.(1);
  return {
    detected, matchedBits: matches, totalBits: PAYLOAD_BITS, frames,
    score: Number(score.toFixed(4)),
    reason: detected ? 'Expected keyed mark detected.' : 'No reliable match for the supplied identity and key.'
  };
}

/** Pick lower-energy places in the first 12 s and later at long intervals. Heuristic, not ML. */
export function findSmartTagPositions(channels, sampleRate, tagSeconds, mode = 'smart') {
  const src = channels[0];
  if (!src || !Number.isFinite(sampleRate) || tagSeconds <= 0) throw new Error('Load source audio and voice tag first.');
  const duration = src.length / sampleRate;
  if (tagSeconds > duration) throw new Error('Voice tag is longer than the song.');
  if (mode === 'intro') return [Math.min(1.5, Math.max(0, duration - tagSeconds))];
  const selectInRange = (from, to) => {
    const maxStart = Math.min(to, duration - tagSeconds);
    let best = Math.min(from, maxStart), lowest = Infinity;
    const step = .25, every = Math.max(1, Math.floor(sampleRate / 200));
    for (let time = Math.max(0, from); time <= maxStart; time += step) {
      let energy = 0, n = 0;
      const a = Math.floor(time * sampleRate), b = Math.min(src.length, Math.floor((time + tagSeconds) * sampleRate));
      for (let i = a; i < b; i += every) { const v = src[i]; energy += v * v; n++; }
      const rms = n ? energy / n : Infinity;
      if (rms < lowest) { lowest = rms; best = time; }
    }
    return Number(best.toFixed(2));
  };
  const points = [selectInRange(0, Math.min(12, duration - tagSeconds))];
  if (mode === 'repeat') {
    for (let pos = 28; pos < duration - tagSeconds - 3; pos += 28) {
      const chosen = selectInRange(Math.max(0, pos - 3), Math.min(duration - tagSeconds, pos + 3));
      if (chosen - points[points.length - 1] >= tagSeconds + 3) points.push(chosen);
    }
  }
  return points;
}

/** Mix a recorded/uploaded producer tag onto the same SOURCE AUDIO. */
export function mixProducerTag({ channels, sampleRate, tagChannels, tagSampleRate, positions, volume = .6, duck = .35, effect = 'radio' }) {
  if (!channels?.length || !tagChannels?.length || !positions?.length) throw new Error('Missing source audio, voice tag or placements.');
  if (sampleRate !== tagSampleRate) throw new Error('Voice tag must be resampled to source sample rate.');
  if (tagChannels.some(x => !(x instanceof Float32Array))) throw new Error('Invalid producer tag audio.');
  const result = channels.map(ch => ch.slice());
  const voice = tagChannels.length === 1 ? tagChannels[0] : (() => {
    const v = new Float32Array(tagChannels[0].length);
    for (let i = 0; i < v.length; i++) v[i] = (tagChannels[0][i] + tagChannels[1][i]) * .5;
    return v;
  })();
  const processed = new Float32Array(voice.length);
  // A lightweight telephone / saturation effect, deliberately not called neural AI.
  let hp = 0, lp = 0, prior = 0;
  const highAlpha = Math.exp(-2 * Math.PI * 360 / sampleRate);
  const lowAlpha = 1 - Math.exp(-2 * Math.PI * 3600 / sampleRate);
  for (let i = 0; i < voice.length; i++) {
    const x = voice[i];
    hp = highAlpha * (hp + x - prior); prior = x;
    lp += lowAlpha * (hp - lp);
    processed[i] = effect === 'radio' ? Math.tanh(lp * 1.8) * .75 : effect === 'distorted' ? Math.tanh(x * 4) * .5 : x;
  }
  for (const at of positions) {
    const start = Math.floor(at * sampleRate);
    if (start < 0 || start >= result[0].length) continue;
    const length = Math.min(processed.length, result[0].length - start);
    const fade = Math.min(Math.floor(sampleRate * .025), Math.floor(length / 4));
    for (let i = 0; i < length; i++) {
      const ramp = fade ? Math.min(1, (i + 1) / fade, (length - i) / fade) : 1;
      for (const ch of result) ch[start + i] = ch[start + i] * (1 - duck * ramp) + processed[i] * volume * ramp;
    }
  }
  let peak = 0;
  for (const ch of result) for (const x of ch) peak = Math.max(peak, Math.abs(x));
  if (peak > .99) for (const ch of result) for (let i = 0; i < ch.length; i++) ch[i] *= .99 / peak;
  return result;
}

/** Optional short public preview; keep original SOURCE AUDIO unchanged. */
export function cutPublicPreview(channels, sampleRate, seconds = 0) {
  if (!channels?.length || !channels.every(ch => ch instanceof Float32Array)) throw new Error('Invalid source audio.');
  if (!seconds) return channels.map(ch => ch.slice());
  if (!Number.isFinite(seconds) || seconds < 8) throw new Error('Preview must be at least 8 seconds.');
  const size = Math.min(channels[0].length, Math.round(sampleRate * seconds));
  const fade = Math.min(Math.round(.02 * sampleRate), Math.floor(size / 2));
  return channels.map(ch => {
    const out = ch.slice(0, size);
    if (size < ch.length) for (let i = 0; i < fade; i++) out[size - fade + i] *= (fade - i - 1) / fade;
    return out;
  });
}

/** Deterrent for public demos, not a hidden forensic watermark. */
export function addPeriodicMark(channels, sampleRate, { mode = 'off', interval = 28, volume = .055 } = {}) {
  if (!['off', 'tone', 'hiss'].includes(mode)) throw new Error('Unknown sound mark mode.');
  if (!Number.isFinite(interval) || interval < 10 || interval > 120 ||
      !Number.isFinite(volume) || volume < 0 || volume > .25) throw new Error('Invalid mark settings.');
  const result = channels.map(ch => ch.slice());
  if (mode === 'off') return result;
  const length = result[0].length, seconds = length / sampleRate;
  const toneLength = Math.round(.16 * sampleRate);
  let rand = 0x451ab9ce;
  for (let time = 12; time < seconds - .17; time += interval) {
    const offset = Math.floor(time * sampleRate);
    for (let i = 0; i < toneLength && offset + i < length; i++) {
      const fade = Math.min(1, i / (sampleRate * .012), (toneLength - i) / (sampleRate * .012));
      let mark;
      if (mode === 'hiss') {
        rand ^= rand << 13; rand ^= rand >>> 17; rand ^= rand << 5;
        mark = (rand / 0x7fffffff) * fade * volume;
      } else {
        mark = Math.sin(2 * Math.PI * 940 * i / sampleRate) * fade * volume;
      }
      for (const ch of result) ch[offset + i] = Math.max(-1, Math.min(1, ch[offset + i] + mark));
    }
  }
  return result;
}

function writeFourCC(buffer, position, name) {
  for (let i = 0; i < 4; i++) buffer[position + i] = name.charCodeAt(i);
}
function chunk(id, payload) {
  const out = new Uint8Array(8 + payload.length + (payload.length % 2));
  writeFourCC(out, 0, id);
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}
function safeText(value, maximum = 150) { return String(value ?? '').replace(/\0/g, '').slice(0, maximum); }
function nulString(target, position, max, value) {
  const encoded = encoder.encode(safeText(value, max));
  target.set(encoded.slice(0, max - 1), position);
}
/** 24-bit PCM WAV, optionally with BWF bext and RIFF INFO metadata. */
export function encodeWav24(channels, sampleRate, metadata = null) {
  if (!channels.length || channels.length > 2 ||
      channels.some(ch => !(ch instanceof Float32Array) || ch.length !== channels[0].length)) throw new Error('Mono/stereo PCM WAV only.');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error('Invalid sample rate.');
  const length = channels[0].length, blockAlign = channels.length * 3;
  const byteLength = length * blockAlign;
  const fmt = new Uint8Array(16), f = new DataView(fmt.buffer);
  f.setUint16(0, 1, true); f.setUint16(2, channels.length, true); f.setUint32(4, sampleRate, true);
  f.setUint32(8, sampleRate * blockAlign, true); f.setUint16(12, blockAlign, true); f.setUint16(14, 24, true);
  const chunks = [chunk('fmt ', fmt)];
  if (metadata) {
    const date = metadata.generatedAt && Number.isFinite(Date.parse(metadata.generatedAt))
      ? new Date(metadata.generatedAt) : new Date();
    const iso = date.toISOString();
    const bext = new Uint8Array(602), view = new DataView(bext.buffer);
    nulString(bext, 0, 256, metadata.description || metadata.title || 'Protected audio');
    nulString(bext, 256, 32, metadata.owner || '');
    nulString(bext, 288, 32, metadata.deliveryId || metadata.assetId || '');
    bext.set(encoder.encode(iso.slice(0, 10)), 320);
    bext.set(encoder.encode(iso.slice(11, 19)), 330);
    view.setUint16(346, 1, true); // BWF version 1 (originator and date are self-declared).
    chunks.push(chunk('bext', bext));
    const tags = [
      ['INAM', metadata.title], ['IART', metadata.owner],
      ['ICOP', metadata.copyright || `Copyright ${date.getUTCFullYear()} ${metadata.owner || ''}`],
      ['ICMT', `Delivery: ${safeText(metadata.deliveryId || metadata.assetId,100)}. Recipient: ${safeText(metadata.recipient,65)}. Contact: ${safeText(metadata.contact,70)}`],
      ['ISRC', metadata.isrc]
    ].filter(([,v]) => v && String(v).trim());
    const infoChunks = tags.map(([tag, value]) => chunk(tag, new Uint8Array([...encoder.encode(safeText(value,250)), 0])));
    const infoLength = 4 + infoChunks.reduce((acc, part) => acc + part.length, 0);
    const info = new Uint8Array(infoLength);
    writeFourCC(info, 0, 'INFO');
    let position = 4;
    for (const part of infoChunks) { info.set(part, position); position += part.length; }
    chunks.push(chunk('LIST', info));
  }
  const beforeData = 12 + chunks.reduce((acc, part) => acc + part.length, 0);
  const totalBytes = beforeData + 8 + byteLength + (byteLength & 1);
  if (totalBytes > 0xffffffff) throw new Error('WAV exceeds RIFF 4 GB limit.');
  const bytes = new Uint8Array(totalBytes), view = new DataView(bytes.buffer);
  writeFourCC(bytes, 0, 'RIFF'); view.setUint32(4, totalBytes - 8, true); writeFourCC(bytes, 8, 'WAVE');
  let at = 12;
  for (const part of chunks) { bytes.set(part, at); at += part.length; }
  writeFourCC(bytes, at, 'data'); view.setUint32(at + 4, byteLength, true); at += 8;
  for (let i = 0; i < length; i++) for (const ch of channels) {
    const s = Math.max(-1, Math.min(1, ch[i] || 0));
    const v = s < 0 ? Math.round(s * 8388608) : Math.round(s * 8388607);
    bytes[at++] = v & 255; bytes[at++] = (v >>> 8) & 255; bytes[at++] = (v >>> 16) & 255;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export async function sha256File(file) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
}
