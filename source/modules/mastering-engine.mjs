/**
 * PULSE adaptive stereo mastering engine.
 * Browser-local DSP; not a neural model, certified LUFS meter or compliant true-peak limiter.
 * Measurements use BS.1770-inspired K-weighted 400 ms gated blocks and 4x cubic peak estimates.
 */
import {fromChannels} from './dsp.mjs';
import {analyzeSpectra} from './producer-dsp.mjs';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const dbGain=db=>Math.pow(10,db/20);
const gainDb=amp=>20*Math.log10(Math.max(amp,1e-12));
const get= (o,key,min,max,def)=>{
  const value=o[key]===undefined?def:Number(o[key]);
  if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid mastering parameter: '+key);
  return value;
};
export const MASTER_PRESETS=Object.freeze({
  trap:Object.freeze({name:'TRAP',target:-10.5,ceiling:-.9,threshold:-20,ratio:2.9,attack:24,release:170,tone:0,width:1.03,drive:12,bassEq:1.1,midEq:-.2,trebleEq:.2}),
  hiphop:Object.freeze({name:'HIP-HOP',target:-12,ceiling:-1,threshold:-19,ratio:2.4,attack:26,release:190,tone:0,width:1,drive:10,bassEq:.8,midEq:0,trebleEq:0}),
  edm:Object.freeze({name:'EDM',target:-10,ceiling:-.9,threshold:-21,ratio:3.1,attack:17,release:135,tone:0,width:1.06,drive:9,bassEq:.8,midEq:-.2,trebleEq:.7}),
  pop:Object.freeze({name:'POP',target:-12,ceiling:-1,threshold:-18,ratio:2.2,attack:24,release:220,tone:0,width:1.04,drive:6,bassEq:.3,midEq:.3,trebleEq:.6}),
  balanced:Object.freeze({name:'BALANCED',target:-14,ceiling:-1,threshold:-18,ratio:2.2,attack:20,release:180,tone:0,width:1,drive:8}),
  warm:Object.freeze({name:'WARM ANALOG',target:-14,ceiling:-1.2,threshold:-19,ratio:2,attack:28,release:230,tone:-1.6,width:.98,drive:22}),
  punch:Object.freeze({name:'PUNCHY CLUB',target:-10,ceiling:-.9,threshold:-21,ratio:3.2,attack:13,release:135,tone:.5,width:1.07,drive:15}),
  wide:Object.freeze({name:'WIDE ATMOSPHERE',target:-13,ceiling:-1.2,threshold:-17,ratio:1.9,attack:30,release:225,tone:1.3,width:1.24,drive:10}),
  streaming:Object.freeze({name:'STREAMING',target:-14,ceiling:-1,threshold:-16,ratio:1.8,attack:24,release:250,tone:0,width:1,drive:6}),
  glue:Object.freeze({name:'GENTLE GLUE',target:-16,ceiling:-1.2,threshold:-17,ratio:1.7,attack:35,release:300,tone:-.3,width:1,drive:5})
});
export function masteringSettings(input={}){
  return Object.freeze({
    target:get(input,'target',-20,-8,-14),
    ceiling:get(input,'ceiling',-3,-.3,-1),
    threshold:get(input,'threshold',-36,-6,-18),
    ratio:get(input,'ratio',1,8,2.2),
    attack:get(input,'attack',5,100,20),
    release:get(input,'release',60,800,180),
    tone:get(input,'tone',-4,4,0),
    width:get(input,'width',.65,1.35,1),
    drive:get(input,'drive',0,35,8),
    bassEq:get(input,'bassEq',-3,3,0),
    midEq:get(input,'midEq',-3,3,0),
    trebleEq:get(input,'trebleEq',-3,3,0)
  });
}
function biquad(type,sr,hz,db=0,q=.707){
  if(db===0&&(type==='lowshelf'||type==='peaking'||type==='highshelf'))return x=>x;
  hz=Math.min(hz,sr*.43);
  const w=2*Math.PI*hz/sr,c=Math.cos(w),s=Math.sin(w),alpha=s/(2*q),A=Math.pow(10,db/40);
  let b0,b1,b2,a0,a1,a2;
  if(type==='highshelf'){
    const t=2*Math.sqrt(A)*alpha;
    b0=A*((A+1)+(A-1)*c+t);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-t);
    a0=(A+1)-(A-1)*c+t;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-t;
  }else if(type==='lowshelf'){
    const t=2*Math.sqrt(A)*alpha;
    b0=A*((A+1)-(A-1)*c+t);b1=2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-t);
    a0=(A+1)+(A-1)*c+t;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-t;
  }else if(type==='peaking'){
    b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;
    a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;
  }else if(type==='highpass'){
    b0=(1+c)/2;b1=-(1+c);b2=b0;
    a0=1+alpha;a1=-2*c;a2=1-alpha;
  }else throw Error('Invalid K-weight filter');
  const coeffs=[b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
  let x1=0,x2=0,y1=0,y2=0;
  return x=>{
    const y=coeffs[0]*x+coeffs[1]*x1+coeffs[2]*x2-coeffs[3]*y1-coeffs[4]*y2;
    x2=x1;x1=x;y2=y1;y1=y;
    return y;
  };
}
const cubic=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
function checkBuffer(b){
  if(!b||!Number.isInteger(b.numberOfChannels)||b.numberOfChannels<1||b.numberOfChannels>8||
     !Number.isInteger(b.length)||b.length<1||!Number.isFinite(b.sampleRate)||b.sampleRate<8000||b.sampleRate>192000||
     typeof b.getChannelData!=='function')throw Error('Invalid audio buffer.');
  return b;
}
function estimateInterSamplePeak(data,i){
  const a=data[Math.max(i-1,0)],b=data[i],c=data[Math.min(i+1,data.length-1)],d=data[Math.min(i+2,data.length-1)];
  return Math.max(Math.abs(b),Math.abs(c),Math.abs(cubic(a,b,c,d,.25)),Math.abs(cubic(a,b,c,d,.5)),Math.abs(cubic(a,b,c,d,.75)));
}
export function measureMasteringAudio(audio,{truePeak=true}={}){
  const b=checkBuffer(audio),sr=b.sampleRate,count=b.numberOfChannels;
  const filters=Array.from({length:count},()=>[biquad('highshelf',sr,1681.97,4,.7071),biquad('highpass',sr,38,0,.5)]);
  const inputs=Array.from({length:count},(_,ch)=>b.getChannelData(ch));
  const block=Math.max(1,Math.round(.4*sr)),step=Math.max(1,Math.round(.1*sr));
  const energies=new Float64Array(block),blocks=[];
  let rolling=0,peak=0,tp=0,sum=0,cross=0,left=0,right=0;
  for(let i=0;i<b.length;i++){
    let weighted=0;
    for(let c=0;c<count;c++){
      const v=inputs[c][i];
      if(!Number.isFinite(v))throw Error('Audio contains invalid samples.');
      peak=Math.max(peak,Math.abs(v));sum+=v*v;
      const y=filters[c][1](filters[c][0](v));weighted+=y*y;
      if(truePeak)tp=Math.max(tp,estimateInterSamplePeak(inputs[c],i));
    }
    if(count===2){const a=inputs[0][i],d=inputs[1][i];cross+=a*d;left+=a*a;right+=d*d;}
    const slot=i%block;rolling+=weighted-energies[slot];energies[slot]=weighted;
    if(i>=block-1&&(i-(block-1))%step===0){
      const e=Math.max(0,rolling/block),loud=-.691+10*Math.log10(Math.max(e,1e-14));
      if(loud>=-70)blocks.push(e);
    }
  }
  const ms=sum/(count*b.length),rms=Math.sqrt(ms);
  if(!blocks.length&&b.length<block){
    const e=rolling/b.length;if(-.691+10*Math.log10(Math.max(e,1e-14))>=-70)blocks.push(e);
  }
  let integrated=-Infinity;
  if(blocks.length){
    const pre=blocks.reduce((a,v)=>a+v,0)/blocks.length;
    const threshold=Math.max(-70,-.691+10*Math.log10(pre)-10);
    const passing=blocks.filter(e=>-.691+10*Math.log10(e)>=threshold);
    if(passing.length)integrated=-.691+10*Math.log10(passing.reduce((a,v)=>a+v,0)/passing.length);
  }
  const corr=count===2?(left>1e-12&&right>1e-12?clamp(cross/Math.sqrt(left*right),-1,1):null):null;
  return Object.freeze({
    integratedLufs:integrated,samplePeakDb:peak>0?gainDb(peak):-Infinity,
    truePeakEstimateDb:truePeak?(tp>0?gainDb(tp):-Infinity):null,
    rmsDb:rms>0?gainDb(rms):-Infinity,
    crestDb:peak>0&&rms>0?gainDb(peak/rms):0,
    stereoCorrelation:corr,channels:count,duration:b.length/sr
  });
}
/** Conservative, explainable spectral/dynamic starting point. No neural model. */
export function recommendMasteringSettings(audio,presetId='streaming'){
  const b=checkBuffer(audio);
  const preset=MASTER_PRESETS[presetId];
  if(!preset)throw Error('Unknown mastering preset: '+presetId);
  const before=measureMasteringAudio(b,{truePeak:false});
  if(!Number.isFinite(before.integratedLufs))throw Error('Audio is silent or too quiet for mastering.');
  const frames=analyzeSpectra(b,{maxFrames:26});
  const bands=[0,0,0],counts=[0,0,0];
  for(const {re,im} of frames){
    const frameBands=[0,0,0],frameCounts=[0,0,0];
    for(let k=2;k<re.length/2;k++){
      const hz=k*b.sampleRate/re.length;if(hz<35||hz>Math.min(16000,b.sampleRate*.45))continue;
      const band=hz<180?0:hz<3500?1:2;
      const mag=re[k]*re[k]+im[k]*im[k];
      frameBands[band]+=mag;frameCounts[band]++;
    }
    for(let i=0;i<3;i++)if(frameCounts[i]){bands[i]+=frameBands[i]/frameCounts[i];counts[i]++;}
  }
  const avg=i=>bands[i]/Math.max(1,counts[i]);
  const lowVsMid=10*Math.log10((avg(0)+1e-10)/(avg(1)+1e-10));
  const highVsMid=10*Math.log10((avg(2)+1e-10)/(avg(1)+1e-10));
  const lowTargets={trap:12,hiphop:11,edm:10,pop:9,streaming:10};
  const highTargets={trap:-9,hiphop:-10,edm:-7,pop:-7,streaming:-9};
  const targetLow=lowTargets[presetId]??10,targetHigh=highTargets[presetId]??-9;
  const correction=(target,actual)=>Math.abs(target-actual)<3?0:clamp((target-actual)*.105,-1.6,1.6);
  // Keep adjustments subtle: without a reference track the ideal spectrum is unknowable.
  const bassEq=clamp((preset.bassEq??0)+correction(targetLow,lowVsMid),-3,3);
  const trebleEq=clamp((preset.trebleEq??0)+correction(targetHigh,highVsMid),-3,3);
  const crest=before.crestDb;
  const ratio=clamp(preset.ratio+(crest>14?.2:crest<7?-.3:0),1,8);
  const threshold=clamp(preset.threshold+(crest<7?2:crest>14?-1:0),-36,-6);
  // Very low correlation signals can be unstable if widened.
  const width=before.stereoCorrelation!==null&&before.stereoCorrelation<.12?Math.min(preset.width,.98):preset.width;
  const settings=masteringSettings({...preset,bassEq,trebleEq,ratio,threshold,width});
  return {settings,before,analysis:Object.freeze({
    bassVsMidDb:lowVsMid,trebleVsMidDb:highVsMid,crestDb:crest,
    stereoCorrelation:before.stereoCorrelation,
    spectralCorrectionDb:Object.freeze({bass:settings.bassEq,mid:settings.midEq,treble:settings.trebleEq}),
    reason:'Conservative band balance and crest-factor analysis; verify by ear.'
  })};
}
function colorAndCompress(b,settings){
  const input=Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c));
  const out=input.map(()=>new Float32Array(b.length));
  const sr=b.sampleRate,tone=settings.tone*.055,width=settings.width,drive=settings.drive/100;
  const colorMix=drive*.55,driveGain=1+drive*2.1;
  const lpAlpha=Math.exp(-2*Math.PI*150/sr),toneAlpha=Math.exp(-2*Math.PI*1200/sr);
  const tiltLP=new Float64Array(input.length);let lowSide=0;
  const eq=input.map(()=>[
    biquad('lowshelf',sr,115,settings.bassEq),
    biquad('peaking',sr,1250,settings.midEq,.84),
    biquad('highshelf',sr,6500,settings.trebleEq)
  ]);
  const attackCoef=Math.exp(-1/(sr*settings.attack*.001));
  const releaseCoef=Math.exp(-1/(sr*settings.release*.001));
  const threshold=settings.threshold,knee=6,ratio=settings.ratio;
  let detector=0,reduction=0,maxReduction=0;
  const values=new Float64Array(input.length);
  for(let i=0;i<b.length;i++){
    for(let c=0;c<input.length;c++){
      const filter=eq[c];
      const x=filter[2](filter[1](filter[0](input[c][i]))),low=tiltLP[c]=toneAlpha*tiltLP[c]+(1-toneAlpha)*x;
      let y=low*(1-tone)+(x-low)*(1+tone);
      if(drive>0){const saturated=Math.tanh(y*driveGain)/driveGain;y=y*(1-colorMix)+saturated*colorMix;}
      values[c]=y;
    }
    if(values.length===2){
      const mid=(values[0]+values[1])*.5,side=(values[0]-values[1])*.5;
      lowSide=lpAlpha*lowSide+(1-lpAlpha)*side;
      const highSide=side-lowSide;
      // Width=1 must leave the stereo field unchanged; bass width changes are gentler.
      const coloredSide=lowSide*(1+(width-1)*.35)+highSide*width;
      values[0]=mid+coloredSide;values[1]=mid-coloredSide;
    }
    let level=0;for(let c=0;c<values.length;c++)level=Math.max(level,Math.abs(values[c]));
    detector=(level>detector?attackCoef:releaseCoef)*detector+(1-(level>detector?attackCoef:releaseCoef))*level;
    const db=gainDb(detector),over=db-threshold;
    let gainReduction=0;
    if(over>knee/2)gainReduction=(1-1/ratio)*over;
    else if(over>-knee/2)gainReduction=(1-1/ratio)*(over+knee/2)*(over+knee/2)/(2*knee);
    const targetGain=dbGain(-gainReduction);
    reduction=(targetGain<reduction?attackCoef:releaseCoef)*reduction+(1-(targetGain<reduction?attackCoef:releaseCoef))*targetGain;
    // Starting at unity avoids crushing attack transients when the detector first starts.
    if(i===0)reduction=1;
    maxReduction=Math.max(maxReduction,-gainDb(Math.max(1e-8,reduction)));
    for(let c=0;c<values.length;c++)out[c][i]=values[c]*reduction;
  }
  return {out,maxReduction};
}
function limiting(out,sr,ceilingDb){
  const limit=dbGain(ceilingDb)*.995;
  const ahead=Math.max(1,Math.round(.004*sr)),size=ahead+4;
  const idx=new Int32Array(size),peaks=new Float64Array(size);
  let front=0,back=0,next=0,applied=1,minApplied=1;
  const release=Math.exp(-1/(sr*.18));
  const length=out[0].length;
  const peakAt=index=>{
    let peak=0;for(const data of out)peak=Math.max(peak,estimateInterSamplePeak(data,index));return peak;
  };
  for(let i=0;i<length;i++){
    const stop=Math.min(length-1,i+ahead);
    while(next<=stop){
      const value=peakAt(next);
      while(back>front&&peaks[(back-1)%size]<=value)back--;
      idx[back%size]=next;peaks[back%size]=value;back++;next++;
    }
    while(back>front&&idx[front%size]<i)front++;
    const highest=back>front?peaks[front%size]:0;
    const target=highest>limit?limit/highest:1;
    applied=target<applied?target:release*applied+(1-release)*target;
    minApplied=Math.min(minApplied,applied);
    for(const data of out)data[i]*=applied;
  }
  return {gainReductionDb:-gainDb(minApplied)};
}
/** One non-destructive render; call workspace.commit() only after listener confirmation. */
export function renderMasteringAudio(input,options={}){
  const b=checkBuffer(input),settings=masteringSettings(options);
  const before=measureMasteringAudio(b,{truePeak:true});
  if(!Number.isFinite(before.integratedLufs))throw Error('Audio is silent or too quiet for mastering.');
  const {out,maxReduction}=colorAndCompress(b,settings);
  const signal=fromChannels(out,b.sampleRate);
  const intermediate=measureMasteringAudio(signal,{truePeak:false});
  const targetDelta=settings.target-intermediate.integratedLufs;
  const makeupDb=clamp(Number.isFinite(targetDelta)?targetDelta:0,-12,12);
  const makeup=dbGain(makeupDb);
  for(const channel of out)for(let i=0;i<channel.length;i++)channel[i]*=makeup;
  const limited=limiting(out,b.sampleRate,settings.ceiling);
  let result=fromChannels(out,b.sampleRate),after=measureMasteringAudio(result,{truePeak:true});
  if(Number.isFinite(after.truePeakEstimateDb)&&after.truePeakEstimateDb>settings.ceiling-.015){
    const safetyDb=settings.ceiling-.05-after.truePeakEstimateDb;
    const trim=dbGain(Math.min(0,safetyDb));
    for(const channel of out)for(let i=0;i<channel.length;i++)channel[i]*=trim;
    result=fromChannels(out,b.sampleRate);after=measureMasteringAudio(result,{truePeak:true});
  }
  return {buffer:result,before,after,settings,
    processing:Object.freeze({makeupDb,maxCompressionDb:maxReduction,maxLimiterDb:limited.gainReductionDb,
      loudnessDelta:after.integratedLufs-before.integratedLufs,
      targetReached:Math.abs(after.integratedLufs-settings.target)<.8})};
}
