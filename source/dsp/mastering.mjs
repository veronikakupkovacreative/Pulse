import {integratedLoudness} from './quick-tools.mjs';
// Pulse Smart Master v1: adaptive, deterministic offline DSP. No neural model.
// All operations happen on the client, and no source channel is mutated.
const masterClamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function validate(channels,rate){
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||
    !channels[0]?.length||channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==channels[0].length))
    throw Error('Mastering requires valid mono or stereo audio.');
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error('Unsupported sample rate.');
  if(channels[0].length*channels.length>30_000_000)throw Error('Browser mastering supports up to 30 million PCM samples (roughly 5 minutes at stereo 48 kHz).');
  if(channels[0].length/rate<0.8)throw Error('Mastering requires at least 0.8 seconds of audio.');
}
function biquad(rate,frequency,gainDb,type){
  const A=10**(gainDb/40),w=2*Math.PI*masterClamp(frequency,1,rate*.45)/rate;
  const cos=Math.cos(w),sin=Math.sin(w),alpha=sin/Math.SQRT2;
  const beta=2*Math.sqrt(A)*alpha;
  let b0,b1,b2,a0,a1,a2;
  if(type==='low'){
    b0=A*((A+1)-(A-1)*cos+beta);
    b1=2*A*((A-1)-(A+1)*cos);
    b2=A*((A+1)-(A-1)*cos-beta);
    a0=(A+1)+(A-1)*cos+beta;
    a1=-2*((A-1)+(A+1)*cos);
    a2=(A+1)+(A-1)*cos-beta;
  }else{
    b0=A*((A+1)+(A-1)*cos+beta);
    b1=-2*A*((A-1)+(A+1)*cos);
    b2=A*((A+1)+(A-1)*cos-beta);
    a0=(A+1)-(A-1)*cos+beta;
    a1=2*((A-1)-(A+1)*cos);
    a2=(A+1)-(A-1)*cos-beta;
  }
  return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
function filter(channel,coeff){
  const [b0,b1,b2,a1,a2]=coeff,out=new Float32Array(channel.length);
  let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<channel.length;i++){
    const x=channel[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
    out[i]=y;x2=x1;x1=x;y2=y1;y1=y;
  }
  return out;
}
function rms(channels){
  let energy=0;for(const channel of channels)for(let i=0;i<channel.length;i++)energy+=channel[i]*channel[i];
  return Math.sqrt(energy/(channels[0].length*channels.length));
}
function maxPeak(channels){let peak=0;for(const c of channels)for(const s of c)peak=Math.max(peak,Math.abs(s));return peak;}
function db(v){return v>1e-12?20*Math.log10(v):-120;}
function energyBand(channels,rate,frequency){
  // A 1-pole low-pass only for deriving a gentle EQ recommendation.
  const alpha=1-Math.exp(-2*Math.PI*frequency/rate);
  let low=0,high=0,middle=0;
  const step=Math.max(1,Math.floor(rate/12000));
  for(const ch of channels){
    let lp=0;for(let i=0;i<ch.length;i+=step){const x=ch[i];lp+=alpha*(x-lp);low+=lp*lp;high+=(x-lp)*(x-lp);middle+=x*x;}
  }
  return {low,high,total:middle};
}
export function analyzeMaster(channels,rate){
  validate(channels,rate);
  const peak=maxPeak(channels),r=rms(channels);
  if(peak<1e-8||r<1e-8)throw Error('Silent audio cannot be meaningfully mastered.');
  const low=energyBand(channels,rate,180),high=energyBand(channels,rate,4200);
  const lowShare=Math.sqrt(low.low/Math.max(1e-12,low.total));
  const highShare=Math.sqrt(high.high/Math.max(1e-12,high.total));
  const loudness=integratedLoudness(channels,rate); // bundled from quick-tools
  return {peakDb:db(peak),rmsDb:db(r),crestDb:db(peak/r),lufs:loudness,
    lowShare,highShare,channels:channels.length,rate,duration:channels[0].length/rate};
}
export function designMaster(analysis,preset='balanced',targetLufs){
  if(!['balanced','warm','loud'].includes(preset))throw Error('Invalid mastering preset.');
  const presetTarget={balanced:-13,warm:-14,loud:-10}[preset];
  const target=targetLufs===undefined?presetTarget:Number(targetLufs);
  if(!Number.isFinite(target)||target<-22||target>-8)throw Error('Target LUFS must be between -22 and -8.');
  // Conservative shelves: no attempt to force a universal tonal profile.
  const lowDb=masterClamp((.49-analysis.lowShare)*4.4+(preset==='warm'?.65:preset==='loud'?.25:0),-1.5,1.5);
  const highDb=masterClamp((.37-analysis.highShare)*4.2+(preset==='warm'?-.9:preset==='loud'?.25:0),-1.5,1.5);
  const ratio=analysis.crestDb>15?(preset==='loud'?1.9:1.45):analysis.crestDb>9?(preset==='loud'?1.5:1.25):1.1;
  const thresholdDb=masterClamp(analysis.rmsDb+5.5,-32,-9);
  return {preset,targetLufs:target,lowDb,highDb,ratio,thresholdDb,ceilingDb:-1.2};
}
function compress(channels,rate,settings){
  const result=channels.map(c=>new Float32Array(c.length));
  const attack=Math.exp(-1/(.012*rate)),release=Math.exp(-1/(.160*rate));
  let envelope=0,gain=1;
  for(let i=0;i<channels[0].length;i++){
    let peak=0;for(let c=0;c<channels.length;c++)peak=Math.max(peak,Math.abs(channels[c][i]));
    const weight=peak>envelope?attack:release;
    envelope=weight*envelope+(1-weight)*peak;
    const level=db(envelope);
    // 5 dB soft knee at threshold.
    const knee=5,delta=level-settings.thresholdDb;
    let gainDb=0;
    if(delta>=knee/2)gainDb=(1/settings.ratio-1)*delta;
    else if(delta>-knee/2)gainDb=(1/settings.ratio-1)*(delta+knee/2)**2/(2*knee);
    const intended=10**(gainDb/20),smoothing=intended<gain?attack:release;
    gain=smoothing*gain+(1-smoothing)*intended;
    for(let c=0;c<channels.length;c++)result[c][i]=channels[c][i]*gain;
  }
  return result;
}
function limit(channels,rate,ceilingDb){
  const n=channels[0].length,look=Math.max(1,Math.round(rate*.003));
  const limit=10**(ceilingDb/20);
  // Sliding maximum lookahead with a monotonic deque, bounded O(n).
  const peaks=new Float32Array(n),deque=new Int32Array(n);let head=0,tail=0;
  for(let i=0;i<n;i++){
    let v=0;for(let c=0;c<channels.length;c++)v=Math.max(v,Math.abs(channels[c][i]));
    peaks[i]=v;
  }
  const output=channels.map(c=>new Float32Array(n));
  const release=Math.exp(-1/(rate*.1));let gain=1;
  for(let i=0;i<n;i++){
    const end=Math.min(n,i+look+1);
    // Only add new future samples to the deque.
    const from=Math.min(n,i===0?0:i+look);
    for(let j=from;j<end;j++){
      while(tail>head&&peaks[deque[tail-1]]<=peaks[j])tail--;
      deque[tail++]=j;
    }
    while(tail>head&&deque[head]<i)head++;
    const future=tail>head?peaks[deque[head]]:peaks[i];
    const desired=future>limit?limit/future:1;
    gain=desired<gain?desired:release*gain+(1-release)*desired;
    for(let c=0;c<channels.length;c++)output[c][i]=masterClamp(channels[c][i]*gain,-limit,limit);
  }
  return output;
}
export function processMaster(channels,rate,{preset='balanced',targetLufs}={}){
  validate(channels,rate);
  const before=analyzeMaster(channels,rate),settings=designMaster(before,preset,targetLufs);
  const low=biquad(rate,180,settings.lowDb,'low'),high=biquad(rate,4000,settings.highDb,'high');
  const eq=channels.map(ch=>filter(filter(ch,low),high));
  const compressed=compress(eq,rate,settings);
  const measured=integratedLoudness(compressed,rate);
  const correction=masterClamp(settings.targetLufs-measured,-9,9);
  const multiplier=10**(correction/20);
  const gained=compressed.map(ch=>Float32Array.from(ch,s=>s*multiplier));
  const output=limit(gained,rate,settings.ceilingDb);
  const after=analyzeMaster(output,rate);
  return {channels:output,settings:{...settings,appliedGainDb:correction},before,after,
    notes:[
      'Smart Master v1 uses local adaptive DSP, not a neural model.',
      'The ceiling protects sample peaks, not measured inter-sample true peaks.',
      'Target LUFS is an estimate; the limiter and source material may prevent an exact match.'
    ]};
}
