/**
 * MusicGPT Extraction v2 in AI Studio (owner-only, credit-based).
 * This is stem separation, not a YouTube video-to-audio converter.
 */
import {workspace as w} from './workspace.mjs';
import {makeCloudTaggingExcerpt} from './music-tagger.mjs';

const API='/api/pulse-extraction';
const SESSION_KEY='pulse-extraction-last-job';
const ID=/^[A-Za-z0-9_-]{8,128}$/;
const MAX_FILE_BYTES=2400000;
const STEM_GROUPS=Object.freeze([
 ['MAIN MIX',[['vocals','Vocals'],['instrumental','Instrumental'],['drums','Drums'],['bass','Bass']]],
 ['VOCALS',[['lead_vocal','Lead vocal'],['back_vocal','Backing vocal'],['male_vocal','Male vocal'],['female_vocal','Female vocal']]],
 ['MELODIC INSTRUMENTS',[['guitar','Guitar'],['piano','Piano'],['keys','Keys / synth'],['strings','Strings'],['winds','Winds']]],
 ['GUITARS',[['acoustic_guitar','Acoustic guitar'],['electric_guitar','Electric guitar'],['rhythm_guitar','Rhythm guitar'],['solo_guitar','Solo guitar']]],
 ['DRUMS',[['kick_drum','Kick'],['snare_drum','Snare'],['hi_hat','Hi-hat'],['toms','Toms'],['ride','Ride'],['crash','Crash']]]
]);
const ERRORS={
 MUSICGPT_EXTRACTION_NOT_CONFIGURED:'MusicGPT Extraction API or private owner access is not configured on this environment.',
 OWNER_AUTH_REQUIRED:'Private PULSE access token is incorrect.',
 CROSS_ORIGIN_BLOCKED:'This request was blocked by the same-origin protection.',
 AUDIO_CONSENT_REQUIRED:'Confirm the rights to the input and consent to paid cloud processing.',
 INVALID_EXTRACTION_PARAMETERS:'Select at least one supported stem and only valid preprocessing options.',
 CHOOSE_ONE_AUDIO_SOURCE:'Choose exactly one audio input method.',
 INVALID_YOUTUBE_URL:'MusicGPT currently supports a standard YouTube watch or share URL for remote extraction.',
 INVALID_AUDIO_FILE:'Choose a valid audio file and try again.',
 INVALID_AUDIO_FORMAT:'Use WAV, MP3, M4A, FLAC, OGG, AAC or OPUS.',
 AUDIO_TOO_LARGE:'Direct uploads are limited to 2.4 MB through the PULSE gateway. Use a shorter excerpt or the provider-supported YouTube URL.',
 MUSICGPT_AUTH_FAILED:'MusicGPT rejected the server-side Extraction API key.',
 INSUFFICIENT_CREDITS:'Your MusicGPT account has insufficient credits.',
 RATE_LIMITED:'MusicGPT rate limit reached. Resume an existing job or try later.',
 MUSICGPT_TIMEOUT:'The provider timed out. Check your MusicGPT account before starting another paid job.',
 MUSICGPT_CONNECTION_ERROR:'MusicGPT is unreachable. The submitted job might still be running.',
 MISSING_CONVERSION_ID:'The provider did not return a usable job ID. Check your account before retrying.'
};
const escaped=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const select=(root,s)=>root.querySelector(s);
const storage=()=>{try{return globalThis.sessionStorage;}catch{return null;}};
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted)return reject(Object.assign(new Error('Stopped'),{name:'AbortError'}));
 const onAbort=()=>{clearTimeout(timer);reject(Object.assign(new Error('Stopped'),{name:'AbortError'}));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
 signal.addEventListener('abort',onAbort,{once:true});
});
function fileToBase64(file){
 return file.arrayBuffer().then(ab=>{
  const bytes=new Uint8Array(ab);
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {name:file.name,base64:btoa(binary)};
 });
}
const ALLOWED_PRE=['Denoise','Deecho','Dereverb'];
export function mountStemExtraction({host}={}){
 if(!host)throw Error('Stem Extraction requires a host.');
 const stemChoices=STEM_GROUPS.map(([group,items])=>'<fieldset class="pulse-ext-group"><legend>'+group+'</legend>'+
  items.map(([id,label])=>'<label><input type="checkbox" data-ext-stem="'+escaped(id)+'"'+
   (['vocals','instrumental'].includes(id)?' checked':'')+'><span>'+escaped(label)+'</span></label>').join('')+
  '</fieldset>').join('');
 host.innerHTML='<section class="tool-view ai2-panel pulse-extraction">'+
  '<div class="tool-view-header"><span>04 / AI STUDIO / STEM EXTRACTION</span><span>MUSICGPT / V2 CLOUD</span></div>'+
  '<h3>Pull it apart.<br><span>Keep every layer.</span></h3>'+
  '<p class="tool-description">Separate vocals, drums, bass and instruments using MusicGPT.</p>'+
  '<div class="pulse-ext-form">'+
   '<div class="pulse-ext-section-heading"><strong>01 / SOURCE AUDIO</strong><span>CHOOSE ONE METHOD</span></div>'+
   '<div class="pulse-ext-modes" role="group" aria-label="Audio source">'+
    '<button type="button" data-ext-source="file" aria-pressed="true">AUDIO FILE</button>'+
    '<button type="button" data-ext-source="workspace" aria-pressed="false">SOURCE AUDIO / 12 SEC</button>'+
    '<button type="button" data-ext-source="url" aria-pressed="false">YOUTUBE URL</button></div>'+
   '<label class="pulse-ext-field" data-ext-input="file">UPLOAD AUDIO (MAX 2.4 MB)<input type="file" data-ext-file accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.opus,.aac"></label>'+
   '<p class="pulse-ext-note" data-ext-input="workspace" hidden>Uses the middle 12 seconds or a selected waveform region from SOURCE AUDIO. This is an excerpt, not full-track separation.</p>'+
   '<label class="pulse-ext-field" data-ext-input="url" hidden>YOUTUBE AUDIO SOURCE<input type="url" data-ext-url placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></label>'+
   '<p class="pulse-ext-note">Full tracks: use a supported YouTube URL.</p>'+
   '<div class="pulse-ext-section-heading"><strong>02 / SELECT OUTPUT STEMS</strong><span>CHOOSE AT LEAST ONE</span></div>'+
   '<div class="pulse-ext-groups">'+stemChoices+'</div>'+
   '<div class="pulse-ext-section-heading"><strong>03 / OPTIONAL PREPROCESSING</strong><span>BEFORE EXTRACTION</span></div>'+
   '<div class="pulse-ext-pre">'+ALLOWED_PRE.map(x=>'<label><input type="checkbox" data-ext-pre="'+x+'">'+x.toUpperCase()+'</label>').join('')+'</div>'+
   '<label class="pulse-ext-check"><input type="checkbox" data-ext-eco> ECO MODE / PROVIDER PARALLEL PROCESSING</label>'+
   '<label class="pulse-ext-field">PRIVATE PULSE ACCESS TOKEN<input type="password" data-ext-token autocomplete="off" spellcheck="false" placeholder="Owner token, not MusicGPT API key"></label>'+
   '<label class="pulse-ext-check pulse-ext-consent"><input type="checkbox" data-ext-consent> I own or have permission to use this audio. I consent to sending it to MusicGPT and spending API credits.</label>'+
   '<div class="pulse-ext-actions"><button type="button" data-ext-submit>EXTRACT STEMS ↗</button><button type="button" data-ext-stop hidden>STOP CHECKING</button></div>'+
   '<p class="pulse-ext-note">Uses paid cloud credits. Stop pauses status checks, not the job.</p>'+
  '</div>'+
  '<div class="pulse-ext-status" role="status" aria-live="polite" data-ext-status>Checking MusicGPT Extraction availability…</div>'+
  '<div class="pulse-ext-job" data-ext-job hidden>'+
   '<strong>LAST EXTRACTION JOB</strong><p data-ext-job-id></p>'+
   '<div class="pulse-ext-job-actions"><button type="button" data-ext-resume>CHECK / RESUME JOB</button><button type="button" data-ext-new>NEW EXTRACTION</button></div>'+
  '</div>'+
  '<div class="pulse-ext-results" data-ext-results hidden><div class="pulse-ext-section-heading"><strong>EXTRACTED STEMS</strong><span>DOWNLOAD / PREVIEW</span></div><div data-ext-files></div></div>'+
  '</section>';
 const $=s=>select(host,s);
 let disposed=false,busy=false,sourceMethod='file',conversionId=null,controller=null,run=0,configured=false;
 const status=(message,error=false)=>{if(disposed)return;const el=$('[data-ext-status]');el.textContent=message;el.dataset.error=String(error);};
 const showControls=()=>{
  $('[data-ext-submit]').disabled=busy||Boolean(conversionId)||!configured;
  $('[data-ext-stop]').hidden=!busy;
  $('[data-ext-resume]').disabled=busy;
  $('[data-ext-new]').disabled=busy;
  $('[data-ext-job]').hidden=!conversionId;
  if(conversionId)$('[data-ext-job-id]').textContent='CONVERSION ID · '+conversionId;
 };
 const remember=()=>{
  try{if(conversionId)storage()?.setItem(SESSION_KEY,JSON.stringify({id:conversionId,at:Date.now()}));
   else storage()?.removeItem(SESSION_KEY);}catch{}
 };
 const abort=()=>{
  run++;controller?.abort();controller=null;busy=false;showControls();
 };
 const updateMethod=next=>{
  if(disposed||busy||conversionId||!['file','workspace','url'].includes(next))return;
  sourceMethod=next;
  host.querySelectorAll('[data-ext-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.extSource===next)));
  host.querySelectorAll('[data-ext-input]').forEach(el=>el.hidden=el.dataset.extInput!==next);
  status(next==='workspace'?'SOURCE AUDIO will be encoded as a short WAV excerpt for cloud extraction.':
   next==='url'?'Use a provider-supported YouTube URL for full-track extraction.':'Choose an audio file up to 2.4 MB.');
 };
 for(const b of host.querySelectorAll('[data-ext-source]'))b.onclick=()=>updateMethod(b.dataset.extSource);
 function token(){
  const value=$('[data-ext-token]').value.trim();
  if(!value)throw Error('Enter PRIVATE PULSE ACCESS TOKEN.');
  return value;
 }
 async function gateway(action,values,signal){
  const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-pulse-owner-token':token()},
   body:JSON.stringify({action,...values}),signal,cache:'no-store'});
  const data=await res.json().catch(()=>({error:'INVALID_PROVIDER_RESPONSE'}));
  if(!res.ok)throw Error(ERRORS[data.error]||('MusicGPT returned '+String(data.error||res.status)));
  return data;
 }
 const picked=selector=>[...host.querySelectorAll(selector)].filter(x=>x.checked).map(x=>selector==='[data-ext-pre]'?x.dataset.extPre:x.dataset.extStem);
 async function prepareInput(){
  if(sourceMethod==='url'){
   const value=$('[data-ext-url]').value.trim();
   if(!value)return Promise.reject(Error('Paste a supported YouTube watch URL.'));
   return {audioUrl:value};
  }
  if(sourceMethod==='workspace'){
   // Direct upload stays under the Vercel 4.5MB ingress limit.
   const clip=makeCloudTaggingExcerpt(w.ensureAudio(),{selection:w.selection,maxSeconds:12});
   return {file:clip.file};
  }
  const file=$('[data-ext-file]').files?.[0];
  if(!file)throw Error('Choose a file before extraction.');
  if(file.size<1024||file.size>MAX_FILE_BYTES)throw Error(ERRORS.AUDIO_TOO_LARGE);
  if(!/\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i.test(file.name))throw Error(ERRORS.INVALID_AUDIO_FORMAT);
  return {file:await fileToBase64(file)};
 }
 function renderFiles(files){
  const root=$('[data-ext-files]');root.replaceChildren();
  for(const entry of files){
   if(!entry||typeof entry.stem!=='string')continue;
   const links=[['audioUrl','AUDIO / MP3 ↗'],['wavUrl','WAV ↗']]
    .filter(([key])=>typeof entry[key]==='string'&&entry[key].startsWith('https://'));
   if(!links.length)continue;
   const article=document.createElement('article');article.className='pulse-ext-result-card';
   const heading=document.createElement('h4');heading.textContent=entry.stem.replaceAll('_',' ').toUpperCase();
   article.append(heading);
   const player=document.createElement('audio');player.controls=true;player.preload='none';player.src=entry.audioUrl||entry.wavUrl;
   player.setAttribute('aria-label','Play '+entry.stem+' stem');article.append(player);
   const actions=document.createElement('div');actions.className='pulse-ext-downloads';
   for(const [key,label] of links){
    const link=document.createElement('a');link.href=entry[key];link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;
    actions.append(link);
   }
   article.append(actions);root.append(article);
  }
  $('[data-ext-results]').hidden=root.children.length===0;
 }
 async function checkJob(){
  if(disposed||busy||!conversionId)return;
  const turn=++run,ac=new AbortController();controller=ac;busy=true;showControls();
  try{
   for(let i=0;i<50;i++){
    if(disposed||ac.signal.aborted||run!==turn)return;
    const result=await gateway('result',{conversionId},ac.signal);
    if(disposed||ac.signal.aborted||run!==turn)return;
    if(result.status==='complete'){
     if(!Array.isArray(result.files)||!result.files.length){status(result.message||'Completed without downloadable stems.',true);return;}
     renderFiles(result.files);
     status(result.files.length+' extracted stem(s) ready. Preview or open the download links.');
     return;
    }
    if(result.status==='failed'){status(result.message||'MusicGPT Extraction failed. Check your MusicGPT account.',true);return;}
    status('Processing · '+(i+1)+'/50.');
    if(i<49)await sleep(10_000,ac.signal);
   }
   status('Still processing. Resume this job later.');
  }catch(err){
   if(!disposed&&run===turn&&err?.name!=='AbortError')status(err.message||'Could not check the job.',true);
  }finally{
   if(controller===ac){controller=null;busy=false;if(!disposed)showControls();}
  }
 }
 $('[data-ext-submit]').onclick=async()=>{
  if(disposed||busy||conversionId)return;
  if(!configured)return status(ERRORS.MUSICGPT_EXTRACTION_NOT_CONFIGURED,true);
  if(!$('[data-ext-consent]').checked)return status(ERRORS.AUDIO_CONSENT_REQUIRED,true);
  // Lock before asynchronous File reading; two clicks must never create two paid jobs.
  const turn=++run,ac=new AbortController();controller=ac;busy=true;showControls();
  try{
   token();
   const stems=picked('[data-ext-stem]');
   if(!stems.length)throw Error('Select at least one stem.');
   status('Preparing audio…');
   const input=await prepareInput();
   if(disposed||ac.signal.aborted||turn!==run)return;
   const selection={stems,preprocessingOptions:picked('[data-ext-pre]'),ecoMode:$('[data-ext-eco]').checked,
    consent:true,rightsConfirmed:true,...input};
   status('Submitting extraction. One paid request.');
   const result=await gateway('submit',selection,ac.signal);
   if(disposed||ac.signal.aborted||turn!==run)return;
   if(!ID.test(result.conversionId||''))throw Error(ERRORS.MISSING_CONVERSION_ID);
   conversionId=result.conversionId;remember();showControls();
   status('Submitted'+(Number.isFinite(result.creditEstimate)?' · est. '+result.creditEstimate+' credits':'')+'.');
  }catch(err){if(!disposed&&err?.name!=='AbortError')status(err.message||'Extraction failed.',true);}
  finally{if(controller===ac){controller=null;busy=false;if(!disposed)showControls();}}
  if(conversionId&&!disposed)void checkJob();
 };
 $('[data-ext-stop]').onclick=()=>{abort();status('Paused. The cloud job may continue.');};
 $('[data-ext-resume]').onclick=()=>{if(!busy&&conversionId)void checkJob();};
 $('[data-ext-new]').onclick=()=>{
  if(busy)return;conversionId=null;remember();$('[data-ext-results]').hidden=true;
  $('[data-ext-files]').replaceChildren();showControls();
  status('Ready for a new extraction.');
 };
 try{
  const saved=JSON.parse(storage()?.getItem(SESSION_KEY)||'null');
  if(saved&&ID.test(saved.id||'')&&Number.isFinite(saved.at)&&Date.now()-saved.at<7*86400_000){
   conversionId=saved.id;status('Previous extraction found. Enter your private token and select CHECK / RESUME JOB.');
  }
 }catch{}
 showControls();
 void (async()=>{
  try{
   const res=await fetch(API,{cache:'no-store'});
   const info=await res.json().catch(()=>({}));
   if(disposed)return;
   configured=res.ok&&info.configured===true;
   showControls();
   if(!configured)status(ERRORS.MUSICGPT_EXTRACTION_NOT_CONFIGURED,true);
   else if(!conversionId)status('Ready. Select stems and extract.');
  }catch{if(!disposed)status('Could not check MusicGPT configuration. Try reloading the tool.',true);}
 })();
 return()=>{disposed=true;abort();$('[data-ext-token]').value='';host.replaceChildren();};
}
