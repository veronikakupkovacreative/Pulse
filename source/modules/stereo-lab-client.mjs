import {fromChannels} from './dsp.mjs';
let nextId=0;
export function processStereoInWorker(action,buffer,options={},signal){
 if(!['stereo','doubler'].includes(action))return Promise.reject(Error('Unknown audio processor.'));
 if(signal?.aborted)return Promise.reject(signal.reason||Error('Cancelled.'));
 if(typeof Worker==='undefined')return Promise.reject(Error('Web Workers are unavailable.'));
 if(!buffer||!buffer.length||!buffer.numberOfChannels) return Promise.reject(Error('Upload audio first.'));
 const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i).slice());
 const worker=new Worker(new URL('./stereo-lab-worker.mjs',import.meta.url),{type:'module'});
 const id=++nextId;
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);clearTimeout(timeout);};
  const done=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value);};
  const abort=()=>done(reject,signal.reason||Error('Cancelled.'));
  const timeout=setTimeout(()=>done(reject,Error('Audio processing timed out.')),180000);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{
   if(data?.id!==id)return;
   if(!data.ok)return done(reject,Error(data.error||'Audio processing failed.'));
   const audio=fromChannels(data.channels.map(c=>new Float32Array(c)),data.sampleRate);
   done(resolve,{buffer:audio,...data.stats});
  };
  worker.onerror=e=>done(reject,Error(e.message||'Stereo audio worker failed.'));
  try{worker.postMessage({id,action,channels:channels.map(c=>c.buffer),sampleRate:buffer.sampleRate,options},
    channels.map(c=>c.buffer));}catch(error){done(reject,error);}
 });
}
