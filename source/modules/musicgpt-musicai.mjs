/** PULSE AI Studio / MusicGPT Music AI.
 * Generates two independent tracks from text. No source audio is uploaded.
 * Only conversion IDs are kept in session storage; owner tokens never persist.
 * "Stop checking" stops GET polling, not the provider's paid generation job.
 */
const SESSION_KEY='pulse-musicai-v2-last-job';
const ID=/^[A-Za-z0-9_-]{8,120}$/;
const ERROR_COPY={
 OWNER_AUTH_REQUIRED:'Incorrect private PULSE access token.',
 MUSICGPT_MUSICAI_NOT_CONFIGURED:'Music AI is not configured for this deployment.',
 CREDIT_CONSENT_REQUIRED:'You must confirm paid MusicGPT generation.',
 INVALID_GENERATION_PARAMETERS:'Check the prompt, music style, lyrics and output settings.',
 INSUFFICIENT_CREDITS:'Not enough MusicGPT credits to generate two tracks.',
 MUSICGPT_AUTH_FAILED:'MusicGPT rejected the server-side API key.',
 INVALID_PROVIDER_REQUEST:'MusicGPT rejected these generation parameters.',
 RATE_LIMITED:'MusicGPT rate limit reached. Try again later.',
 MISSING_CONVERSION_IDS:'MusicGPT did not return two track IDs; check your provider account before generating again.',
 MUSICGPT_TIMEOUT:'MusicGPT timed out. The paid job may still have started; check your MusicGPT account before retrying.',
 MUSICGPT_CONNECTION_ERROR:'Connection to MusicGPT failed. Check existing provider jobs before starting another.',
 INVALID_PROVIDER_RESPONSE:'MusicGPT returned an incomplete response.'
};
const $=(host,selector)=>host.querySelector(selector);
const allowedLink=value=>{
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}
};
export function mountMusicAIV2({host}={}){
 if(!host)throw Error('Music AI needs a host element.');
 host.innerHTML='<section class="tool-view ai2-panel pulse-musicai" aria-label="AI Music Generator">'+
 '<div class="tool-view-header"><span>04 / AI STUDIO / MUSIC GENERATOR</span><span>MUSICGPT / MUSIC AI</span></div>'+
 '<h3>Generate a track.<br><span>Choose your version.</span></h3>'+
 '<p class="tool-description">Create complete original music from a prompt or your own lyrics. Choose your sound. MusicGPT generates TWO variations on its servers using paid API credits. SOURCE AUDIO is not uploaded.</p>'+
 '<div class="pulse-mai-modes" role="group" aria-label="Song generation input mode"><button type="button" data-mai-mode="prompt" aria-pressed="true">PROMPT TO SONG</button><button type="button" data-mai-mode="custom" aria-pressed="false">CUSTOM LYRICS</button></div>'+
 '<form class="pulse-mai-form" data-mai-form novalidate>'+
 '<label class="pulse-mai-field" data-mai-prompt-group>SONG DESCRIPTION / MAX 1000 CHARACTERS<textarea data-mai-prompt rows="4" maxlength="1000" placeholder="Dark cinematic trap, punchy 808s, sparse haunting piano, 145 BPM, expressive hook..." required></textarea></label>'+
 '<label class="pulse-mai-field" data-mai-lyrics-group hidden>YOUR ORIGINAL LYRICS<textarea data-mai-lyrics rows="10" maxlength="9000" placeholder="[Verse 1]&#10;...&#10;&#10;[Chorus]&#10;..."></textarea></label>'+
 '<div class="pulse-mai-fields">'+
 '<label class="pulse-mai-field">MUSIC STYLE / GENRE<input data-mai-style maxlength="140" placeholder="Trap, Hip-Hop, R&B, House, Lo-fi..."></label>'+
 '<label class="pulse-mai-field">OUTPUT TYPE<select data-mai-output><option value="full">FULL SONG / VOCALS + INSTRUMENTS</option><option value="instrumental">INSTRUMENTAL ONLY</option><option value="vocals">VOCALS ONLY</option></select></label>'+
 '<label class="pulse-mai-field">VOCAL CHARACTER<select data-mai-gender><option value="">AUTO</option><option value="female">FEMALE</option><option value="male">MALE</option><option value="neutral">NEUTRAL</option></select></label>'+
 '</div>'+
 '<label class="pulse-mai-field">TRACK TITLE / OPTIONAL<input data-mai-title maxlength="120" placeholder="Untitled session"></label>'+
 '<label class="pulse-mai-field">VOICE ID / OPTIONAL · AUTHORIZED MODELS ONLY<input data-mai-voice maxlength="120" autocomplete="off" placeholder="Voice ID from your MusicGPT account"></label>'+
 '<label class="pulse-mai-check"><input type="checkbox" data-mai-cover> GENERATE ALBUM COVER WITH THE TRACK</label>'+
 '<label class="pulse-mai-field">PRIVATE PULSE ACCESS TOKEN<input type="password" data-mai-token autocomplete="off" placeholder="Owner token, not your MusicGPT API key" required></label>'+
 '<label class="pulse-mai-check pulse-mai-consent"><input type="checkbox" data-mai-consent required> I have the rights to the lyrics and any voice model. I agree to send the provided text to MusicGPT and use paid credits for TWO generated versions.</label>'+
 '<p class="pulse-mai-hint">The prompt supports up to 1,000 characters. MusicGPT determines the actual credit cost and generation time. This interface provides completed-track playback and downloads.</p>'+
 '<button type="submit" class="ai2-action pulse-mai-generate" data-mai-generate>GENERATE 2 VERSIONS <span aria-hidden="true">↗</span></button>'+
 '</form>'+
 '<div class="pulse-mai-status-panel"><div class="pulse-mai-status-heading"><strong data-mai-config>CHECKING MUSICGPT</strong><span data-mai-job-label>NO JOB</span></div><p class="pulse-mai-status" role="status" aria-live="polite" data-mai-status>Choose a mode, describe your track and authorize the generation.</p>'+
 '<div class="pulse-mai-job-actions"><button type="button" data-mai-resume hidden>CHECK / RESUME JOB ↗</button><button type="button" data-mai-stop hidden>STOP CHECKING</button><button type="button" data-mai-reset hidden>NEW GENERATION</button></div></div>'+
 '<div class="pulse-mai-results" data-mai-results hidden aria-label="Generated versions">'+
 '<div class="pulse-mai-result-head"><strong>GENERATED VARIATIONS</strong><span>2 SEPARATE TRACKS</span></div>'+
 '<article class="pulse-mai-track" data-mai-track="0"><div class="pulse-mai-track-head"><h4>01 / VERSION A</h4><span data-mai-track-status>WAITING</span></div><div data-mai-track-body><p>The first version will appear here after generation.</p></div></article>'+
 '<article class="pulse-mai-track" data-mai-track="1"><div class="pulse-mai-track-head"><h4>02 / VERSION B</h4><span data-mai-track-status>WAITING</span></div><div data-mai-track-body><p>The second version will appear here after generation.</p></div></article>'+
 '</div></section>';
 const get=s=>$(host,s);
 let disposed=false,mode='prompt',configured=false,submitting=false,polling=false;
 let controller=null,job=null,outputs=[null,null],counter=0;
 const status=(text,error=false)=>{
  if(disposed)return;
  const el=get('[data-mai-status]');el.textContent=text;el.dataset.error=String(error);
 };
 const session=()=>typeof sessionStorage!=='undefined'?sessionStorage:null;
 const persist=()=>{
  try{
   if(!job){session()?.removeItem(SESSION_KEY);return;}
   session()?.setItem(SESSION_KEY,JSON.stringify({ids:job.ids,taskId:job.taskId,created:job.created}));
  }catch{}
 };
 function showJob(){
  if(disposed)return;
  get('[data-mai-job-label]').textContent=job?'2 TRACK IDS SAVED':'NO JOB';
  get('[data-mai-results]').hidden=!job;
  get('[data-mai-generate]').disabled=submitting||polling||Boolean(job);
  get('[data-mai-resume]').hidden=!job||polling;
  get('[data-mai-stop]').hidden=!polling;
  get('[data-mai-reset]').hidden=!job||polling;
 }
 function resetCards(){
  outputs=[null,null];
  for(const i of [0,1]){
   const card=get('[data-mai-track="'+i+'"]');
   card.dataset.complete='false';
   card.querySelector('[data-mai-track-status]').textContent='QUEUED';
   const body=card.querySelector('[data-mai-track-body]');body.replaceChildren();
   const label=document.createElement('p');
   label.textContent='Waiting for MusicGPT version '+(i===0?'A':'B')+'…';
   body.append(label);
  }
 }
 function resultCard(i,data){
  if(disposed||!job||data.conversionId!==job.ids[i])return;
  const card=get('[data-mai-track="'+i+'"]');
  const label=card.querySelector('[data-mai-track-status]'),body=card.querySelector('[data-mai-track-body]');
  if(data.status==='failed'){
   label.textContent='FAILED';card.dataset.complete='failed';
   body.textContent='MusicGPT could not generate this variation. Check the provider account for details.';
   outputs[i]='failed';return;
  }
  if(data.status!=='complete'){
   if(card.dataset.complete!=='true')label.textContent='PROCESSING';
   return;
  }
  if(outputs[i]==='complete')return;
  const audio=allowedLink(data.audioUrl),wav=allowedLink(data.wavUrl);
  if(!audio&&!wav)return;
  outputs[i]='complete';card.dataset.complete='true';label.textContent='READY';
  body.replaceChildren();
  if(data.title){
   const name=document.createElement('strong');name.textContent=data.title;body.append(name);
  }
  const player=document.createElement('audio');player.controls=true;player.preload='none';player.src=audio||wav;
  player.setAttribute('aria-label','Play generated music version '+(i===0?'A':'B'));
  body.append(player);
  const links=document.createElement('div');links.className='pulse-mai-downloads';
  for(const [url,labelText] of [[audio,'OPEN / DOWNLOAD AUDIO ↗'],[wav,'OPEN / DOWNLOAD WAV ↗']]){
   if(!url||links.querySelector('[href="'+url.replace(/["\\]/g,'')+'"]'))continue;
   const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=labelText;
   links.append(a);
  }
  body.append(links);
  if(Number.isFinite(data.duration)){
   const length=document.createElement('p');length.textContent='DURATION · '+Math.round(data.duration)+' SEC';body.append(length);
  }
 }
 const setMode=next=>{
  if(disposed||!['prompt','custom'].includes(next))return;
  mode=next;
  get('[data-mai-prompt-group]').hidden=next!=='prompt';
  get('[data-mai-lyrics-group]').hidden=next!=='custom';
  host.querySelectorAll('[data-mai-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.maiMode===next)));
  status(next==='custom'?'Enter your lyrics and a music style to build two variations.':'Describe the music you want to generate.');
 };
 for(const button of host.querySelectorAll('[data-mai-mode]'))button.addEventListener('click',()=>setMode(button.dataset.maiMode));
 function token(){
  const input=get('[data-mai-token]').value.trim();
  if(!input)throw Error('Enter PRIVATE PULSE ACCESS TOKEN to continue.');
  return input;
 }
 async function request(action,data,signal){
  const response=await fetch('/api/pulse-musicai-v2',{
   method:'POST',headers:{'Content-Type':'application/json','x-pulse-owner-token':token()},
   body:JSON.stringify({action,...data}),signal,cache:'no-store'
  });
  const json=await response.json().catch(()=>({error:'INVALID_PROVIDER_RESPONSE'}));
  if(!response.ok)throw Error(ERROR_COPY[json.error]||'MusicGPT request failed ('+(json.error||response.status)+').');
  return json;
 }
 const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(Object.assign(Error('Stopped'),{name:'AbortError'}));
  const onAbort=()=>{clearTimeout(t);reject(Object.assign(Error('Stopped'),{name:'AbortError'}));};
  const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
 const allReady=()=>outputs.every(x=>x==='complete'||x==='failed');
 async function checkVersions(){
  if(disposed||!job||polling)return;
  const myJob=++counter,ac=new AbortController();controller=ac;polling=true;showJob();
  try{
   for(let round=0;round<45;round++){
    if(disposed||ac.signal.aborted||myJob!==counter)return;
    for(let i=0;i<2;i++){
     if(outputs[i]==='complete'||outputs[i]==='failed')continue;
     const data=await request('result',{conversionId:job.ids[i]},ac.signal);
     if(disposed||ac.signal.aborted||myJob!==counter)return;
     resultCard(i,data);
    }
    if(allReady()){
     status(outputs.every(x=>x==='complete')?'Both tracks are ready. Play either version or open the download link.':
      'Generation finished, but one or more variations failed. Check the status of each version.',outputs.some(x=>x==='failed'));
     return;
    }
    status('MusicGPT is generating the tracks. Checking two versions · round '+(round+1)+'/45. You can stop checking and resume later.');
    if(round<44)await wait(10_000,ac.signal);
   }
   status('Still processing. Use CHECK / RESUME JOB to continue later. No additional generation charge.');
  }catch(error){
   if(!disposed&&myJob===counter&&error.name!=='AbortError')status(error.message||'Unable to check the music generation status.',true);
  }finally{
   if(controller===ac){controller=null;polling=false;if(!disposed)showJob();}
  }
 }
 const readValues=()=>{
  if(!configured)throw Error('MusicGPT Music AI is not configured on this deployment.');
  token();
  if(!get('[data-mai-consent]').checked)throw Error('Confirm authorization and credit usage for both generated versions.');
  const prompt=get('[data-mai-prompt]').value.trim();
  const lyrics=get('[data-mai-lyrics]').value.trim();
  const musicStyle=get('[data-mai-style]').value.trim();
  if(mode==='prompt'&&(!prompt||prompt.length>1000))throw Error('Enter a song description of up to 1,000 characters.');
  if(mode==='custom'&&(!lyrics||!musicStyle))throw Error('CUSTOM LYRICS requires both lyrics and music style.');
  return {mode,prompt:mode==='prompt'?prompt:'',lyrics:mode==='custom'?lyrics:'',musicStyle,
   output:get('[data-mai-output]').value,
   gender:get('[data-mai-gender]').value,title:get('[data-mai-title]').value.trim(),
   voiceId:get('[data-mai-voice]').value.trim(),generateAlbumCover:get('[data-mai-cover]').checked,
   consent:true};
 };
 get('[data-mai-form]').addEventListener('submit',async event=>{
  event.preventDefault();
  if(disposed||submitting||polling||job)return;
  let values;try{values=readValues();}catch(error){status(error.message,true);return;}
  const ac=new AbortController();controller=ac;submitting=true;showJob();
  status('Submitting paid MusicGPT Music AI generation for TWO tracks. Do not submit again if the connection times out.');
  try{
   const result=await request('generate',values,ac.signal);
   if(disposed||ac.signal.aborted)return;
   if(result.versions?.length!==2||!result.versions.every(v=>ID.test(v.id||'')))throw Error('MusicGPT returned an invalid job. Check your account before retrying.');
   job={ids:result.versions.map(v=>v.id),taskId:result.taskId,created:Date.now()};
   persist();resetCards();
   get('[data-mai-results]').hidden=false;
   status('Two versions submitted'+(result.creditEstimate!==null?' · estimated '+result.creditEstimate+' credits':'')+
    (result.eta!==null?' · ETA '+result.eta+' seconds':'')+'. Preparing the results…');
  }catch(error){
   if(!disposed&&error.name!=='AbortError')status(error.message||'Could not submit generation.',true);
  }finally{
   if(controller===ac){controller=null;submitting=false;if(!disposed)showJob();}
  }
  if(job&&!disposed)void checkVersions();
 });
 get('[data-mai-stop]').onclick=()=>{
  counter++;controller?.abort();controller=null;polling=false;showJob();
  status('Stopped checking. MusicGPT may still be generating. Resume without submitting another paid job.');
 };
 get('[data-mai-resume]').onclick=()=>{if(!polling&&job)void checkVersions();};
 get('[data-mai-reset]').onclick=()=>{
  if(polling||submitting)return;
  job=null;outputs=[null,null];persist();resetCards();showJob();
  status('Ready for a NEW paid generation. Previous generated files remain with MusicGPT.');
 };
 // Resume IDs without exposing the owner token to client storage.
 try{
  const raw=session()?.getItem(SESSION_KEY),saved=raw?JSON.parse(raw):null;
  if(saved&&Array.isArray(saved.ids)&&saved.ids.length===2&&saved.ids.every(id=>ID.test(id))&&
   Number.isFinite(saved.created)&&Date.now()-saved.created<7*86400_000){
   job={ids:saved.ids,taskId:saved.taskId,created:saved.created};
   resetCards();showJob();status('Saved generation found. Enter your owner token and select CHECK / RESUME JOB to retrieve both versions without another charge.');
  }
 }catch{}
 showJob();
 void (async()=>{
  try{
   const res=await fetch('/api/pulse-musicai-v2',{cache:'no-store'});
   const info=await res.json();
   if(disposed)return;
   configured=res.ok&&info.configured===true;
   get('[data-mai-config]').textContent=configured?'MUSICGPT MUSIC AI / READY':'MUSICGPT MUSIC AI / NOT CONFIGURED';
   if(!configured)status('Music AI is not configured in this deployment. The API key must be set in the server environment.',true);
  }catch{if(!disposed){get('[data-mai-config]').textContent='CONFIGURATION STATUS UNAVAILABLE';}}
 })();
 return()=>{
  disposed=true;counter++;controller?.abort();controller=null;
  get('[data-mai-token]').value='';
 };
}
