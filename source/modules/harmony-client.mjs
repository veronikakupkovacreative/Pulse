/** Build bounded, evenly spaced 8192-sample frames and process harmony off the UI thread. */
const makeId=()=>globalThis.crypto?.randomUUID?.()||'harmony-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export function analyzeHarmonyInWorker(audio,{signal,timeoutMs=60000}={}){
 if(!audio||!Number.isInteger(audio.length)||audio.length<8192||
  !Number.isFinite(audio.sampleRate)||audio.sampleRate<8000||audio.numberOfChannels<1)
  return Promise.reject(new Error('Track too short for harmonic analysis.'));
 if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Cancelled','AbortError'));
 if(typeof Worker==='undefined')return Promise.reject(new Error('Web Workers unavailable.'));
 // Detailed chord timeline is estimated over at most 120s; long tracks use evenly sampled
 // windows so 20-minute files never freeze the UI while preparing the worker payload.
 const length=8192,seconds=audio.duration||audio.length/audio.sampleRate,
  limit=Math.min(seconds,120),frames=Math.max(3,Math.min(120,Math.floor(limit/.8))),
  windows=new Float32Array(frames*length),times=new Float32Array(frames),
  channels=Array.from({length:audio.numberOfChannels},(_,c)=>audio.getChannelData(c));
 for(let frame=0;frame<frames;frame++){
  const time=(frame+.5)*Math.max(0,seconds-length/audio.sampleRate)/frames;
  times[frame]=time;
  const start=Math.max(0,Math.min(audio.length-length,Math.round(time*audio.sampleRate-length/2)));
  for(let i=0;i<length;i++){
   let value=0;
   for(const channel of channels)value+=channel[start+i]||0;
   windows[frame*length+i]=value/channels.length;
  }
 }
 const id=makeId(),worker=new Worker(new URL('./harmony-worker.mjs',import.meta.url),{type:'module'});
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();};
  const finish=(cb,value)=>{if(settled)return;settled=true;cleanup();cb(value);};
  const abort=()=>finish(reject,signal.reason||new DOMException('Cancelled','AbortError'));
  const timer=setTimeout(()=>finish(reject,new Error('Harmonic analysis timed out.')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{
   if(data?.id!==id)return;
   if(data.type==='done')finish(resolve,data.result);
   if(data.type==='error')finish(reject,new Error(data.error));
  };
  worker.onerror=()=>finish(reject,new Error('Harmonic analysis worker failed.'));
  try{
   worker.postMessage({type:'analyze',id,windowSize:length,sampleRate:audio.sampleRate,
    windows:windows.buffer,times:times.buffer},[windows.buffer,times.buffer]);
  }catch(error){finish(reject,error);}
 });
}
