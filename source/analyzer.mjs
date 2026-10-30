// Multi-band onset envelope and normalized tempo autocorrelation.
// Confidence describes rhythmic periodicity, not a calibrated probability.
export function analyzeTempo(samples, sampleRate) {
  const duration = samples.length / sampleRate;
  if (duration < 6) throw new Error('TOO_SHORT');
  const hop = Math.round(sampleRate / 200);
  const rate = sampleRate / hop;
  const frames = Math.floor(samples.length / hop);
  const energy = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  const lowA = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
  const highA = 1 - Math.exp(-2 * Math.PI * 2200 / sampleRate);
  let low = 0, high = 0, total = 0;
  for (let f = 0; f < frames; f++) {
    let a = 0, b = 0, c = 0;
    for (let j = 0; j < hop; j++) {
      const x = samples[f * hop + j];
      low += lowA * (x - low); high += highA * (x - high);
      a += low * low; b += (x - high) ** 2; c += x * x;
    }
    total += c;
    energy[0][f] = Math.log1p(100 * Math.sqrt(a / hop));
    energy[1][f] = Math.log1p(100 * Math.sqrt(b / hop));
    energy[2][f] = Math.log1p(100 * Math.sqrt(c / hop));
  }
  if (Math.sqrt(total / samples.length) < 0.00005) throw new Error('SILENCE');
  // Ignore tiny frame-boundary ripples of a sustained tone.
  let dynamicMin = Infinity, dynamicMax = 0;
  for (let i = Math.round(rate); i < frames; i++) { dynamicMin = Math.min(dynamicMin, energy[2][i]); dynamicMax = Math.max(dynamicMax, energy[2][i]); }
  if (dynamicMax - dynamicMin < 0.12) throw new Error('NO_RHYTHM');
  const envelope = new Float32Array(frames);
  for (const band of energy) {
    const delta = new Float32Array(frames);
    let sum = 0;
    for (let i = 2; i < frames; i++) {
      delta[i] = Math.max(0, band[i] - band[i - 2]);
      sum += delta[i];
    }
    const mean = sum / frames;
    if (mean > 0.00001) for (let i = 0; i < frames; i++) envelope[i] += Math.min(8, Math.max(0, delta[i] - mean * 0.5) / mean);
  }
  let onsetEnergy = 0;
  for (const x of envelope) onsetEnergy += x * x;
  if (onsetEnergy / frames < 0.01) throw new Error('NO_RHYTHM');
  const windowFrames = Math.min(frames, Math.round(rate * 40));
  const starts = frames <= windowFrames ? [0] : [0, Math.floor((frames - windowFrames) / 2), frames - windowFrames];
  const maxLag = Math.ceil(rate * 60 / 45) * 3 + 2;
  const corr = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let dot = 0, aa = 0, bb = 0;
    for (const start of starts) {
      for (let i = start + lag; i < start + windowFrames; i++) {
        const a = envelope[i], b = envelope[i - lag];
        dot += a * b; aa += a * a; bb += b * b;
      }
    }
    corr[lag] = dot / (Math.sqrt(aa * bb) || 1);
  }
  const at = lag => {
    const lo = Math.floor(lag), fraction = lag - lo;
    return (corr[lo] || 0) * (1 - fraction) + (corr[lo + 1] || 0) * fraction;
  };
  const candidates = [];
  for (let lag = Math.floor(rate * 60 / 220); lag <= Math.ceil(rate * 60 / 45); lag++) {
    if (corr[lag] <= corr[lag - 1] || corr[lag] < corr[lag + 1]) continue;
    const curvature = corr[lag - 1] - 2 * corr[lag] + corr[lag + 1];
    const offset = curvature ? Math.max(-0.5, Math.min(0.5, 0.5 * (corr[lag - 1] - corr[lag + 1]) / curvature)) : 0;
    const period = lag + offset;
    const bpm = 60 * rate / period;
    if (bpm < 45 || bpm > 220) continue;
    const periodicity = at(period);
    const prior = Math.exp(-0.5 * (Math.log(bpm / 115) / 0.65) ** 2);
    const score = (periodicity + 0.45 * at(period * 2) + 0.2 * at(period * 3)) * (0.84 + 0.16 * prior);
    candidates.push({bpm, score, periodicity});
  }
  candidates.sort((a,b) => b.score - a.score);
  if (!candidates.length || candidates[0].periodicity < 0.14) throw new Error('NO_RHYTHM');
  const best = candidates[0];
  const backgroundValues = Array.from(corr.slice(Math.floor(rate*60/220),Math.ceil(rate*60/45))).sort((a,b)=>a-b);
  const background = backgroundValues[Math.floor(backgroundValues.length/2)];
  const prominence = (best.periodicity-background)/(1-background || 1);
  if (prominence < 0.06) throw new Error('NO_RHYTHM');
  const windows = starts.map(start => {
    let winner = null;
    for (const candidate of candidates.slice(0, 8)) {
      const lag = Math.round(60 * rate / candidate.bpm);
      let dot = 0, power = 0;
      for (let i = start + lag; i < start + windowFrames; i++) { dot += envelope[i] * envelope[i-lag]; power += envelope[i] ** 2; }
      const score = dot / (power || 1);
      if (!winner || score > winner.score) winner = {bpm:candidate.bpm,score};
    }
    return winner.bpm;
  });
  const consistency = windows.filter(bpm => Math.abs(Math.log2(bpm / best.bpm) - Math.round(Math.log2(bpm / best.bpm))) < 0.035).length / windows.length;
  const confidence = prominence > 0.45 && consistency > 0.65 ? 'high' : prominence > 0.18 ? 'medium' : 'low';
  // Fold onset peaks into the detected beat period to locate the beat grid.
  // This is an onset phase, NOT a guaranteed musical downbeat.
  const periodFrames = rate * 60 / best.bpm;
  const bins = Math.max(8, Math.round(periodFrames));
  const phaseEnergy = new Float64Array(bins);
  for (let i = 2; i < envelope.length - 1; i++) {
    if (envelope[i] <= envelope[i-1] || envelope[i] < envelope[i+1]) continue;
    const phase = i % periodFrames;
    const bin = Math.round(phase / periodFrames * bins) % bins;
    phaseEnergy[bin] += envelope[i];
  }
  let bestBin = 0, bestPhaseScore = -1;
  for (let i = 0; i < bins; i++) {
    const score = phaseEnergy[(i+bins-2)%bins] * .15 +
      phaseEnergy[(i+bins-1)%bins] * .55 + phaseEnergy[i] +
      phaseEnergy[(i+1)%bins] * .55 + phaseEnergy[(i+2)%bins] * .15;
    if (score > bestPhaseScore) {bestPhaseScore = score; bestBin = i;}
  }
  const beatOffsetSeconds = Math.round(bestBin / bins * 60 / best.bpm * 1000) / 1000;
  const alternativeBpms = candidates.filter(c => Math.abs(Math.log2(c.bpm / best.bpm)) > .06)
    .slice(0, 3).map(c => Math.round(c.bpm * 10) / 10);
  // High-resolution, bounded overview: enough peaks for zoom without retaining PCM in the UI.
  const peakCount = Math.min(16384, Math.max(512, Math.ceil(duration * 60)));
  const waveform = new Float32Array(peakCount);
  for (let i = 0; i < peakCount; i++) {
    const start = Math.floor(i * samples.length / peakCount);
    const end = Math.max(start + 1, Math.floor((i + 1) * samples.length / peakCount));
    let maximum = 0;
    for (let j = start; j < end; j += 4) maximum = Math.max(maximum, Math.abs(samples[j]));
    waveform[i] = maximum;
  }
  let peak = 0;
  for (const value of waveform) peak = Math.max(peak, value);
  const tempoWindows = starts.map((start, index) => ({
    startSeconds: Math.round(start / rate * 10) / 10,
    endSeconds: Math.round(Math.min(duration, (start + windowFrames) / rate) * 10) / 10,
    bpm: Math.round(windows[index] * 10) / 10
  }));
  const tempoStability = consistency >= .99 ? 'steady' : consistency >= .66 ? 'mixed' : 'variable';
  return {
    bpm:Math.round(best.bpm * 10) / 10, confidence, duration,
    waveform:Array.from(waveform, x => x / (peak || 1)),
    analyzedWindows:starts.length, beatOffsetSeconds, alternativeBpms,
    tempoWindows, tempoStability
  };
}

