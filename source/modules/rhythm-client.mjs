const makeId=()=>globalThis.crypto?.randomUUID?.()||'rhythm-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export function analyzeRhythmInWorker(buffer,{signal,onProgress,timeoutMs=65000}={}){
 if(!buffer||!Number.isInteger(buffer.length)||!Number.isFinite(buffer.sampleRate)||!Number.isInteger(buffer.numberOfChannels)||typeof buffer.getChannelData!=='function')return Promise.reject(new Error('Load a valid audio track first.'));
 if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Analysis cancelled','AbortError'));
 if(typeof Worker==='undefined')return Promise.reject(new Error('Web Workers are not available in this browser.'));
 const targetRate=Math.min(22050,buffer.sampleRate),ratio=buffer.sampleRate/targetRate,totalSamples=Math.floor(buffer.length/ratio),chunkSamples=Math.max(1,Math.round(targetRate*2)),channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),worker=new Worker(new URL('./rhythm-worker.mjs',import.meta.url),{type:'module'}),id=makeId();
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);worker.terminate();};
  const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value);};
  const onAbort=()=>finish(reject,signal.reason||new DOMException('Analysis cancelled','AbortError'));
  const timer=setTimeout(()=>finish(reject,new Error('Rhythm analysis timed out.')),timeoutMs);
  worker.onmessage=({data})=>{if(data?.id!==id)return;if(data.type==='progress')onProgress?.(data.progress);if(data.type==='done')finish(resolve,data.result);if(data.type==='error')finish(reject,new Error(data.error));};
  worker.onerror=()=>finish(reject,new Error('Rhythm analysis worker failed.'));
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
   worker.postMessage({type:'start',id,inputRate:buffer.sampleRate,targetRate,totalSamples});
   const dispatchChunks=async()=>{
    for(let targetStart=0;targetStart<totalSamples;targetStart+=chunkSamples){
     if(settled)return;
     if(signal?.aborted)throw signal.reason||new DOMException('Analysis cancelled','AbortError');
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