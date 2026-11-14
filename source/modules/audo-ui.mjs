/** Audo free-tier tools for PULSE. */
import {workspace as w} from './workspace.mjs';
import {makeCloudTaggingExcerpt} from './music-tagger.mjs';

const API='/api/pulse-audo';
const MAX_BYTES=2_400_000;
const TRANSITIONS=new Set(['load','clear','commit','undo','redo']);
const ERROR_MESSAGES={
 INVALID_JSON:'Invalid input.',
 INVALID_AUDIO:'Use WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, WebM or AIFF.',
 AUDIO_SIZE_LIMIT:'File exceeds the 2.4 MB upload limit. Select a short section in SOURCE AUDIO.',
 INVALID_REDUCTION:'Noise reduction must be 10–100%.',
 INVALID_SOUND_EFFECT:'Provide a description (up to 450 characters) and length 0.5–10 seconds.',
 AUDO_FREE_LIMIT:'Daily free limit reached. Try again after the reset.',
 AUDO_FREE_ONLY:'This request is not available in the free tier.',
 AUDO_PROVIDER_ERROR:'Processing failed. Try again later.',
 AUDO_STATUS_UNAVAILABLE:'Job status is temporarily unavailable.',
 AUDO_REQUEST_TIMEOUT:'Processing timed out. The job may still be running; check its status before retrying.',
 AUDO_CONNECTION_ERROR:'Could not connect. Check your connection.',
 AUDO_RATE_GATE_REQUIRED:'Reload PULSE and try again.',
 CLOUD_CONSENT_REQUIRED:'Confirm permission to upload this content.',
 AUDO_PROCESSING_FAILED:'Processing failed.',
 MISSING_AUDO_STATUS_URL:'No usable job status was returned.',
 UNRECOGNIZED_AUDO_OUTPUT:'The processing service returned an unsupported result.',
 AUDO_OUTPUT_TOO_LARGE:'Output is too large to download through PULSE.'
};
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
 const abort=()=>{clearTimeout(timer);reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));};
 signal?.addEventListener('abort',abort,{once:true});
});
export async function requestAudo(body,{signal}={}){
 const submit=body.action==='submit';
 const response=await fetch(API+(submit?'?trial=1':''),{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal,cache:'no-store'
 });
 const data=await response.json().catch(()=>({error:'INVALID_AUDO_RESPONSE'}));
 if(!response.ok)throw Error(response.status===429?'Free usage limit reached. Try again later.':
  ERROR_MESSAGES[data.error]||'Processing request failed ('+String(data.error||response.status)+').');
 return data;
}
export async function completeAudo(request,tool,{signal,onProgress=()=>{}}={}){
 let data=await requestAudo({action:'submit',...request},{signal});
 for(let attempt=0;attempt<35;attempt++){
  if(data.status==='complete')return data;
  if(data.status!=='processing'||!data.statusUrl)throw Error('Audo did not return a usable job.');
  onProgress('Processing · check '+(attempt+1)+'/35.');
  await wait(2500,signal);
  data=await requestAudo({action:'status',tool,statusUrl:data.statusUrl},{signal});
 }
 throw Error('Still processing. Try again later; do not submit the same job repeatedly.');
}
const status=(host,text,error=false)=>{
 const el=host.querySelector('[data-audo-status]');
 if(el){el.textContent=text;el.dataset.error=String(error);}
};
async function base64File(file){
 if(!file||file.size<1024||file.size>MAX_BYTES)throw Error(ERROR_MESSAGES.AUDIO_SIZE_LIMIT);
 if(!/\.(wav|mp3|m4a|aac|flac|ogg|opus|webm|aiff)$/i.test(file.name))throw Error(ERROR_MESSAGES.INVALID_AUDIO);
 const bytes=new Uint8Array(await file.arrayBuffer());
 let data='';
 for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {name:file.name,base64:btoa(data)};
}
export async function audoWorkspaceFile({maxSeconds=12}={}){
 const source=w.ensureAudio();
 if(w.originalFile?.size>=1024&&w.originalFile.size<=MAX_BYTES &&
  /\.(wav|mp3|m4a|aac|flac|ogg|opus|webm|aiff)$/i.test(w.originalFile.name)&&!w.selection &&
  !w.history.canUndo&&!w.history.canRedo){
  return {file:await base64File(w.originalFile),scope:'FULL FILE'};
 }
 const {file,window}=makeCloudTaggingExcerpt(source,{selection:w.selection,maxSeconds});
 return {file,scope:'EXCERPT '+(window.end-window.start).toFixed(1)+' s · '+window.start.toFixed(1)+'–'+window.end.toFixed(1)+' s'};
}
function audioUrl(result,urls){
 if(result?.audioUrl?.startsWith('https://'))return result.audioUrl;
 if(typeof result?.base64!=='string'||!/^audio\//.test(result.mime||''))throw Error('No playable audio was returned.');
 const binary=atob(result.base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
 urls.add(url);return url;
}
function disposeUrls(urls){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
function showAudio(host,result,urls,downloadBase){
 const root=host.querySelector('[data-audo-output]');if(!root)return;
 root.replaceChildren();disposeUrls(urls);
 const url=audioUrl(result,urls);
 const player=document.createElement('audio');player.controls=true;player.preload='metadata';player.src=url;
 player.setAttribute('aria-label','Processed audio');
 const link=document.createElement('a');link.href=url;link.textContent='DOWNLOAD AUDIO ↗';
 if(url.startsWith('blob:'))link.download=(downloadBase||'pulse-audo')+(result.mime?.includes('wav')?'.wav':'.mp3');
 else {link.target='_blank';link.rel='noopener noreferrer';}
 root.append(player,link);root.hidden=false;
}
export function mountAudoVocalCleanup({host}){
 host.innerHTML='<section class="tool-view ai2-panel audo-panel" data-audo-cleanup>'+
  '<div class="tool-view-header"><span>04 / AUDIO REPAIR / AI VOCAL CLEANUP</span><span>SPEECH CLEANUP</span></div>'+
  '<h3>Clean the voice.<br><span>Keep the character.</span></h3>'+
  '<p class="tool-description">Clean speech recordings. Studio Restore can change the voice character; it is not intended for finished music mixes.</p>'+
  '<div class="audo-fields"><label>PROCESSING MODE<select data-audo-mode><option value="remove-noise">PRESERVE VOICE · Noise removal</option><option value="enhance-voice">STUDIO RESTORE · Echo + distortion</option></select></label>'+
  '<label>STRENGTH / BLEND · <output data-audo-strength-label>85%</output><input data-audo-strength type="range" min="10" max="100" step="5" value="85"></label></div>'+
  '<label class="audo-check"><input type="checkbox" data-audo-volume checked> Normalize speech output to -16 LUFS</label>'+
  '<p class="ai2-note">Use SOURCE AUDIO or a Shift-drag selection. Larger recordings use a short excerpt.</p>'+
  '<label class="audo-check"><input type="checkbox" data-audo-consent> I have rights to this voice and agree to upload the selected audio to Audo.</label>'+
  '<button class="ai2-action" type="button" data-audo-run>CLEAN VOCAL ↗</button>'+
  '<p class="ai2-status" data-audo-status role="status" aria-live="polite">Load a vocal in SOURCE AUDIO.</p>'+
  '<div class="audo-output" data-audo-output hidden></div></section>';
 const run=host.querySelector('[data-audo-run]'),slider=host.querySelector('[data-audo-strength]');
 slider.oninput=()=>{host.querySelector('[data-audo-strength-label]').textContent=slider.value+'%';};
 let disposed=false,busy=false,controller=null;
 const urls=new Set();
 run.onclick=async()=>{
  if(busy||disposed)return;
  if(!host.querySelector('[data-audo-consent]').checked)return status(host,'Confirm permission to send the audio to Audo.',true);
  busy=true;run.disabled=true;controller=new AbortController();
  try{
   status(host,'Preparing audio…');
   const prepared=await audoWorkspaceFile({maxSeconds:12});
   if(disposed||controller.signal.aborted)return;
   status(host,'Sending '+prepared.scope.toLowerCase()+'…');
   const result=await completeAudo({tool:'cleanup',mode:host.querySelector('[data-audo-mode]').value,
    file:prepared.file,strength:Number(slider.value),autoVolume:host.querySelector('[data-audo-volume]').checked,consent:true},
    'cleanup',{signal:controller.signal,onProgress:text=>!disposed&&status(host,text)});
   if(disposed||controller.signal.aborted)return;
   showAudio(host,result,urls,'pulse-cleaned-vocal');
   status(host,'Vocal cleanup ready · '+prepared.scope+'. Source audio remains unchanged.');
  }catch(error){if(!disposed&&error.name!=='AbortError')status(host,error.message,true);}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 const unsubscribe=w.subscribe((_,reason)=>{
  if(!TRANSITIONS.has(reason))return;
  controller?.abort();disposeUrls(urls);
  const out=host.querySelector('[data-audo-output]');if(out){out.replaceChildren();out.hidden=true;}
  status(host,'Source changed. Check the selection and run cleanup again.');
 });
 return()=>{disposed=true;controller?.abort();unsubscribe();disposeUrls(urls);};
}
export function mountAudoSfx({host}){
 host.innerHTML='<section class="tool-view ai2-panel audo-panel" data-audo-sfx>'+
  '<div class="tool-view-header"><span>04 / SMART FX / SOUND EFFECTS</span><span>SOUND DESIGN</span></div>'+
  '<h3>Describe it.<br><span>Hear it.</span></h3>'+
  '<p class="tool-description">Generate an original whoosh, impact, texture or atmosphere from a text description. Does not modify SOURCE AUDIO.</p>'+
  '<label class="audo-label">SOUND DESCRIPTION<textarea data-audo-prompt maxlength="450" rows="4" placeholder="A low, distorted cinematic impact with a metallic echo and deep sub tail"></textarea></label>'+
  '<div class="audo-presets"><button type="button" data-audo-preset="A dark cinematic rising whoosh ending in a heavy distorted impact">DARK WHOOSH</button>'+
  '<button type="button" data-audo-preset="Deep sub bass hit with a long underground echo and analog tape grit">SUB IMPACT</button>'+
  '<button type="button" data-audo-preset="Eerie distant industrial drones, windy tunnel ambience, seamless loop">DARK AMBIENCE</button></div>'+
  '<div class="audo-fields"><label>DURATION · SECONDS<input type="number" data-audo-duration min="0.5" max="10" step="0.5" value="5"></label>'+
  '<label>EXPORT FORMAT<select data-audo-format><option value="mp3">MP3</option><option value="wav">WAV · 48 kHz</option></select></label></div>'+
  '<label class="audo-check"><input type="checkbox" data-audo-loop> Seamless loop</label>'+
  '<label class="audo-check"><input type="checkbox" data-audo-consent> Send the description to Audo to generate the sound.</label>'+
  '<button type="button" class="ai2-action" data-audo-run>GENERATE SOUND ↗</button>'+
  '<p class="ai2-status" data-audo-status role="status" aria-live="polite">Describe a sound to begin.</p>'+
  '<div class="audo-output" data-audo-output hidden></div></section>';
 const run=host.querySelector('[data-audo-run]'),prompt=host.querySelector('[data-audo-prompt]');
 for(const preset of host.querySelectorAll('[data-audo-preset]'))preset.onclick=()=>{prompt.value=preset.dataset.audoPreset;prompt.focus();};
 let disposed=false,busy=false,controller=null;
 const urls=new Set();
 run.onclick=async()=>{
  if(busy||disposed)return;
  const text=prompt.value.trim(),duration=Number(host.querySelector('[data-audo-duration]').value);
  if(!text||text.length>450)return status(host,'Describe the sound in 1–450 characters.',true);
  if(!Number.isFinite(duration)||duration<.5||duration>10||Math.round(duration*2)!==duration*2)
   return status(host,'Choose 0.5–10 seconds in half-second steps.',true);
  if(!host.querySelector('[data-audo-consent]').checked)return status(host,'Confirm text submission to Audo.',true);
  busy=true;run.disabled=true;controller=new AbortController();
  try{
   status(host,'Generating '+duration+'-second sound effect…');
   const data=await completeAudo({tool:'sfx',text,duration,format:host.querySelector('[data-audo-format]').value,
    loop:host.querySelector('[data-audo-loop]').checked,consent:true},'sfx',
    {signal:controller.signal,onProgress:msg=>!disposed&&status(host,msg)});
   if(disposed||controller.signal.aborted)return;
   showAudio(host,data,urls,'pulse-sound-effect');
   status(host,'Sound effect ready. Play or download the result.');
  }catch(error){if(!disposed&&error.name!=='AbortError')status(host,error.message,true);}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 return()=>{disposed=true;controller?.abort();disposeUrls(urls);};
}
export function compareTempos(local,remote){
 if(!Number.isFinite(local)||!Number.isFinite(remote)||local<=0||remote<=0)return null;
 const candidates=[['SAME TIME',remote],['HALF TIME',remote/2],['DOUBLE TIME',remote*2]];
 const ordered=candidates.map(([label,bpm])=>({label,bpm,delta:Math.abs(bpm-local)})).sort((a,b)=>a.delta-b.delta);
 return ordered[0];
}
export function mountAudoKeyComparison({host}){
 const panel=host.querySelector('[data-audo-key-panel]');
 if(!panel)return()=>{};
 const run=panel.querySelector('[data-audo-key-run]'),notice=panel.querySelector('[data-audo-key-note]'),
  output=panel.querySelector('[data-audo-key-result]'),consent=panel.querySelector('[data-audo-key-consent]');
 let disposed=false,busy=false,controller=null;
 run.onclick=async()=>{
  if(busy||disposed)return;
  if(!consent.checked){notice.textContent='Confirm the audio upload to Audo.';return;}
  const source=w.buffer;
  if(!source){notice.textContent='Load audio into SOURCE AUDIO first.';return;}
  controller=new AbortController();busy=true;run.disabled=true;
  try{
   notice.textContent='Preparing independent analysis…';
   const prepared=await audoWorkspaceFile({maxSeconds:20});
   if(disposed||controller.signal.aborted||w.buffer!==source)return;
   notice.textContent='Analyzing '+prepared.scope.toLowerCase()+'…';
   const result=await completeAudo({tool:'crosscheck',file:prepared.file,consent:true},'crosscheck',
    {signal:controller.signal,onProgress:msg=>{if(!disposed)notice.textContent=msg;}});
   if(disposed||controller.signal.aborted||w.buffer!==source)return;
   const data=result.analysis;
   if(!data||(!data.bpm&&!data.key&&!data.camelot))throw Error('No usable musical estimate was returned.');
   output.replaceChildren();
   const local=Number(host.querySelector('[data-focus="bpm"]')?.textContent),match=compareTempos(local,data.bpm);
   const fields=[['CROSS-CHECK BPM',Number.isFinite(data.bpm)?data.bpm.toFixed(1):'—'],
    ['CROSS-CHECK KEY',data.key||'—'],['CROSS-CHECK CAMELOT',data.camelot||'—']];
   if(match)fields.push(['TEMPO COMPARISON',match.label+' · '+match.delta.toFixed(1)+' BPM difference']);
   for(const [label,value] of fields){
    const item=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');
    small.textContent=label;strong.textContent=value;item.append(small,strong);output.append(item);
   }
   output.hidden=false;
   notice.textContent='Independent estimate · '+prepared.scope+'. Compare the beat by ear; it does not change your beat grid.';
  }catch(error){if(!disposed&&error.name!=='AbortError')notice.textContent=error.message;}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 const unsub=w.subscribe((_,reason)=>{
  if(!TRANSITIONS.has(reason))return;
  controller?.abort();output.replaceChildren();output.hidden=true;
  notice.textContent='Source changed. Run an independent check when ready.';
 });
 return()=>{disposed=true;controller?.abort();unsub();};
}
