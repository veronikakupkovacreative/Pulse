/** Sample-peak normalizer. No neural inference, loudness/true-peak measurement or limiting. */
export const dbToGain = db => 10 ** (db / 20);
export const gainToDb = value => value > 0 ? 20 * Math.log10(value) : -Infinity;

export function measurePeak(buffer) {
  if (!buffer || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
      !Number.isInteger(buffer.length) || buffer.length < 1 || !Number.isFinite(buffer.sampleRate) ||
      typeof buffer.getChannelData !== 'function') throw Error('Valid decoded audio is required.');
  let peak = 0;
  let sum = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    if (data.length !== buffer.length) throw Error('Channel length mismatch.');
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (!Number.isFinite(value)) throw Error('Audio contains invalid samples.');
      peak = Math.max(peak, Math.abs(value));
      sum += value * value;
    }
  }
  return { peak, peakDbfs: gainToDb(peak), rmsDbfs: gainToDb(Math.sqrt(sum / (buffer.length * buffer.numberOfChannels))), silent: peak === 0 };
}

export function normalizationPlan(buffer, targetDbfs = -1, maxBoost = 2) {
  const target = Number(targetDbfs);
  if (!Number.isFinite(target) || target < -12 || target > -0.1) throw Error('Choose a target from -12 to -0.1 dBFS.');
  if (!Number.isFinite(maxBoost) || maxBoost < 1) throw Error('Invalid boost limit.');
  const analysis = measurePeak(buffer);
  const desiredGain = analysis.silent ? 1 : dbToGain(target) / analysis.peak;
  const gain = Math.min(desiredGain, maxBoost);
  return {...analysis, targetDbfs: target, gain, gainDb: gainToDb(gain), outputDbfs: analysis.silent ? -Infinity : gainToDb(analysis.peak * gain), capped: desiredGain > maxBoost + 1e-8 };
}

export function applyPeakGain(buffer, gain) {
  if (!Number.isFinite(gain) || gain < 0) throw Error('Invalid gain multiplier.');
  const channels = Array.from({length: buffer.numberOfChannels}, (_, ch) => Float32Array.from(buffer.getChannelData(ch), value => value * gain));
  return {numberOfChannels: channels.length, sampleRate: buffer.sampleRate, length: buffer.length, duration: buffer.length / buffer.sampleRate, getChannelData: ch => channels[ch]};
}

/** Encode straight from the original buffer with exactly the gain used in preview. */
export async function exportNormalizedWav(buffer, gain, bitDepth = 24) {
  if (![16,24].includes(bitDepth)) throw Error('Choose 16-bit or 24-bit WAV.');
  if (!Number.isFinite(gain) || gain < 0) throw Error('Invalid gain multiplier.');
  const nch = buffer.numberOfChannels, rate = buffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const dataBytes = buffer.length * nch * bytesPerSample;
  if (!Number.isSafeInteger(dataBytes) || dataBytes > 420 * 1024 * 1024) throw Error('Result exceeds 420 MB. Choose 16-bit WAV or a shorter file.');
  const bytes = new Uint8Array(44 + dataBytes), view = new DataView(bytes.buffer);
  const ascii = (off, value) => {for (let i=0;i<value.length;i++) view.setUint8(off+i,value.charCodeAt(i));};
  ascii(0,'RIFF'); view.setUint32(4,36+dataBytes,true); ascii(8,'WAVE'); ascii(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,nch,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*nch*bytesPerSample,true);
  view.setUint16(32,nch*bytesPerSample,true); view.setUint16(34,bitDepth,true);
  ascii(36,'data'); view.setUint32(40,dataBytes,true);
  const channels=Array.from({length:nch},(_,c)=>buffer.getChannelData(c));
  let index=44;
  for (let start=0;start<buffer.length;start+=32768) {
    const end=Math.min(buffer.length,start+32768);
    for (let frame=start;frame<end;frame++) for (let ch=0;ch<nch;ch++) {
      const value=Math.max(-1,Math.min(1,channels[ch][frame]*gain));
      if (bitDepth===16) {view.setInt16(index,Math.round(value<0?value*32768:value*32767),true);index+=2;}
      else {const n=Math.round(value<0?value*8388608:value*8388607);bytes[index++]=n&255;bytes[index++]=(n>>8)&255;bytes[index++]=(n>>16)&255;}
    }
    if (start && (start/32768)%8===0) await new Promise(resolve=>setTimeout(resolve,0));
  }
  return new Blob([bytes],{type:'audio/wav'});
}
