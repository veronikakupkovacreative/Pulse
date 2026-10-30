import {integratedLoudness} from './quick-tools.mjs';
import {truePeakDb,limitTruePeak} from './true-peak.mjs';
import {stereoHealth,mixHealthFindings,applyStereoWidth} from './mix-health.mjs';
import {analyzeSpectrum,spectrumFindings} from './spectral-health.mjs';
import {eqResponseCurve,peakingBiquad} from './eq-response.mjs';
// Pulse Smart Master v2.3: adaptive, deterministic offline DSP. No neural model.
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
function stereoCorrelation(channels){
  if(channels.length!==2)return null;
  const [l,r]=channels;let ll=0,rr=0,lr=0;
  for(let i=0;i<l.length;i++){ll+=l[i]*l[i];rr+=r[i]*r[i];lr+=l[i]*r[i];}
  return ll>0&&rr>0?masterClamp(lr/Math.sqrt(ll*rr),-1,1):null;
}
function shortTermAndRange(channels,rate){
  const n=channels[0].length;
  const slice=(from,to)=>channels.map(ch=>ch.subarray(from,to));
  const shortLength=Math.min(n,Math.round(rate*3));
  const shortTerm=n>=rate*.4?integratedLoudness(slice(n-shortLength,n),rate):null;
  if(n<rate*6)return {shortTermLufs:shortTerm,lraEstimateDb:null};
  const window=Math.round(3*rate),available=Math.max(1,n-window);
  const count=Math.min(30,Math.floor(n/rate)-2);
  const values=[];
  for(let j=0;j<count;j++){
    const from=Math.min(available,Math.round(j*available/Math.max(1,count-1)));
    const l=integratedLoudness(slice(from,Math.min(n,from+window)),rate);
    if(Number.isFinite(l)&&l> -70)values.push(l);
  }
  if(values.length<3)return {shortTermLufs:shortTerm,lraEstimateDb:null};
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const gated=values.filter(v=>v>=mean-20).sort((a,b)=>a-b);
  if(gated.length<3)return {shortTermLufs:shortTerm,lraEstimateDb:null};
  const at=p=>{const i=p*(gated.length-1),a=Math.floor(i);return gated[a]+(gated[Math.min(gated.length-1,a+1)]-gated[a])*(i-a);};
  return {shortTermLufs:shortTerm,lraEstimateDb:at(.95)-at(.10)};
}
export function analyzeMaster(channels,rate){
  validate(channels,rate);
  const peak=maxPeak(channels),r=rms(channels);
  if(peak<1e-8||r<1e-8)throw Error('Silent audio cannot be meaningfully mastered.');
  const low=energyBand(channels,rate,180),high=energyBand(channels,rate,4200);
  const lowShare=Math.sqrt(low.low/Math.max(1e-12,low.total));
  const highShare=Math.sqrt(high.high/Math.max(1e-12,high.total));
  const loudness=integratedLoudness(channels,rate);
  const dynamics=shortTermAndRange(channels,rate),stereo=stereoHealth(channels),spectrum=analyzeSpectrum(channels,rate);
  return {peakDb:db(peak),truePeakDb:truePeakDb(channels),rmsDb:db(r),crestDb:db(peak/r),
    lufs:loudness,...dynamics,...stereo,spectrum,
    lowShare,highShare,channels:channels.length,rate,duration:channels[0].length/rate};
}
export function designMaster(analysis,preset='balanced',targetLufs,{intensity=45,ceilingDb=-1,eqMode='gentle',dynamicsMode='balanced'}={}){
  if(!['balanced','warm','loud','punchy'].includes(preset))throw Error('Invalid mastering preset.');
  const presetTarget={balanced:-13,warm:-14,loud:-10,punchy:-12}[preset];
  const target=targetLufs===undefined?presetTarget:Number(targetLufs);
  if(!Number.isFinite(target)||target<-22||target>-8)throw Error('Target LUFS must be between -22 and -8.');
  if(!Number.isFinite(intensity)||intensity<0||intensity>100)throw Error('Intensity must be 0–100%.');
  if(![-1,-2,-.3].includes(Number(ceilingDb)))throw Error('Unsupported true-peak ceiling.');
  if(!['gentle','off'].includes(eqMode))throw Error('Invalid EQ mode.');
  if(!['balanced','preserve','control'].includes(dynamicsMode))throw Error('Invalid dynamics mode.');
  const strength=intensity/100,eqStrength=eqMode==='off'?0:strength;
  const lowDb=masterClamp((.49-analysis.lowShare)*4.4+(preset==='warm'?.65:preset==='loud'?.25:preset==='punchy'?-.25:0),-1.5,1.5)*eqStrength;
  const highDb=masterClamp((.37-analysis.highShare)*4.2+(preset==='warm'?-.9:preset==='loud'?.25:preset==='punchy'?.10:0),-1.5,1.5)*eqStrength;
  const lowmid=analysis.spectrum?.find(b=>b.id==='lowmid')?.share||0;
  const midDb=lowmid>.42?-Math.min(.9,(lowmid-.42)*3)*eqStrength:0;
  const targetRatio=analysis.crestDb>15?(preset==='loud'?1.9:preset==='punchy'?1.20:1.45):analysis.crestDb>9?(preset==='loud'?1.5:preset==='punchy'?1.12:1.25):1.07;
  const ratio=1+(targetRatio-1)*strength;
  const thresholdDb=masterClamp(analysis.rmsDb+(preset==='punchy'?7:5.5),-32,-9);
  const timing={balanced:{attackMs:12,releaseMs:160},preserve:{attackMs:30,releaseMs:220},control:{attackMs:5,releaseMs:95}}[dynamicsMode];
  return {preset,targetLufs:target,lowDb,midDb,highDb,ratio,thresholdDb,ceilingDb:Number(ceilingDb),intensity,eqMode,dynamicsMode,...timing};
}
function compress(channels,rate,settings){
  const result=channels.map(c=>new Float32Array(c.length));
  const attack=Math.exp(-1/(settings.attackMs*.001*rate)),release=Math.exp(-1/(settings.releaseMs*.001*rate));
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
export function processMaster(channels,rate,{preset='balanced',targetLufs,intensity=45,ceilingDb=-1,stereoWidth=1,eqMode='gentle',dynamicsMode='balanced'}={}){
  validate(channels,rate);
  const before=analyzeMaster(channels,rate),settings=designMaster(before,preset,targetLufs,{intensity,ceilingDb,eqMode,dynamicsMode});
  const low=biquad(rate,180,settings.lowDb,'low'),high=biquad(rate,4000,settings.highDb,'high');
  const mid=peakingBiquad(rate,320,settings.midDb,0.9);
  const eqCurve=eqResponseCurve([low,mid,high],rate);
  const eq=channels.map(ch=>filter(filter(filter(ch,low),mid),high));
  const compressed=settings.ratio>1.001?compress(eq,rate,settings):eq;
  const widened=applyStereoWidth(compressed,stereoWidth);
  const measured=integratedLoudness(widened,rate);
  const correction=masterClamp(settings.targetLufs-measured,-9,9);
  const multiplier=10**(correction/20);
  const gained=widened.map(ch=>Float32Array.from(ch,s=>s*multiplier));
  const limited=limitTruePeak(gained,rate,settings.ceilingDb);
  const output=limited.channels,after=analyzeMaster(output,rate);
  const findings=[...mixHealthFindings(before).filter(x=>x.code!=='balanced'),...spectrumFindings(before.spectrum)];
  if(!findings.length)findings.push({code:'balanced',label:'NO CRITICAL ISSUES',evidence:'No thresholds exceeded',detail:'Preserve the mix unless listening reveals a problem.'});
  return {channels:output,findings,settings:{...settings,stereoWidth,appliedGainDb:correction,
      maxReductionDb:limited.maxReductionDb,safetyTrimDb:limited.safetyTrimDb},
    before,after,eqCurve,notes:[
      'Local deterministic mastering DSP; no neural mastering model.',
      'True peak uses 4x windowed-sinc reconstruction. Independent certification is not implied.',
      'Loudness Range is an estimate; requested LUFS may remain unattainable without excessive limiting.'
    ]};
}
