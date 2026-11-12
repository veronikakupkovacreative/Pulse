/** Essentia.js 0.1.3 experimental WebAssembly DSP.
 * This code is an independently authored PULSE integration; Essentia.js is
 * AGPL-3.0. Review the copyleft obligations before any production release.
 * The renderer is agnostic to the underlying analytical engine.
 */
export const ESSENTIA_VERSION='0.1.3';
const CAM_MAJOR=['8B','3B','10B','5B','12B','7B','2B','9B','4B','11B','6B','1B'];
const CAM_MINOR=['5A','12A','7A','2A','9A','4A','11A','6A','1A','8A','3A','10A'];
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENHARMONIC={Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B',Fb:'E','E#':'F','B#':'C'};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const r2=n=>Math.round(n*100)/100;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const deleteVector=v=>{try{v?.delete?.();}catch{}};
export function camelotCode(key,scale){
 const normalized=ENHARMONIC[key]||key,idx=NOTE_NAMES.indexOf(normalized);
 if(idx<0)return null;
 return /^min/i.test(scale)?CAM_MINOR[idx]:/^maj/i.test(scale)?CAM_MAJOR[idx]:null;
}
export function bpmCandidates(primary,estimates=[]){
 if(!finite(primary)||primary<=0)return [];
 const alternatives=[],raw=[...estimates].filter(v=>finite(v)&&v>=40&&v<=240);
 const bins=[];
 for(const estimate of raw){
  const existing=bins.find(x=>Math.abs(x.center-estimate)<2);
  if(existing){existing.values.push(estimate);existing.center=existing.values.reduce((a,b)=>a+b,0)/existing.values.length;}
  else bins.push({center:estimate,values:[estimate]});
 }
 bins.sort((a,b)=>b.values.length-a.values.length);
 for(const x of bins){
  if(Math.abs(x.center-primary)<1.5||alternatives.some(v=>Math.abs(v.bpm-x.center)<1.5))continue;
  if(x.values.length<Math.max(2,raw.length*.065))continue;
  alternatives.push({bpm:r2(x.center),support:r2(x.values.length/Math.max(1,raw.length))});
  if(alternatives.length>=3)break;
 }
 return alternatives;
}
export function cleanMeasuredBeats(ticks,duration,offset=0){
 const sorted=[...ticks].filter(n=>finite(n)&&n>=0&&n<=duration)
  .map(t=>r2(t+offset)).sort((a,b)=>a-b);
 return sorted.filter((x,i)=>i===0||x-sorted[i-1]>=.055);
}
export function rhythmResultFromWasm(data,{offset=0,duration,rawConfidence=null}={}){
 const bpm=Number(data?.bpm);
 if(!finite(bpm)||bpm<35||bpm>250)throw Error('Essentia could not detect a reliable BPM.');
 const rel=cleanMeasuredBeats(data?.ticks||[],duration,offset),intervals=[];
 for(let i=1;i<rel.length;i++){let diff=rel[i]-rel[i-1];if(diff>.1&&diff<2)intervals.push(diff);}
 const median=(arr)=>{const a=[...arr].sort((x,y)=>x-y);return a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):0;};
 const middle=median(intervals),deviations=intervals.map(n=>Math.abs(n-middle)),mad=median(deviations);
 const stability=middle>0?clamp(Math.round(100*(1-mad/middle*3)),0,100):null;
 const conf=Number(rawConfidence??data?.confidence);
 // Essentia confidence is not a calibrated probability. Heuristic bands only.
 const confidence=conf>=3&&rel.length>=10?'high':conf>=1.5&&rel.length>=5?'medium':'low';
 return {
  bpm:r2(bpm),confidence,rawConfidence:finite(conf)?r2(conf):null,
  tempoStability:stability,beatTimes:rel,measuredBeatTimes:true,
  offset:rel[0]??offset,analysisWindow:{offset,duration},
  alternatives:bpmCandidates(bpm,data?.estimates||[]),
  method:'Essentia.js RhythmExtractor2013 / WASM',
  interpretations:{half:r2(bpm/2),main:r2(bpm),double:r2(bpm*2)}
 };
}
export function downmixAndResample(essentia,channels,sampleRate,targetRate=44100){
 if(!Array.isArray(channels)||channels.length<1||channels.length>2||!finite(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error('Essentia requires a valid mono or stereo source.');
 const len=channels[0].length;
 if(!len||len>sampleRate*95||channels.some(x=>!(x instanceof Float32Array)||x.length!==len))
  throw Error('Essentia analysis window exceeds 95 seconds or has invalid channels.');
 const mono=new Float32Array(len);
 if(channels.length===1)mono.set(channels[0]);
 else for(let i=0;i<len;i++)mono[i]=(channels[0][i]+channels[1][i])*.5;
 if(Math.abs(sampleRate-targetRate)<1)return mono;
 const src=essentia.arrayToVector(mono);
 try{
  const out=essentia.Resample(src,sampleRate,targetRate,2).signal;
  const samples=essentia.vectorToArray(out);
  const copy=new Float32Array(samples);
  deleteVector(out);
  return copy;
 }finally{deleteVector(src);}
}
export function analyzeEssentiaRhythm(essentia,channels,sampleRate,offset=0){
 const mono=downmixAndResample(essentia,channels,sampleRate,44100);
 if(mono.length<44100*6)throw Error('Choose at least 6 seconds for accurate beat tracking.');
 const source=essentia.arrayToVector(mono);
 try{
  const result=essentia.RhythmExtractor2013(source,220,'multifeature',40);
  const raw={
   bpm:result.bpm,confidence:result.confidence,
   ticks:Array.from(essentia.vectorToArray(result.ticks)),
   estimates:Array.from(essentia.vectorToArray(result.estimates))
  };
  deleteVector(result.ticks);deleteVector(result.estimates);deleteVector(result.bpmIntervals);
  return rhythmResultFromWasm(raw,{offset,duration:mono.length/44100});
 }finally{deleteVector(source);}
}
export function mergeBeatChordEvents(labels,strengths,ticks,offset=0){
 const result=[];
 for(let i=0;i<labels.length&&i<ticks.length-1;i++){
  const label=String(labels[i]||''),strength=Number(strengths[i]);
  if(!/^[A-G](?:#|b)?m?$/.test(label)||!finite(strength)||strength<.38)continue;
  const formatted=label.endsWith('m')?label.slice(0,-1)+' min':label+' maj';
  const at=r2(ticks[i]+offset),until=r2(ticks[i+1]+offset);
  if(until<=at)continue;
  const prev=result.at(-1);
  if(prev&&prev.label===formatted&&at-prev.end<=.08){
   prev.end=until;prev.confidence=Math.max(prev.confidence,Math.round(clamp(strength,0,1)*100));
  }else result.push({time:at,end:until,label:formatted,confidence:Math.round(clamp(strength,0,1)*100)});
 }
 return result.filter(c=>c.end-c.time>=.25).slice(0,60);
}
export function analyzeEssentiaHarmony(essentia,WASM,channels,sampleRate,beatTimes=[],offset=0){
 const mono=downmixAndResample(essentia,channels,sampleRate,44100);
 if(mono.length<44100*4)throw Error('At least 4 seconds required for musical key detection.');
 const signal=essentia.arrayToVector(mono);
 let best=null;const results=[];
 try{
  for(const profile of ['bgate','krumhansl','temperley']){
   try{
    const val=essentia.KeyExtractor(signal,true,4096,4096,12,3500,60,25,.2,profile,44100);
    if(val?.key&&val?.scale&&finite(val.strength)&&val.strength>.05)
     results.push({key:val.key,scale:val.scale,strength:val.strength,profile});
   }catch(error){if(profile==='bgate')throw error;}
  }
  best=results.find(x=>x.profile==='bgate')||results[0]||null;
 }finally{deleteVector(signal);}
 const key=best?{
  name:best.key+' '+best.scale,camelot:camelotCode(best.key,best.scale),
  score:r2(best.strength),confidence:best.strength>=.73?'high':best.strength>=.48?'medium':'low',
  alternatives:results.filter(x=>x.key!==best.key||x.scale!==best.scale)
   .map(x=>({name:x.key+' '+x.scale,camelot:camelotCode(x.key,x.scale),score:r2(x.strength)})).slice(0,3)
 }:null;
 // The harmonic worker receives actual beat ticks from the separate rhythm worker.
 const duration=mono.length/44100;
 const relative=[...beatTimes].map(t=>t-offset)
  .filter(t=>finite(t)&&t>=0&&t<=duration).sort((a,b)=>a-b);
 if(relative.length<3)return {key,chords:[],method:'Essentia.js KeyExtractor / no measured beat grid',sampledFrames:0};
 const pcp=new WASM.VectorVectorFloat(),hop=4096,size=4096;
 let frames=0;
 try{
  for(let pos=0;pos+size<=mono.length;pos+=hop){
   const frame=essentia.arrayToVector(mono.subarray(pos,pos+size));
   let win=null,spectrum=null,freqs=null,mags=null,hpcp=null;
   try{
    win=essentia.Windowing(frame,true,size,'hann',0,false).frame;
    spectrum=essentia.Spectrum(win,size).spectrum;
    const peaks=essentia.SpectralPeaks(spectrum,0,5000,70,40,'frequency',44100);
    freqs=peaks.frequencies;mags=peaks.magnitudes;
    hpcp=freqs?.size?.()>0?
      essentia.HPCP(freqs,mags,true,500,0,5000,false,40,false,'unitMax',440,44100,12).hpcp:
      essentia.arrayToVector(new Float32Array(12));
    pcp.push_back(hpcp);frames++;
   }finally{
    for(const x of [frame,win,spectrum,freqs,mags,hpcp])deleteVector(x);
   }
  }
  const beats=essentia.arrayToVector(new Float32Array(relative));
  try{
   const detected=essentia.ChordsDetectionBeats(pcp,beats,'interbeat_median',hop,44100);
   const labels=Array.from({length:detected.chords.size()},(_,i)=>detected.chords.get(i));
   const strengths=Array.from(essentia.vectorToArray(detected.strength));
   deleteVector(detected.chords);deleteVector(detected.strength);
   return {key,chords:mergeBeatChordEvents(labels,strengths,relative,offset),
    method:'Essentia.js KeyExtractor + HPCP + ChordsDetectionBeats',sampledFrames:frames};
  }finally{deleteVector(beats);}
 }finally{deleteVector(pcp);}
}
