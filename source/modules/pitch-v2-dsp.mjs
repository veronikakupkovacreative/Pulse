/** Independent tempo and pitch transform using resampling + WSOLA overlap alignment.
 * No trained model; suitable for moderate adjustments and clips up to two minutes.
 * Run in a Web Worker, not on the UI thread.
 */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function resampleLinear(channels, factor) {
  if (!Number.isFinite(factor) || factor <= 0) throw Error('Invalid resampling factor.');
  const size = Math.max(1, Math.round(channels[0].length / factor));
  return channels.map((source) => {
    const out = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const pos = Math.min(source.length - 1, i * factor);
      const a = Math.floor(pos), b = Math.min(source.length - 1, a + 1);
      out[i] = source[a] * (1 - (pos - a)) + source[b] * (pos - a);
    }
    return out;
  });
}

/** WSOLA: analysis windows are aligned by cross-correlation, preserving local waveform periodicity. */
export function stretchWsola(channels, stretch) {
  if (!channels.length || !channels[0]?.length) throw Error('Missing PCM audio.');
  if (!Number.isFinite(stretch) || stretch < .35 || stretch > 3.5) throw Error('Stretch is outside the supported range.');
  const length = channels[0].length;
  if (channels.some(x => x.length !== length)) throw Error('PCM channels must have the same length.');
  const outLength = Math.max(1, Math.round(length * stretch));
  if (outLength > 16_000_000) throw Error('Resulting audio exceeds the processing limit.');
  if (Math.abs(stretch - 1) < 1e-8) return channels.map(c => c.slice());
  const win = Math.min(2048, Math.max(128, 2 ** Math.floor(Math.log2(length / 2))));
  if (length < 512) return resampleLinear(channels, 1 / stretch);
  const hop = Math.floor(win / 4), overlap = win - hop, radius = Math.min(128, hop);
  const hann = new Float32Array(win);
  for (let j = 0; j < win; j++) hann[j] = .5 - .5 * Math.cos(2 * Math.PI * (j + .5) / win);
  const out = channels.map(() => new Float32Array(outLength));
  const weights = new Float32Array(outLength);
  let prior = 0;
  for (let outStart = 0, frame = 0; outStart < outLength; outStart += hop, frame++) {
    const ideal = Math.round(outStart / stretch);
    const lastLegal = Math.max(0, length - win);
    const expected = clamp(ideal, 0, lastLegal);
    let chosen = expected;
    if (frame > 0) {
      let best = -Infinity;
      const lo = clamp(expected - radius, 0, lastLegal), hi = clamp(expected + radius, 0, lastLegal);
      const s = channels[0];
      for (let candidate = lo; candidate <= hi; candidate += 4) {
        let dot = 0, a2 = 1e-8, b2 = 1e-8;
        for (let j = 0; j < overlap; j += 24) {
          const a = s[Math.min(length - 1, prior + hop + j)];
          const b = s[Math.min(length - 1, candidate + j)];
          dot += a * b; a2 += a * a; b2 += b * b;
        }
        const score = dot / Math.sqrt(a2 * b2) - Math.abs(candidate - expected) * .00005;
        if (score > best) { best = score; chosen = candidate; }
      }
    }
    prior = chosen;
    const count = Math.min(win, outLength - outStart);
    for (let j = 0; j < count; j++) {
      const weight = hann[j];
      weights[outStart + j] += weight;
      for (let c = 0; c < channels.length; c++) out[c][outStart + j] += channels[c][chosen + j] * weight;
    }
  }
  for (let i = 0; i < outLength; i++) {
    const normalizer = Math.max(weights[i], 1e-5);
    for (const channel of out) channel[i] = clamp(channel[i] / normalizer, -1, 1);
  }
  return out;
}

/** tempo=1.25 shortens audio 20% without changing pitch; semitones=+2 raises pitch. */
export function transformPitchTime(channels, { tempo = 1, semitones = 0 } = {}) {
  if (!Number.isFinite(tempo) || tempo < .7 || tempo > 1.5) throw Error('Tempo must be 0.70x–1.50x.');
  if (!Number.isFinite(semitones) || semitones < -6 || semitones > 6) throw Error('Pitch must be -6 to +6 semitones.');
  const pitchFactor = 2 ** (semitones / 12);
  const pitched = Math.abs(pitchFactor - 1) < 1e-9 ? channels.map(c => c.slice()) : resampleLinear(channels, pitchFactor);
  const targetLength = Math.max(1, Math.round(channels[0].length / tempo));
  const transformed = stretchWsola(pitched, targetLength / pitched[0].length);
  // Return the exact expected number of samples (WSOLA rounding can differ by one).
  return transformed.map(c => {
    if (c.length === targetLength) return c;
    const result = new Float32Array(targetLength);
    result.set(c.subarray(0, targetLength));
    return result;
  });
}
