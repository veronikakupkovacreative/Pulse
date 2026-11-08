import {estimateSpectralTempo} from './spectral-tempo.mjs';
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
    // No genre or tempo prior: a slow groove must not be preferred over a fast one.
    // Compare beat-level periodicity to harmonic lag support, without allowing
    // multiples to overwhelm the actual quarter-note pulse.
    const harmonicSupport = 0.25 * at(period * 2) + 0.10 * at(period * 3);
    const score = periodicity + harmonicSupport;
    candidates.push({bpm, score, periodicity});
  }
  // Measure each candidate in independent windows. A rhythmic subdivision
  // can dominate global autocorrelation while failing to persist across a song.
  function localScore(candidate, start) {
    const period = 60 * rate / candidate.bpm;
    const lag = Math.round(period);
    let dot = 0, aa = 0, bb = 0;
    for (let i = start + lag; i < start + windowFrames; i++) {
      const a = envelope[i], b = envelope[i-lag];
      dot += a*b; aa += a*a; bb += b*b;
    }
    return dot / (Math.sqrt(aa*bb) || 1);
  }
  const scored = candidates.map(candidate => {
    const local = starts.map(start => localScore(candidate,start));
    const sorted = [...local].sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    const mean = local.reduce((sum,x)=>sum+x,0)/local.length;
    // Penalize candidates with strong local disagreement.
    const stability = Math.max(0, 1 - (Math.max(...local)-Math.min(...local)));
    const combined = candidate.score * 0.45 + median * 0.40 + mean * 0.15;
    return {...candidate, local, stability, combined:combined*(0.85+0.15*stability)};
  });
  // Explicitly evaluate metric ambiguities including 3:2 (e.g. 104 vs 156).
  // When the underlying onset pulse is supported, prefer it over a weaker
  // triplet interpretation, but do not hardcode any target BPM.
  for (const candidate of scored) {
    const faster = scored.find(other =>
      other.bpm > candidate.bpm * 1.45 &&
      other.bpm < candidate.bpm * 1.55 &&
      other.periodicity >= candidate.periodicity * 0.78 &&
      other.stability >= candidate.stability * 0.85
    );
    // If a stable 3:2 faster pulse is nearly as strong, the slower pulse is
    // often a metrical alias. Keep both as candidates rather than suppressing it.
    if (faster && faster.combined >= candidate.combined * 0.72) candidate.combined *= 0.72;
  }
  scored.sort((a,b) => b.combined - a.combined);
  if (!scored.length || scored[0].periodicity < 0.14) throw new Error('NO_RHYTHM');
  const best = scored[0];
  const alternatives = scored.slice(1).filter(other =>
    Math.abs(Math.log(other.bpm/best.bpm)) > 0.025 &&
    other.combined >= best.combined * 0.60
  ).slice(0,3).map(({bpm,combined})=>({
    bpm:Math.round(bpm*10)/10,
    relativeScore:Math.round(100*combined/(best.combined||1))
  }));
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
  const nearest = scored.slice(1).find(other => Math.abs(Math.log(other.bpm / best.bpm)) > 0.025);
  const separation = nearest ? (best.combined-nearest.combined)/(Math.abs(best.combined)||1) : 1;
  const confidence = prominence > 0.45 && consistency > 0.65 && separation > 0.18
    ? 'high' : prominence > 0.18 && separation > 0.07 ? 'medium' : 'low';
  const waveform = Array.from({length:220}, (_,i) => {
    const start = Math.floor(i * samples.length / 220), end = Math.floor((i+1)*samples.length/220);
    let sum = 0, count = 0;
    for (let j = start; j < end; j += 8) { sum += samples[j] ** 2; count++; }
    return Math.sqrt(sum / (count || 1));
  });
  const peak = Math.max(...waveform) || 1;
  const spectral = estimateSpectralTempo(samples,sampleRate);
  // Spectral changes disambiguate groove subdivisions better than raw energy
  // onsets. Accept the independent estimate only when it repeats across windows.
  const useSpectral = spectral && spectral.score >= 0.25 && spectral.stability >= 2/3;
  const bpm = useSpectral ? spectral.bpm : Math.round(best.bpm*10)/10;
  const reportedCandidates = useSpectral
    ? spectral.alternatives.filter(item=>item.score>0.10).map(item=>({
        bpm:item.bpm,relativeScore:Math.round(100*item.score/spectral.score)
      })).slice(0,3)
    : alternatives;
  const spectralContrast = useSpectral
    ? 1-(spectral.alternatives[0]?.score??0)/spectral.score
    : null;
  const reportedConfidence = useSpectral
    ? (spectral.score>.55 && spectral.stability===1 && spectralContrast>.15 ? 'high'
        : spectral.score>.35 ? 'medium' : 'low')
    : confidence;
  return {bpm, confidence:reportedConfidence, duration, waveform:waveform.map(x=>x/peak),
    analyzedWindows:starts.length,alternatives:reportedCandidates,
    tempoStability:useSpectral?Math.round(spectral.stability*100):Math.round(best.stability*100),
    candidateSeparation:useSpectral?Math.round(spectralContrast*100):Math.round(separation*100)};
}
