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

// Reject false tempo candidates in essentially static harmonic material.
// This deliberately only handles nearly flat envelopes, not moderately compressed music.
function hasRhythmicDynamics(samples,sampleRate){
  const hop=Math.max(256,Math.round(sampleRate*.03));
  const frames=Math.floor(samples.length/hop);
  let sum=0,sumSquared=0,delta=0,previous=0;
  for(let f=0;f<frames;f++){
    let energy=0;const start=f*hop;
    for(let i=start;i<start+hop;i++)energy+=samples[i]*samples[i];
    const rms=Math.sqrt(energy/hop);
    sum+=rms;sumSquared+=rms*rms;
    if(f)delta+=Math.abs(rms-previous);
    previous=rms;
  }
  const average=sum/frames;
  if(average<1e-6)return false;
  const variation=Math.sqrt(Math.max(0,sumSquared/frames-average*average))/average;
  const changes=delta/Math.max(1,frames-1)/average;
  return variation>=.04||changes>=.025;
}

export function analyzeSong(samples,sampleRate) {
  if(!samples || !Number.isFinite(sampleRate) || sampleRate<=0 || samples.length<sampleRate*6)throw new Error('TOO_SHORT');
  let power=0;
  for(let i=0;i<samples.length;i+=128)power+=samples[i]*samples[i];
  if(power/Math.ceil(samples.length/128)<1e-9)throw new Error('SILENCE');
  let tempo=null,key=null,tuning=null,tempoError=null,keyError=null;
  try{if(hasRhythmicDynamics(samples,sampleRate))tempo=analyzeTempo(samples,sampleRate);else tempoError='NO_RHYTHM';}catch(error){tempoError=error.message;}
  try{
    key=detectKey(samples,sampleRate);
    // A single spectral pitch cannot establish a major/minor key reliably.
    const chroma=key.chroma;
    const total=chroma.reduce((sum,value)=>sum+value,0);
    if(total>0&&Math.max(...chroma)/total>.6){key=null;keyError='INSUFFICIENT_HARMONY';}
  }catch(error){keyError=error.message;}
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
