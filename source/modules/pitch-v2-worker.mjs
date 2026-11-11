import {transformPitchTime} from './pitch-v2-dsp.mjs';
self.onmessage = event => {
  const {id, channels, sampleRate, tempo, semitones} = event.data || {};
  try {
    if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2 ||
        ![...channels].every(c => c instanceof Float32Array && c.length > 0) ||
        !Number.isFinite(sampleRate) || sampleRate < 8000) throw Error('Invalid audio input.');
    if (channels[0].length / sampleRate > 120) throw Error('Pitch & Time currently supports clips up to 120 seconds.');
    const output = transformPitchTime(channels, {tempo, semitones});
    self.postMessage({id, ok:true, channels:output, sampleRate}, output.map(c => c.buffer));
  } catch (error) { self.postMessage({id, ok:false, error:String(error.message || error)}); }
};
