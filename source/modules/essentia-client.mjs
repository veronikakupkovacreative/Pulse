/** Browser-side Essentia worker wrapper.
 * Shares only an analysis slice of the current AudioWorkspace (max. 90 seconds).
 * Does not upload audio, change AudioBuffer or persist analysis data.
 */
const aborted=signal=>signal?.reason||new DOMException('Analysis cancelled','AbortError');
const nowId=()=>globalThis.crypto?.randomUUID?.()||'essentia-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export function pickEssentiaWindow(audio,{selection=null,maxSeconds=90}={}){
 if(!audio||!Number.isInteger(audio.length)||audio.length<1||
  !Number.isFinite(audio.sampleRate)||audio.sampleRate<8000||audio.sampleRate>192000||
  !Number.isInteger(audio.numberOfChannels)||audio.numberOfChannels<1||audio.numberOfChannels>2)
  throw Error('Load a valid mono or stereo audio file into SOURCE AUDIO.');
 const duration=audio.duration||audio.length/audio.sampleRate;
 if(duration<6)throw Error('Essentia needs at least 6 seconds of audio.');
 const hasSelection=Number.isFinite(selection?.start)&&Number.isFinite(selection?.end)&&
  selection.end>selection.start+5.99&&selection.start>=0&&selection.end<=duration;
 const start=hasSelection?selection.start:0,end=hasSelection?selection.end:duration;
 const seconds=Math.min(maxSeconds,end-start);
 const offset=Math.max(0,start+Math.max(0,(end-start-seconds)/2));
 return {offset,duration:seconds,selected:hasSelection,sourceDuration:duration};
}
export function analyzeEssentiaInWorker(audio,{mode,region,beatTimes=[],signal,onProgress,timeoutMs=150000}={}){
 if(!['rhythm','harmony'].includes(mode))return Promise.reject(Error('Choose rhythm or harmony analysis.'));
 if(signal?.aborted)return Promise.reject(aborted(signal));
 if(typeof Worker==='undefined')return Promise.reject(Error('Your browser does not support Essentia Web Workers.'));
 let window;
 try{window=region||pickEssentiaWindow(audio);}catch(error){return Promise.reject(error);}
 const start=Math.floor(window.offset*audio.sampleRate);
 const end=Math.min(audio.length,Math.ceil((window.offset+window.duration)*audio.sampleRate));
 const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i).slice(start,end));
 const worker=new Worker(new URL('./essentia-worker.mjs',import.meta.url)),id=nowId();
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};
  const finish=(fn,result)=>{if(settled)return;settled=true;cleanup();fn(result);};
  const abort=()=>finish(reject,aborted(signal));
  const timer=setTimeout(()=>finish(reject,Error('Essentia analysis exceeded the worker timeout.')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{
   if(data?.id!==id)return;
   if(data.type==='progress'){onProgress?.(data.progress);return;}
   if(data.type==='done')return finish(resolve,data.result);
   if(data.type==='error')return finish(reject,Error(data.error||'Essentia analysis failed.'));
  };
  worker.onerror=e=>finish(reject,Error(e.message||'Essentia Worker failed to load.'));
  try{
   const transfer=channels.map(x=>x.buffer);
   worker.postMessage({type:'analyze',id,mode,channels:transfer,
    offset:window.offset,sampleRate:audio.sampleRate,beatTimes},transfer);
  }catch(error){finish(reject,error);}
 });
}
