import {analyzeHarmonyFrames} from './harmony-analysis.mjs';
self.onmessage=({data})=>{
 if(!data||data.type!=='analyze'||typeof data.id!=='string')return;
 try{
  const frames=new Float32Array(data.windows),times=new Float32Array(data.times);
  const result=analyzeHarmonyFrames(frames,data.sampleRate,times,data.windowSize);
  self.postMessage({type:'done',id:data.id,result});
 }catch(error){self.postMessage({type:'error',id:data.id,error:error?.message||'Harmony analysis failed.'});}
};
