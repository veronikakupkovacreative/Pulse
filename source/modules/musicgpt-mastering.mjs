/** Reference-based MusicGPT mastering within the existing PULSE AI MASTERING panel.
 * Local option transfers a max-six-second 44.1 kHz 16-bit stereo WAV excerpt
 * to keep Vercel ingress safely below its request-body limit.
 * Full-track mastering requires HTTPS input/reference URLs.
 */
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(Error('Paused'),{name:'AbortError'}));
 const abort=()=>{clearTimeout(timer);reject(Object.assign(Error('Paused'),{name:'AbortError'}));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
 signal?.addEventListener('abort',abort,{once:true});
});
const MAX_SECONDS=6, TARGET_RATE=44100;
const apiError={
 OWNER_AUTH_REQUIRED:'Incorrect PULSE private access token.',
 MUSICGPT_MASTERING_NOT_CONFIGURED:'MusicGPT Mastering is not configured on this Vercel environment.',
 AUDIO_UPLOAD_CONSENT_REQUIRED:'Confirm consent to sending the source and reference to MusicGPT.',
 AUDIO_OR_REFERENCE_REQUIRED:'A source AND a reference are required for MusicGPT mastering.',
 INVALID_HTTPS_AUDIO_URL:'Use a valid public HTTPS audio URL.',
 INVALID_PROVIDER_REQUEST:'MusicGPT rejected the audio or reference. Check file types and links.',
 INVALID_AUDIO_FILE:'Audio file is missing or invalid.',
 AUDIO_TOO_LARGE:'Two short previews together exceed the Vercel upload limit.',
 MUSICGPT_AUTH_FAILED:'MusicGPT rejected the server-side API key.',
 INSUFFICIENT_CREDITS:'The MusicGPT account has insufficient credits for mastering.',
 RATE_LIMITED:'MusicGPT rate limit reached. Try again later.',
 MUSICGPT_TIMEOUT:'MusicGPT did not respond. Check an existing job before spending credits on a retry.',
 MUSICGPT_CONNECTION_ERROR:'MusicGPT is temporarily unavailable. The job may have started; check your account before retrying.'
};
export async function makeMasteringPreview(buffer,{selection=null,maxSeconds=MAX_SECONDS}={}){
 if(!buffer||!(buffer.sampleRate>0)||!(buffer.length>0)||!Number.isInteger(buffer.numberOfChannels)||
  buffer.numberOfChannels<1||buffer.numberOfChannels>2)throw Error('Load valid audio into SOURCE AUDIO first.');
 const duration=buffer.duration||buffer.length/buffer.sampleRate;
 if(duration<2)throw Error('Choose audio at least two seconds long for cloud preview.');
 const hasSelection=Number.isFinite(selection?.start)&&Number.isFinite(selection?.end)&&
  selection.start>=0&&selection.end<=duration&&selection.end-selection.start>=2;
 const span=hasSelection?selection.end-selection.start:duration;
 const seconds=Math.min(maxSeconds,span);
 const start=hasSelection?selection.start+(span-seconds)/2:(duration-seconds)/2;
 const frames=Math.round(seconds*TARGET_RATE);
 let samples=[];
 if(buffer.sampleRate===TARGET_RATE){
  for(let c=0;c<2;c++){
   const from=buffer.getChannelData(Math.min(c,buffer.numberOfChannels-1));
   const offset=Math.round(start*TARGET_RATE);
   samples.push(from.subarray(offset,Math.min(offset+frames,buffer.length)));
  }
 }else if(typeof OfflineAudioContext!=='undefined'){
  const offline=new OfflineAudioContext(2,frames,TARGET_RATE);
  const length=Math.ceil(seconds*buffer.sampleRate),startFrame=Math.floor(start*buffer.sampleRate);
  const source=offline.createBuffer(2,length,buffer.sampleRate);
  for(let c=0;c<2;c++)source.copyToChannel(buffer.getChannelData(Math.min(c,buffer.numberOfChannels-1)).slice(startFrame,startFrame+length),c);
  const player=offline.createBufferSource();player.buffer=source;player.connect(offline.destination);player.start();
  const out=await offline.startRendering();
  samples=[out.getChannelData(0),out.getChannelData(1)];
 }else{
  // Node unit tests can supply native 44.1kHz buffers; browser uses OfflineAudioContext.
  throw Error('This browser cannot prepare 44.1 kHz reference audio.');
 }
 const wav=new Uint8Array(44+frames*4),view=new DataView(wav.buffer);
 const write=(offset,value)=>{for(let i=0;i<value.length;i++)wav[offset+i]=value.charCodeAt(i);};
 write(0,'RIFF');view.setUint32(4,wav.length-8,true);write(8,'WAVE');write(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
 view.setUint32(24,TARGET_RATE,true);view.setUint32(28,TARGET_RATE*4,true);
 view.setUint16(32,4,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++)for(let c=0;c<2;c++){
  const sample=Number.isFinite(samples[c][i])?Math.max(-1,Math.min(1,samples[c][i])):0;
  view.setInt16(44+(i*2+c)*2,Math.round(sample<0?sample*32768:sample*32767),true);
 }
 let binary='';
 for(let i=0;i<wav.length;i+=8192)binary+=String.fromCharCode(...wav.subarray(i,i+8192));
 return {file:{name:'pulse-preview.wav',base64:btoa(binary)},seconds,start,bytes:wav.length};
}
export function mountMusicGPTMasteringCloud({host,workspace,getReference,onResult,onMessage}){
 host.innerHTML='<div class="pulse-mg-master">'+
  '<p class="pulse-mg-intro"><strong>MUSICGPT REFERENCE MASTERING</strong> · Match the sound of an uploaded reference track. MusicGPT processes your audio on its own servers and consumes credits. Local DSP presets do not control MusicGPT.</p>'+
  '<div class="pulse-mg-grid">'+
   '<label class="pulse-mg-field">SOURCE AUDIO METHOD<select data-mg-source-method><option value="preview">SOURCE AUDIO · 6 SEC PREVIEW</option><option value="url">FULL TRACK · HTTPS URL</option></select></label>'+
   '<label class="pulse-mg-field">REFERENCE METHOD<select data-mg-ref-method><option value="preview">LOADED REFERENCE · 6 SEC PREVIEW</option><option value="url">REFERENCE · HTTPS URL</option></select></label>'+
   '<label class="pulse-mg-field" data-mg-url-source hidden>SOURCE AUDIO HTTPS URL<input data-mg-original-url type="url" placeholder="https://example.com/song.wav"></label>'+
   '<label class="pulse-mg-field" data-mg-url-reference hidden>REFERENCE HTTPS URL<input data-mg-reference-url type="url" placeholder="https://example.com/reference.wav"></label>'+
   '<label class="pulse-mg-field">OUTPUT FORMAT<select data-mg-format><option value="wav">WAV</option><option value="mp3">MP3</option><option value="flac">FLAC</option><option value="aac">AAC</option><option value="ogg">OGG</option><option value="webm">WEBM</option></select></label>'+
   '<label class="pulse-mg-field">PRIVATE PULSE ACCESS TOKEN<input data-master-cloud-token type="password" autocomplete="off" placeholder="Owner access token, not MusicGPT API key"></label>'+
  '</div>'+
  '<label class="pulse-master-consent pulse-mg-consent"><input type="checkbox" data-master-cloud-consent> I am authorized to use both recordings. I agree to upload the source and reference to MusicGPT, and to use paid API credits.</label>'+
  '<p class="pulse-mg-warning">FILE PREVIEW MODE sends only the central 6 seconds (or waveform selection) from each recording, not the complete song. For full-length mastering, provide hosted HTTPS audio URLs for BOTH recordings. No audio is uploaded until you click RUN MUSICGPT MASTERING.</p>'+
  '<div class="pulse-mg-status"><strong data-master-cloud-availability>CHECKING CONFIGURATION</strong><p data-mg-status role="status" aria-live="polite">MusicGPT requires a source and reference.</p></div>'+
  '<div class="pulse-mg-actions"><button type="button" data-mg-cancel hidden>STOP WAITING</button></div>'+
  '<div class="pulse-mg-result" data-master-cloud-results hidden aria-live="polite"></div>'+
  '</div>';
 const $=selector=>host.querySelector(selector);
 let disposed=false,active=false,controller=null,revision=0,conversionId=null,configured=false;
 const status=(text,error=false)=>{if(disposed)return;const el=$('[data-mg-status]');el.textContent=text;el.dataset.error=String(error);onMessage?.(text,error);};
 const setBusy=busy=>{active=busy;$('[data-mg-cancel]').hidden=!busy;};
 const cancel=()=>{
  revision++;controller?.abort();controller=null;setBusy(false);
 };
 const discard=()=>{
  cancel();conversionId=null;
  const out=$('[data-master-cloud-results]');
  out.hidden=true;out.replaceChildren();
  status('Input changed. Ready to start a new mastering job.');
 };
 const sourceMethod=$('[data-mg-source-method]'),refMethod=$('[data-mg-ref-method]');
 const syncModes=()=>{
  $('[data-mg-url-source]').hidden=sourceMethod.value!=='url';
  $('[data-mg-url-reference]').hidden=refMethod.value!=='url';
 };
 for(const selector of ['[data-mg-source-method]','[data-mg-ref-method]','[data-mg-original-url]',
   '[data-mg-reference-url]','[data-mg-format]']){
  $(selector).addEventListener('change',()=>{syncModes();discard();});
 }
 syncModes();
 $('[data-mg-cancel]').onclick=()=>{
  cancel();
  status('Stopped waiting. The MusicGPT task may still be running; press RUN MUSICGPT MASTERING to RESUME without uploading again.');
 };
 async function gateway(action,data,signal){
  const token=$('[data-master-cloud-token]').value.trim();
  if(!token)throw Error('Enter the private PULSE owner access token.');
  const response=await fetch('/api/pulse-mastering',{method:'POST',
   headers:{'Content-Type':'application/json','x-pulse-owner-token':token},
   body:JSON.stringify({action,...data}),signal});
  const json=await response.json().catch(()=>({error:'INVALID_PROVIDER_RESPONSE'}));
  if(!response.ok)throw Error(apiError[json.error]||('MusicGPT request failed: '+(json.error||response.status)));
  return json;
 }
 async function checkConfiguration(){
  try{
   const resp=await fetch('/api/pulse-mastering',{cache:'no-store'});
   const data=await resp.json();
   if(disposed)return;
   configured=resp.ok&&data.configured===true;
   $('[data-master-cloud-availability]').textContent=configured?
    'MUSICGPT READY · OWNER TOKEN REQUIRED':'MUSICGPT API NOT CONFIGURED';
  }catch{if(!disposed)$('[data-master-cloud-availability]').textContent='MUSICGPT STATUS UNAVAILABLE';}
 }
 async function prepareSource(mode,isReference){
  if(mode==='url'){
   const value=$(isReference?'[data-mg-reference-url]':'[data-mg-original-url]').value.trim();
   const parsed=new URL(value);
   if(parsed.protocol!=='https:'||!parsed.hostname)throw Error('Enter a public HTTPS URL for the '+(isReference?'reference.':'source audio.'));
   return {url:parsed.href};
  }
  const buffer=isReference?getReference()?.buffer:workspace.ensureAudio();
  if(!buffer)throw Error('Load a reference audio file in REFERENCE MASTERING first, or switch to a reference URL.');
  const preview=await makeMasteringPreview(buffer,{selection:isReference?null:workspace.selection});
  return {file:preview.file};
 }
 async function run(){
  if(disposed||active)return;
  if(!configured)return status('MusicGPT mastering API is not configured for this deployment.',true);
  if(!$('[data-master-cloud-consent]').checked)return status('Confirm authorization and explicit consent to paid cloud processing.',true);
  if(!$('[data-master-cloud-token]').value.trim())return status('Enter PRIVATE PULSE ACCESS TOKEN.',true);
  const requestId=revision,ac=new AbortController();controller=ac;setBusy(true);
  try{
   if(!conversionId){
    status('Preparing source and mastering reference…');
    const original=await prepareSource(sourceMethod.value,false);
    const reference=await prepareSource(refMethod.value,true);
    if(disposed||requestId!==revision||ac.signal.aborted)return;
    status('Uploading source and reference to MusicGPT. A paid conversion may be started…');
    const result=await gateway('submit',{consent:true,original,reference,
     outputExtension:$('[data-mg-format]').value},ac.signal);
    if(disposed||requestId!==revision||ac.signal.aborted)return;
    conversionId=result.conversionId;
    const out=$('[data-master-cloud-results]');out.replaceChildren();out.hidden=false;
    const p=document.createElement('p');
    p.textContent='JOB SUBMITTED · '+result.conversionId+
      (result.creditEstimate!==null?' · EST. '+result.creditEstimate+' CREDITS':'')+
      (result.eta!==null?' · ETA '+result.eta+' SEC':'');
    out.append(p);
   }
   let complete=false;
   for(let attempt=0;attempt<42;attempt++){
    if(disposed||requestId!==revision||ac.signal.aborted)return;
    status('MusicGPT mastering in progress. Checking result '+(attempt+1)+'/42. You can pause and resume.');
    const reply=await gateway('result',{conversionId},ac.signal);
    if(disposed||requestId!==revision||ac.signal.aborted)return;
    if(reply.status==='failed')throw Error(reply.message||'MusicGPT mastering failed.');
    if(reply.status==='complete'&&reply.audioUrl){
     const out=$('[data-master-cloud-results]');
     const player=document.createElement('audio');player.controls=true;player.preload='none';player.src=reply.audioUrl;
     const a=document.createElement('a');a.href=reply.audioUrl;a.target='_blank';a.rel='noopener noreferrer';
     a.textContent='OPEN / DOWNLOAD MASTERED AUDIO ↗';
     out.append(player,a);out.hidden=false;
     const imported=await onResult?.(reply.audioUrl,ac.signal,{sourceMethod:sourceMethod.value,previewSeconds:MAX_SECONDS});
     if(disposed||requestId!==revision||ac.signal.aborted)return;
     status(imported?'MusicGPT master ready for A/B, APPLY and local WAV export.':
      'MusicGPT master ready to play or download. Browser cross-origin restrictions may prevent importing it for A/B.');
     conversionId=null;complete=true;break;
    }
    if(attempt<41)await wait(12000,ac.signal);
   }
   if(!complete)status('Still processing. Press RUN MUSICGPT MASTERING again to resume checking this job, without paying for a new upload.');
  }catch(error){
   if(!disposed&&requestId===revision&&error?.name!=='AbortError')
    status(error.message||'MusicGPT mastering failed.',true);
  }finally{
   if(controller===ac){controller=null;setBusy(false);}
  }
 }
 const unsubscribe=workspace.subscribe((snapshot,reason)=>{
  if(['load','clear','commit','undo','redo'].includes(reason))discard();
 });
 void checkConfiguration();
 return {run,discard,dispose(){disposed=true;unsubscribe();cancel();},
  isActive:()=>active};
}
