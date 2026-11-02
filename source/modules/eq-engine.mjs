// PULSE equalizer layout and deterministic genre voicings (not neural inference).
const logFreqs = (count, start, end) => Array.from({length: count}, (_, index) =>
  Math.round(start * Math.exp(Math.log(end / start) * index / (count - 1))));
const names = ['SUB-BASS', 'BASS', 'MID', 'HIGH-MID', 'BRILLIANCE'];
const make = (frequencies, types, q) => frequencies.map((frequency, index) => Object.freeze({
  id: `band-${index}`, frequency, type: types?.[index] || 'peaking',
  q, label: frequencies.length === 5 ? names[index] : frequency < 80 ? 'SUB' : frequency < 250 ? 'BASS' : frequency < 2500 ? 'MID' : frequency < 8000 ? 'PRESENCE' : 'AIR'
}));

export const EQ_LAYOUTS = Object.freeze({
  3: Object.freeze(make([120, 1200, 8500], ['lowshelf', 'peaking', 'highshelf'], 1)),
  5: Object.freeze(make([60, 230, 1000, 4000, 12000], ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'], 1)),
  10: Object.freeze(make([31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], null, 1.6)),
  20: Object.freeze(make(logFreqs(20, 31, 16000), null, 3.3))
});

// Values are reference EQ voicings in dB at [60,230,1000,4000,12000] Hz.
export const EQ_GENRE_PRESETS = Object.freeze({
  flat: Object.freeze({name: 'FLAT', gains: [0, 0, 0, 0, 0]}),
  edm: Object.freeze({name: 'EDM', gains: [3.5, 2, -1.5, 1.5, 3]}),
  vocals: Object.freeze({name: 'VOCALS', gains: [-4, -1.5, 2, 3, 2]}),
  hiphop: Object.freeze({name: 'HIP-HOP', gains: [4.5, 3, -1.5, 0, 1.5]}),
  acoustic: Object.freeze({name: 'ACOUSTIC', gains: [-1.5, 0, 1, 1.5, 2]}),
  warm: Object.freeze({name: 'WARM', gains: [2.5, 2, 0, -1, -1.5]}),
  bass: Object.freeze({name: 'FULL BASS', gains: [5, 3, -0.5, 0, -1]}),
  voice: Object.freeze({name: 'VOICE CLARITY', gains: [-3, -1, 3, 3, 2]}),
  bright: Object.freeze({name: 'BRIGHT', gains: [-1.5, -1, 0, 2, 3.5]}),
  punch: Object.freeze({name: 'PUNCHY DRUMS', gains: [3.5, 2.5, -2, 2, 2.5]}),
  rock: Object.freeze({name: 'ROCK', gains: [2, 1.5, -1.5, 2.5, 2]}),
  jazz: Object.freeze({name: 'JAZZ', gains: [0, 1.2, 0.5, 1.3, 1]}),
  podcast: Object.freeze({name: 'PODCAST', gains: [-5, -2, 2, 3, 1.5]}),
  air: Object.freeze({name: 'AIR', gains: [-1, 0, 0, 1.5, 4.5]}),
  deep: Object.freeze({name: 'DEEP BASS', gains: [5, 3.5, -1.2, 0, -1.5]})
});

export const EQ3_PRESETS = Object.freeze({
  flat: [0, 0, 0], edm: [4, -1.5, 3], vocals: [-3, 3, 2.5],
  hiphop: [5, -1.5, 1.5], acoustic: [-1.5, 1, 2],
  warm: [2.5, 0.5, -1.2], bass: [7, 0, -1], voice: [-3, 3, 2], bright: [-1.5, 1, 4],
  punch: [3.5, -1.5, 2], rock: [2, 0, 2.5], jazz: [1, 0, 1],
  podcast: [-4, 3, 1.5], air: [-1, 0, 5], deep: [6, -1, -2]
});

export const formatEqFrequency = hz => hz >= 1000 ? `${Number((hz/1000).toFixed(2))} kHz` : `${hz} Hz`;
export const validEqCount = count => Object.hasOwn(EQ_LAYOUTS, Number(count));
export function bandLayout(count) {
  const bands = EQ_LAYOUTS[Number(count)];
  if (!bands) throw Error('Supported band counts are 3, 5, 10 and 20.');
  return bands;
}
function interpolateLog(anchors, frequencies, frequency) {
  if (frequency <= frequencies[0]) return anchors[0];
  if (frequency >= frequencies.at(-1)) return anchors.at(-1);
  const index = frequencies.findIndex((value, i) => i > 0 && frequency <= value);
  const lo = Math.log(frequencies[index - 1]), hi = Math.log(frequencies[index]);
  const portion = (Math.log(frequency) - lo) / (hi - lo);
  return anchors[index - 1] * (1-portion) + anchors[index] * portion;
}

export function eqPresetGains(count, preset = 'flat') {
  const bands = bandLayout(count);
  if (!Object.hasOwn(EQ_GENRE_PRESETS, preset)) throw Error('Unknown EQ genre preset.');
  if (Number(count) === 3) return [...EQ3_PRESETS[preset]];
  const target = EQ_GENRE_PRESETS[preset].gains;
  // Dense peaking bands overlap. Attenuation keeps summed response consistent
  // between layouts while still using genuinely independent filter bands.
  const scale = Number(count) === 20 ? 0.72 : Number(count) === 10 ? 0.86 : 1;
  return bands.map(band => Math.round(interpolateLog(target, [60,230,1000,4000,12000], band.frequency) * scale * 2) / 2);
}

export function eqFilters(count, gains) {
  const layout = bandLayout(count);
  if (!Array.isArray(gains) || gains.length !== layout.length) throw Error('Gain count does not match selected EQ layout.');
  return layout.map((band, i) => {
    const gain = Number(gains[i]);
    if (!Number.isFinite(gain) || gain < -18 || gain > 18) throw Error('EQ gain must be between -18 and +18 dB.');
    return {type: band.type, frequency: band.frequency, q: band.q, gain};
  });
}

export function interpolateEqGains(previousCount, previousGains, nextCount) {
  const before=bandLayout(previousCount);
  if (!Array.isArray(previousGains) || previousGains.length !== before.length) throw Error('Invalid previous EQ gain set.');
  return bandLayout(nextCount).map(band => Math.max(-18, Math.min(18,
    Math.round(interpolateLog(previousGains, before.map(b=>b.frequency), band.frequency) * 2) / 2
  )));
}