/** PULSE Studio local stereo DSP.
 * Mid/Side width, low-frequency mono, panning and vocal doubling run without a cloud model.
 * All functions preserve the source audio and return a new AudioBuffer-like value.
 */
import {fromChannels} from './dsp.mjs';
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const gains=db=>Math.pow(10,db/20);

function input(buffer){
 if(!buffer||!Number.isInteger(buffer.length)||!buffer.length||
   !Number.isFinite(buffer.sampleRate)||buffer.sampleRate<8000||
   ![1,2].includes(buffer.numberOfChannels))
   throw Error('Load a mono or stereo audio track first.');
 return {left:buffer.getChannelData(0),right:buffer.numberOfChannels===2?
  buffer.getChannelData(1):buffer.getChannelData(0),length:buffer.length,rate:buffer.sampleRate,
  mono:buffer.numberOfChannels===1};
}
function protectedOutput(left,right,rate){
 let peak=0;
 for(let i=0;i<left.length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
 const gain=peak>0.98?0.98/peak:1;
 if(gain<1)for(let i=0;i<left.length;i++){left[i]*=gain;right[i]*=gain;}
 return {buffer:fromChannels([left,right],rate),
   protectionDb:gain<1?Math.round(20*Math.log10(gain)*10)/10:0};
}
export function analyzeStereo(buffer){
 const {left,right,length,mono}=input(buffer);
 // Constant bounded analysis, even for 20-minute material.
 const stride=Math.max(1,Math.floor(length/160000));
 let ll=0,rr=0,lr=0,side=0,mid=0,peak=0,n=0;
 for(let i=0;i<length;i+=stride){
  const a=left[i]||0,b=right[i]||0;
  ll+=a*a;rr+=b*b;lr+=a*b;
  const m=(a+b)*.5,s=(a-b)*.5;mid+=m*m;side+=s*s;
  peak=Math.max(peak,Math.abs(a),Math.abs(b));n++;
 }
 const corr=ll>1e-12&&rr>1e-12?clamp(lr/Math.sqrt(ll*rr),-1,1):null;
 const rms=Math.sqrt((ll+rr)/Math.max(2*n,1));
 return {channels:mono?1:2,correlation:corr,sideToMidDb:
  10*Math.log10(Math.max(side,1e-12)/Math.max(mid,1e-12)),
  peakDb:20*Math.log10(Math.max(peak,1e-8)),
  rmsDb:20*Math.log10(Math.max(rms,1e-8)),
  monoCompatible:corr===null?null:corr>=0};
}
export function renderStereoLab(buffer,options={}){
 const {left,right,length,rate}=input(buffer);
 if(length*2*4>240*1024*1024)throw Error('Stereo processing exceeds the 240 MB audio limit.');
 const width=clamp(number(options.width,100),0,200)/100;
 const bassMono=clamp(number(options.bassMonoHz,120),40,280);
 const pan=clamp(number(options.pan,0),-100,100)/100;
 const db=clamp(number(options.outputGainDb,0),-12,6);
 const gain=gains(db),panLeft=Math.cos((pan+1)*Math.PI/4)*Math.SQRT2,
  panRight=Math.sin((pan+1)*Math.PI/4)*Math.SQRT2;
 // Remove low-band channel differences, leave the high-band controllable via Mid/Side.
 const alpha=1-Math.exp(-2*Math.PI*bassMono/rate);
 const outL=new Float32Array(length),outR=new Float32Array(length);
 let lowL=0,lowR=0;
 for(let i=0;i<length;i++){
  const l=left[i],r=right[i];
  lowL+=alpha*(l-lowL);lowR+=alpha*(r-lowR);
  const low=(lowL+lowR)*.5;
  const hiL=l-lowL,hiR=r-lowR;
  const mid=(hiL+hiR)*.5,side=(hiL-hiR)*.5*width;
  outL[i]=(low+mid+side)*gain*panLeft;
  outR[i]=(low+mid-side)*gain*panRight;
 }
 const output=protectedOutput(outL,outR,rate);
 return {...output,before:analyzeStereo(buffer),after:analyzeStereo(output.buffer)};
}
/** Short stereo-microshift. Two distinct modulated delays preserve intelligibility.
 * NOT auto-tune, source separation, or cloned/generated vocals.
 */
export function renderVocalDoubler(buffer,options={}){
 const {left,right,length,rate}=input(buffer);
 if(length*2*4>240*1024*1024)throw Error('Doubler exceeds the 240 MB audio limit.');
 const delayMs=clamp(number(options.delayMs,22),12,45);
 const depthMs=clamp(number(options.depthMs,1.4),0,3.5);
 const rateHz=clamp(number(options.modulationHz,0.62),.12,1.8);
 const amount=clamp(number(options.mix,35),0,75)/100;
 const widen=clamp(number(options.width,100),0,200)/100;
 const outL=new Float32Array(length),outR=new Float32Array(length);
 const tap=(signal,pos)=>{
  if(pos<0)return 0;
  const a=Math.floor(pos),fraction=pos-a;
  if(a+1>=length)return signal[Math.min(a,length-1)]||0;
  return signal[a]*(1-fraction)+signal[a+1]*fraction;
 };
 const d0=delayMs*rate/1000,depth=depthMs*rate/1000;
 // Dry centre remains mono-compatible; the effect lives at different tap timings L/R.
 for(let i=0;i<length;i++){
  const t=i/rate,dry=.5*(left[i]+right[i]);
  const a=tap(left,i-d0-depth*Math.sin(2*Math.PI*rateHz*t));
  const b=tap(right,i-(d0+5*rate/1000)-depth*Math.sin(2*Math.PI*rateHz*.91*t+Math.PI*.61));
  const wetMid=(a+b)*.5,wetSide=(a-b)*.5*widen;
  const baseL=(1-amount)*left[i],baseR=(1-amount)*right[i];
  outL[i]=baseL+amount*(wetMid+wetSide);
  outR[i]=baseR+amount*(wetMid-wetSide);
 }
 const output=protectedOutput(outL,outR,rate);
 return {...output,before:analyzeStereo(buffer),after:analyzeStereo(output.buffer)};
}
