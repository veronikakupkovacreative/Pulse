import {analyzeTempo} from './analyzer.mjs';
import {detectKey,estimateTuning} from './studio-audio.mjs';

// Independent rhythm and harmony branches: a missing beat should not hide a key.
function fallbackWaveform(samples,count=220) {
  const values=new Array(count);
  let maximum=0;
  for(let i=0;i<count;i++){
    const start=Math.floor(i*samples.length/count),end=Math.floor((i+1)*samples.length/count);
    const step=Math.max(1,Math.floor((end-start)/160));
    let power=0,n=0;
    for(let j=start;j<end;j+=step){power+=samples[j]*samples[j];n++;}
    const value=Math.sqrt(power/(n||1));values[i]=value;maximum=Math.max(maximum,value);
  }
  return values.map(value=>maximum?value/maximum:0);
}

export function analyzeSong(samples,sampleRate) {
  if(!samples || !Number.isFinite(sampleRate) || sampleRate<=0 || samples.length<sampleRate*6)throw new Error('TOO_SHORT');
  let power=0;
  for(let i=0;i<samples.length;i+=128)power+=samples[i]*samples[i];
  if(power/Math.ceil(samples.length/128)<1e-9)throw new Error('SILENCE');
  let tempo=null,key=null,tuning=null,tempoError=null,keyError=null;
  try{tempo=analyzeTempo(samples,sampleRate);}catch(error){tempoError=error.message;}
  try{key=detectKey(samples,sampleRate);}catch(error){keyError=error.message;}
  // Only present a detuning estimate alongside a plausible pitched-signal result.
  if(key && key.confidence!=='low'){
    try{tuning=estimateTuning(samples,sampleRate);}catch{}
  }
  return {
    bpm:tempo?.bpm??null,
    confidence:tempo?.confidence??'unavailable',
    waveform:tempo?.waveform??fallbackWaveform(samples),
    duration:samples.length/sampleRate,
    analyzedWindows:tempo?.analyzedWindows??0,
    key,tuning,
    diagnostics:{rhythm:tempoError,harmony:keyError}
  };
}
