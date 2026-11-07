import {measureBeatDetector,mergeRhythmResults} from './beat-detector.mjs';

const makeId=()=>globalThis.crypto?.randomUUID?.()||'rhythm-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const aborted=signal=>signal?.reason||new DOMException('Analysis cancelled','AbortError');

/** Local onset extraction for beat markers; the independent tempo estimator runs in its own worker. */
export function analyzeOnsetsInWorker(buffer,{signal,onProgress,timeoutMs=65000}={}){
 if(!buffer||!Number.isInteger(buffer.length)||buffer.length<1||!Number.isFinite(buffer.sampleRate)||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||typeof buffer.getChannelData!=='function')return Promise.reject(new Error('Load a valid audio track first.'));
 if(signal?.aborted)return Promise.reject(aborted(signal));
 if(typeof Worker==='undefined')return Promise.reject(new Error('Web Workers are not available in this browser.'));
 const targetRate=Math.min(22050,buffer.sampleRate),ratio=buffer.sampleRate/targetRate,totalSamples=Math.floor(buffer.length/ratio),chunkSamples=Math.max(1,Math.round(targetRate*2)),channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),worker=new Worker(new URL('./rhythm-worker.mjs',import.meta.url),{type:'module'}),id=makeId();
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);worker.terminate();};
  const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value);};
  const onAbort=()=>finish(reject,aborted(signal));
  const timer=setTimeout(()=>finish(reject,new Error('Rhythm analysis timed out.')),timeoutMs);
  worker.onmessage=({data})=>{if(data?.id!==id)return;if(data.type==='progress')onProgress?.(Math.round(data.progress*.9));if(data.type==='done')finish(resolve,data.result);if(data.type==='error')finish(reject,new Error(data.error));};
  worker.onerror=()=>finish(reject,new Error('Rhythm analysis worker failed.'));
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
   worker.postMessage({type:'start',id,inputRate:buffer.sampleRate,targetRate,totalSamples});
   const dispatchChunks=async()=>{
    for(let targetStart=0;targetStart<totalSamples;targetStart+=chunkSamples){
     if(settled)return;
     if(signal?.aborted)throw aborted(signal);
     const targetCount=Math.min(chunkSamples,totalSamples-targetStart),sourceStart=Math.floor(targetStart*ratio),sourceEnd=Math.min(buffer.length,Math.ceil((targetStart+targetCount)*ratio)),copies=channels.map(channel=>channel.slice(sourceStart,sourceEnd)),transfer=copies.map(channel=>channel.buffer);
     worker.postMessage({type:'chunk',id,targetStart,targetCount,sourceStart,channels:transfer},transfer);
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!settled)worker.postMessage({type:'finish',id});
   };
   void dispatchChunks().catch(error=>finish(reject,error));
  }catch(error){finish(reject,error);}
 });
}

/** Primary BPM: web-audio-beat-detector. Local onset worker retains markers and guards ambiguous tempos. */
export async function analyzeRhythmInWorker(buffer,options={}){
 const {signal,onProgress}=options;
 if(signal?.aborted)throw aborted(signal);
 const [vendorResult,onsetResult]=await Promise.allSettled([
  measureBeatDetector(buffer,{signal,timeoutMs:45000}),
  analyzeOnsetsInWorker(buffer,options)
 ]);
 if(signal?.aborted)throw aborted(signal);
 const vendor=vendorResult.status==='fulfilled'?vendorResult.value:null;
 const onsets=onsetResult.status==='fulfilled'?onsetResult.value:null;
 if(!vendor&&!onsets){
  const message=onsetResult.reason?.message||vendorResult.reason?.message||'NO_RHYTHM';
  throw new Error(message);
 }
 const result=mergeRhythmResults(vendor,onsets,buffer.duration);
 onProgress?.(100);
 return result;
}
