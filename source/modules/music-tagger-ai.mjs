/**
 * PULSE Music Tagger cloud orchestration.
 * Runs in the user's browser, while the proprietary model runs on Audial servers.
 * Never uploads before the UI obtains explicit consent.
 */
const aborted=()=>Object.assign(new Error('Analysis cancelled.'),{name:'AbortError'});
export const isAbort=error=>error?.name==='AbortError';
export function pauseTagging(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(aborted());
  const onAbort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);reject(aborted());};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);
  signal?.addEventListener('abort',onAbort,{once:true});
 });
}
const validId=value=>typeof value==='string'&&/^exe_[a-z0-9_-]{5,100}$/i.test(value);

/**
 * send(action, body, signal) -> parsed JSON, throws Error with code for API failures.
 * An accepted analysis id can be resumed after a transient error/cancellation
 * so a retry does not upload the audio a second time.
 */
export async function runAudialMusicTags({
 send,file,signal,onProgress=()=>{},resume=null,pause=pauseTagging,
 maxTagAttempts=9,maxResultPolls=24,tagDelayMs=25000,resultDelayMs=12000
}={}){
 if(typeof send!=='function')throw Error('Missing secure Audial gateway.');
 if(!resume&&!file?.base64)throw Error('Select an audio track to analyze.');
 const emit=(stage,analysisExeId,tagsRequested,description)=>onProgress({stage,analysisExeId,tagsRequested,description});
 const check=()=>{if(signal?.aborted)throw aborted();};
 let analysisExeId=resume?.analysisExeId||null,tagsRequested=resume?.tagsRequested===true;
 if(analysisExeId&&!validId(analysisExeId))throw Error('Invalid saved analysis reference.');
 check();
 if(!analysisExeId){
  emit('uploading',null,false,'Sending your selected audio excerpt for AI tagging…');
  const started=await send('start',{consent:true,file},signal);
  check();
  if(!validId(started?.analysisExeId))throw Error('Audial did not return a valid analysis ID.');
  analysisExeId=started.analysisExeId;
  emit('preparing',analysisExeId,false,'Audio uploaded. Preparing the track parts…');
 }
 if(!tagsRequested){
  let started=false;
  for(let n=0;n<maxTagAttempts;n++){
   check();
   emit('tagging',analysisExeId,false,'Analyzing genre, mood and instruments ('+(n+1)+'/'+maxTagAttempts+')…');
   try{
    await send('tag',{consent:true,analysisExeId},signal);
    tagsRequested=true;started=true;
    emit('processing',analysisExeId,true,'AI tagging started. Reading the model results…');
    break;
   }catch(error){
    check();
    if((error?.code==='STEMS_NOT_READY'||error?.code==='RATE_LIMITED')&&n+1<maxTagAttempts){
     emit('waiting-stems',analysisExeId,false,'Audial is still preparing drums, bass, melody and vocals…');
     await pause(tagDelayMs,signal);
     continue;
    }
    throw error;
   }
  }
  if(!started)throw Error('Stem preparation did not complete. Retry to resume the existing analysis.');
 }
 for(let n=0;n<maxResultPolls;n++){
  check();
  emit('reading',analysisExeId,true,'Retrieving genre, mood and instrument tags…');
  let result;
  try{
   result=await send('result',{consent:true,analysisExeId},signal);
  }catch(error){
   if(error?.code!=='STEMS_NOT_READY'&&error?.code!=='RATE_LIMITED')throw error;
   emit('waiting-results',analysisExeId,true,'Tagging is processing on Audial servers…');
   if(n+1<maxResultPolls){await pause(resultDelayMs,signal);continue;}
   throw error;
  }
  check();
  if(result?.status==='complete'&&result.tags){
   emit('complete',analysisExeId,true,'Genre, mood and instrument tags are ready.');
   return {analysisExeId,tags:result.tags};
  }
  if(n+1<maxResultPolls){
   emit('waiting-results',analysisExeId,true,'AI tagging is still processing…');
   await pause(resultDelayMs,signal);
  }
 }
 const error=new Error('Audial is still processing. Use RETRY to resume this analysis without re-uploading audio.');
 error.code='TAGGING_PENDING';throw error;
}
