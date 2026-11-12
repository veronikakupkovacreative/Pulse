/** Offline reference matching and deterministic mixing instructions for PULSE Mastering.
 * No machine-learning model is implied. Preserves all existing mastering settings contracts.
 */
import {masteringSettings,measureMasteringAudio} from './mastering-engine.mjs';
import {analyzeReferenceMatch,MATCH_CENTERS,referenceProfile} from './producer-dsp.mjs';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=v=>Number.isFinite(v)?v:0;
const mean=(values)=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
export const MASTER_BANDS=Object.freeze(['70','160','350','750','1.6k','3.4k','7k','12.5k']);
export const MASTER_ASSISTANT_EXAMPLES=Object.freeze(['More punch','Warmer bass','Less harsh highs','Wider stereo','Streaming -14 LUFS']);

export function interpretMasteringRequest(input,current){
 if(typeof input!=='string'||!input.trim()||input.length>240)throw Error('Enter a short mastering instruction (max. 240 characters).');
 const words=input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[-_]/g,' ').trim();
 const changes=[],next={...masteringSettings(current)};
 function apply(label,fn){fn();changes.push(label);}
 // Physical DSP controls with limited, explainable changes; not a generative language model.
 if(/\b(punch|punchier|transient|uder|razant|pruraz|dynamik)\b/.test(words)){
  apply('Punch: slower attack and gentler compression',()=>{
   next.attack=clamp(next.attack+12,5,100);next.threshold=clamp(next.threshold+2,-36,-6);
   next.ratio=clamp(next.ratio-.3,1,8);
  });
 }
 if(/\b(warm|warmer|tepl|hute|bass|basy|basu|low end|lowend)\b/.test(words)){
  apply('Warmth: gentle bass lift and treble trim',()=>{
   next.bassEq=clamp(next.bassEq+.8,-3,3);
   next.trebleEq=clamp(next.trebleEq-.25,-3,3);
   next.tone=clamp(next.tone-.2,-4,4);
  });
 }
 if(/\b(harsh|harshness|ostre|ostrost|sibil|sibilance|less highs|vysky|highs|bright|brightness)\b/.test(words)){
  const darker=/less|reduce|mene|jemne|soft|harsh|ostre|ostrost|sibil/.test(words);
  apply(darker?'Softer high end: gentler treble':'Brighter high end: gentle treble lift',()=>{
   next.trebleEq=clamp(next.trebleEq+(darker?-.85:.6),-3,3);
   next.midEq=clamp(next.midEq+(darker?-.2:.1),-3,3);
  });
 }
 if(/\b(wide|wider|stereo|sirka|sirok|prostor|spatial)\b/.test(words)){
  apply('Stereo: slightly wider high-frequency image',()=>{next.width=clamp(next.width+.08,.65,1.35);});
 }
 if(/\b(narrow|mono|uzsi)\b/.test(words)){
  apply('Stereo: narrower image',()=>{next.width=clamp(next.width-.1,.65,1.35);});
 }
 if(/\b(streaming|spotify|apple|youtube|14 lufs)\b/.test(words)){
  apply('Streaming: target -14 LUFS and -1 dB ceiling',()=>{next.target=-14;next.ceiling=-1;});
 }
 if(/\b(louder|hlasiteji|hlasit|volume)\b/.test(words)&&!/less|quiet|tise/.test(words)){
  apply('Loudness: raise target by 1 LUFS',()=>{next.target=clamp(next.target+1,-20,-8);});
 }
 if(/\b(quieter|less loud|tise|tissi)\b/.test(words)){
  apply('Loudness: lower target by 1 LUFS',()=>{next.target=clamp(next.target-1,-20,-8);});
 }
 if(!changes.length)throw Error('Could not map the request to audio controls. Try: More punch, Warmer bass, Less harsh highs, Wider stereo, Streaming -14 LUFS.');
 return {settings:masteringSettings(next),changes};
}

export function planReferenceMastering(input,reference,current={}){
 const before=measureMasteringAudio(input,{truePeak:false});
 const ref=measureMasteringAudio(reference,{truePeak:false});
 if(!Number.isFinite(before.integratedLufs)||!Number.isFinite(ref.integratedLufs))
  throw Error('Reference and mix must contain measurable audio.');
 const profile=analyzeReferenceMatch(input,reference,{amount:.45,maxDb:3});
 const low=mean(profile.gains.slice(0,2)),mid=mean(profile.gains.slice(2,5)),high=mean(profile.gains.slice(5));
 const s=masteringSettings(current);
 const dynamic=clamp(ref.crestDb-before.crestDb,-6,6);
 const stereoValid=ref.stereoCorrelation!==null&&before.stereoCorrelation!==null;
 const target=clamp(ref.integratedLufs,-18,-9);
 const proposed=masteringSettings({
  ...s,
  target, bassEq:clamp(s.bassEq+low,-3,3),
  midEq:clamp(s.midEq+mid*.65,-3,3),trebleEq:clamp(s.trebleEq+high,-3,3),
  threshold:clamp(s.threshold+dynamic*.28,-36,-6),
  ratio:clamp(s.ratio-dynamic*.08,1,8),
  width:stereoValid?clamp(s.width+(before.stereoCorrelation-ref.stereoCorrelation)*.12,.65,1.35):s.width
 });
 return {
  settings:proposed,
  before,reference:ref,
  spectrum:{bands:MATCH_CENTERS.slice(),input:profile.target,reference:profile.reference,master:null},
  corrections:profile.gains,
  explanation:'Conservative 8-band reference comparison mapped to 3-band mastering EQ, crest factor, LUFS target and stereo correlation. It is not an exact copy of the reference.'
 };
}
export function spectrumForBuffer(audio){return referenceProfile(audio);}
export function reportMasteringMetrics(input,output=null,reference=null){
 return {input:measureMasteringAudio(input,{truePeak:true}),
  output:output?measureMasteringAudio(output,{truePeak:true}):null,
  reference:reference?measureMasteringAudio(reference,{truePeak:true}):null};
}
