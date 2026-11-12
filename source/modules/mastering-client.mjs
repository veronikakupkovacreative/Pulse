/** Execute complete mastering DSP in a Web Worker; original AudioWorkspace buffer is immutable. */
import {fromChannels} from './dsp.mjs';
let requestId=0;

export function runMasteringWorker(action,audio,{settings,preset,signal,timeoutMs=180000}={}){
 if(!['analyze','render'].includes(action))return Promise.reject(new Error('Unsupported mastering worker action.'));
 if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Cancelled','AbortError'));
 if(typeof Worker==='undefined')return Promise.reject(new Error('Web Workers are unavailable. Try a modern browser.'));
 if(!audio||!Number.isFinite(audio.sampleRate)||!Number.isInteger(audio.numberOfChannels)||!audio.length)
  return Promise.reject(new Error('Load valid audio first.'));
 const frames=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i).slice());
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./mastering-worker.mjs',import.meta.url),{type:'module'});
  const id=++requestId;let finished=false;
  const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();};
  const finish=(method,value)=>{if(finished)return;finished=true;clean();method(value);};
  const abort=()=>finish(reject,signal?.reason||new DOMException('Cancelled','AbortError'));
  const timer=setTimeout(()=>finish(reject,new Error('Mastering timed out. Try a shorter track.')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{
   if(data?.id!==id)return;
   if(data.type==='error')return finish(reject,new Error(data.error||'Mastering failed.'));
   if(data.type==='done'){
    const result=data.result;
    if(action==='render'){
     result.buffer=fromChannels(result.buffer.channels.map(raw=>new Float32Array(raw)),result.buffer.sampleRate);
    }
    finish(resolve,result);
   }
  };
  worker.onerror=()=>finish(reject,new Error('Mastering worker crashed.'));
  try{worker.postMessage({
   id,action,sampleRate:audio.sampleRate,channels:frames.map(c=>c.buffer),settings,preset
  },frames.map(c=>c.buffer));}catch(error){finish(reject,error);}
 });
}
