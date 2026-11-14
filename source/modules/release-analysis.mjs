/**
 * Local, full-length release preflight for the shared SOURCE AUDIO buffer.
 * Loudness is measured using K-weighted absolute/relative gated 400 ms blocks.
 * 4x interpolated peak is an estimate, not a certified BS.1770 true-peak reading.
 * No file upload, URL, cloud dependency or truncation.
 */
import {audioMetrics} from './dsp.mjs';

const logDb=value=>value>0?10*Math.log10(value):-Infinity;
const peakDb=value=>value>0?20*Math.log10(value):-Infinity;
const fmt=value=>Number.isFinite(value)?Number(value.toFixed(2)):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function biquad(type,rate,freq,q=0.7071,gain=0){
 const omega=2*Math.PI*Math.min(freq,rate*.48)/rate;
 const cos=Math.cos(omega),sin=Math.sin(omega),alpha=sin/(2*q);
 let b0,b1,b2,a0,a1,a2;
 if(type==='highpass'){
  b0=(1+cos)/2;b1=-(1+cos);b2=(1+cos)/2;
  a0=1+alpha;a1=-2*cos;a2=1-alpha;
 }else{
  const A=10**(gain/40),sqrtA=Math.sqrt(A),aa=sin/2*Math.sqrt((A+1/A)*(1/q-1)+2);
  b0=A*((A+1)+(A-1)*cos+2*sqrtA*aa);
  b1=-2*A*((A-1)+(A+1)*cos);
  b2=A*((A+1)+(A-1)*cos-2*sqrtA*aa);
  a0=(A+1)-(A-1)*cos+2*sqrtA*aa;
  a1=2*((A-1)-(A+1)*cos);
  a2=(A+1)-(A-1)*cos-2*sqrtA*aa;
 }
 return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0,x1:0,x2:0,y1:0,y2:0};
}
function filter(state,input){
 const out=state.b0*input+state.b1*state.x1+state.b2*state.x2-state.a1*state.y1-state.a2*state.y2;
 state.x2=state.x1;state.x1=input;state.y2=state.y1;state.y1=out;return out;
}
function weightedBlockLufs(energies){
 if(energies.length<4)return {integrated:null,lra:null};
 const blocks=[];
 for(let i=0;i+3<energies.length;i++){
  const e=(energies[i]+energies[i+1]+energies[i+2]+energies[i+3])/4;
  blocks.push({energy:e,lufs:-.691+logDb(e)});
 }
 const above=blocks.filter(b=>b.lufs>-70);
 if(!above.length)return {integrated:null,lra:null};
 const ungated=-.691+logDb(above.reduce((sum,b)=>sum+b.energy,0)/above.length);
 const threshold=Math.max(-70,ungated-10);
 const gated=above.filter(b=>b.lufs>threshold);
 const integrated=gated.length?-.691+logDb(gated.reduce((sum,b)=>sum+b.energy,0)/gated.length):null;
 // Short-term (3 s) range is informational, not full EBU R128 LRA.
 const short=[];
 for(let i=0;i+29<energies.length;i+=10){
  let energy=0;for(let j=i;j<i+30;j++)energy+=energies[j];
  const loud=-.691+logDb(energy/30);
  if(loud>Math.max(-70,(integrated??-70)-20))short.push(loud);
 }
 short.sort((a,b)=>a-b);
 const lra=short.length>=3?short[Math.floor((short.length-1)*.95)]-short[Math.floor((short.length-1)*.10)]:null;
 return {integrated:fmt(integrated),lra:fmt(lra)};
}

/** Async analyzer. Frames are yielded periodically to keep the UI responsive. */
export async function analyzeReleaseBuffer(buffer,{signal,onProgress=()=>{}}={}){
 if(!buffer||!Number.isFinite(buffer.sampleRate)||buffer.length<buffer.sampleRate*.4||
    buffer.numberOfChannels<1||buffer.numberOfChannels>8)throw Error('Load at least 0.4 seconds of valid audio into 01 / SOURCE AUDIO.');
 const rate=buffer.sampleRate,n=buffer.length,channels=buffer.numberOfChannels;
 const chunk=Math.max(8192,Math.floor(rate/10)),step=Math.max(1,Math.floor(rate*.1));
 const energies=[],samples=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
 const weights=samples.map(()=>({high:biquad('highshelf',rate,1681.974,1,4),hp:biquad('highpass',rate,38,0.5)}));
 let accumulated=0,slot=0,peak=0,truePeak=0,clipped=0;
 const rmsBlocks=[];let blockRms=0,blockSamples=0;
 for(let index=0;index<n;index++){
  if(signal?.aborted)throw Object.assign(Error('Analysis cancelled.'),{name:'AbortError'});
  let energy=0;
  for(let c=0;c<channels;c++){
   const v=samples[c][index];
   const abs=Math.abs(v);
   peak=Math.max(peak,abs);if(abs>=.999)clipped++;
   const weighted=filter(weights[c].hp,filter(weights[c].high,v));
   energy+=weighted*weighted;
   blockRms+=v*v;blockSamples++;
   if(index>=1){
    const prev=samples[c][index-1],next=samples[c][Math.min(n-1,index+1)];
    const before=samples[c][Math.max(0,index-2)];
    // Cubic interpolation, four sub-sample locations; indicative only.
    for(const t of [.25,.5,.75]){
     const a=2*prev,b=next-before,c2=2*before-5*prev+4*v-next,d=-before+3*prev-3*v+next;
     const interpolated=.5*(a+(b+(c2+d*t)*t)*t);
     truePeak=Math.max(truePeak,Math.abs(interpolated));
    }
   }
  }
  accumulated+=energy/channels;
  if((index+1)%step===0||index===n-1){
   const frames=(index+1)-slot;
   energies.push(accumulated/frames);
   accumulated=0;slot=index+1;
   rmsBlocks.push(Math.sqrt(blockRms/Math.max(1,blockSamples)));
   blockRms=0;blockSamples=0;
  }
  if((index+1)%Math.max(chunk*5,rate*2|0)===0){
   onProgress(Math.round((index+1)/n*100));
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 const {integrated,lra}=weightedBlockLufs(energies);
 const low=rmsBlocks.filter(v=>v>0).sort((a,b)=>a-b);
 const floor=low.length?low[Math.floor((low.length-1)*.1)]:0;
 const metrics=audioMetrics(buffer);
 onProgress(100);
 return {
  durationSeconds:fmt(buffer.duration||n/rate),sampleRate:rate,channels,
  integratedLufs:integrated,loudnessRangeLu:lra,
  samplePeakDbfs:fmt(peakDb(peak)),
  estimatedTruePeakDbtp:fmt(peakDb(Math.max(peak,truePeak))),
  rmsDbfs:fmt(metrics.rmsDb),
  noiseFloorDbfs:fmt(peakDb(floor)),
  clippedSamples:clipped,
  peakStatus:peakDb(Math.max(peak,truePeak))<=-1?'pass':'review',
  clippingStatus:clipped===0?'pass':'review',
  accuracyNote:'Integrated LUFS uses K-weighting and two-stage gating. True peak is estimated with 4× cubic interpolation and is not a certified true-peak measurement; confirm final releases with a calibrated meter.'
 };
}
