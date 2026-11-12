/** PULSE / MusicGPT Sound Generator. Standalone sound design; audio is never uploaded. */
const JOB_KEY='pulse-sound-generator-job';
const ID=/^[a-zA-Z0-9_-]{6,128}$/;
const ERR={
 SOUND_GENERATOR_NOT_CONFIGURED:'Sound Generator is not configured on this Preview.',
 OWNER_AUTH_REQUIRED:'Enter the correct private PULSE access token.',
 CREDIT_CONSENT_REQUIRED:'Confirm authorization and paid MusicGPT credits.',
 INVALID_PROMPT:'Write a description between 4 and 600 characters.',
 INVALID_AUDIO_LENGTH:'Choose a duration from 5 to 60 seconds.',
 INSUFFICIENT_CREDITS:'The MusicGPT account has insufficient credits.',
 PROVIDER_AUTH_FAILED:'MusicGPT rejected the server-side API key.',
 RATE_LIMITED:'MusicGPT is rate limiting generation.',
 INVALID_PROVIDER_REQUEST:'MusicGPT rejected the request. Revise the description or length.',
 MISSING_CONVERSION_ID:'MusicGPT did not return a job ID. Check your account before paying again.',
 PROVIDER_TIMEOUT:'The request timed out. The job may still have started; check the MusicGPT account before retrying.',
 PROVIDER_UNAVAILABLE:'MusicGPT is unavailable. Check existing jobs before starting another.'
};
function session(){try{return typeof sessionStorage==='undefined'?null:sessionStorage}catch{return null}}
function url(raw){try{const u=new URL(raw);return u.protocol==='https:'?u.href:null}catch{return null}}
export function mountSoundGenerator({host}={}){
 if(!host)throw Error('Sound Generator requires a panel host');
 host.innerHTML='<section class="tool-view ai2-panel pulse-soundgen" aria-label="AI Sound Generator">'+
 '<p class="tool-description">Create a sound effect, cinematic texture or ambient recording from a description. Choose the length, generate once using MusicGPT credits, then play or download the result. No SOURCE AUDIO is uploaded.</p>'+
 '<form data-sfx-form class="pulse-sfx-form" novalidate>'+
 '<label class="pulse-sfx-field">DESCRIBE THE SOUND<textarea data-sfx-prompt rows="5" maxlength="600" required placeholder="A distant subway rushing past, low metallic rumble, echoing tunnel, no speech..."></textarea></label>'+
 '<div class="pulse-sfx-grid"><label class="pulse-sfx-field">DURATION<select data-sfx-length><option value="5">05 SECONDS</option><option value="10">10 SECONDS</option><option value="15">15 SECONDS</option><option value="30" selected>30 SECONDS</option><option value="45">45 SECONDS</option><option value="60">60 SECONDS</option></select></label>'+
 '<label class="pulse-sfx-check"><input type="checkbox" data-sfx-cover> GENERATE COVER ART</label></div>'+
 '<label class="pulse-sfx-field">PRIVATE PULSE ACCESS TOKEN<input data-sfx-token type="password" autocomplete="off" placeholder="Owner access token" required></label>'+
 '<label class="pulse-sfx-consent"><input type="checkbox" data-sfx-consent required> I have rights to the submitted description and agree to sending it to MusicGPT for paid sound generation.</label>'+
 '<button type="submit" class="ai2-action pulse-sfx-generate" data-sfx-generate>GENERATE SOUND ↗</button></form>'+
 '<div class="pulse-sfx-status"><div class="pulse-sfx-status-head"><strong data-sfx-config>CHECKING API</strong><span data-sfx-job>NO JOB</span></div>'+
 '<p role="status" aria-live="polite" data-sfx-status>Describe the sound to begin.</p>'+
 '<div class="pulse-sfx-actions"><button type="button" data-sfx-resume hidden>CHECK RESULT ↗</button><button type="button" data-sfx-stop hidden>STOP CHECKING</button><button type="button" data-sfx-new hidden>NEW SOUND</button></div></div>'+
 '<div class="pulse-sfx-output" data-sfx-output hidden><strong>GENERATED SOUND</strong><audio controls preload="none" data-sfx-player></audio><a data-sfx-link target="_blank" rel="noopener noreferrer">OPEN / DOWNLOAD AUDIO ↗</a></div></section>';
 const $=s=>host.querySelector(s);
 let disposed=false,configured=false,busy=false,checking=false,controller=null,job=null,seq=0,finished=false;
 const status=(s,isError=false)=>{if(disposed)return;const e=$('[data-sfx-status]');e.textContent=s;e.dataset.error=String(isError)};
 const store=()=>{try{if(job)session()?.setItem(JOB_KEY,JSON.stringify(job));else session()?.removeItem(JOB_KEY)}catch{}};
 function buttons(){
  $('[data-sfx-generate]').disabled=busy||checking||Boolean(job);
  $('[data-sfx-resume]').hidden=!job||busy||checking||finished;
  $('[data-sfx-stop]').hidden=!checking;
  $('[data-sfx-new]').hidden=!job||busy||checking;
  $('[data-sfx-job]').textContent=job?'JOB SAVED':'NO JOB';
 }
 async function gateway(action,body,signal){
  const token=$('[data-sfx-token]').value.trim();
  if(!token)throw Error('Enter PRIVATE PULSE ACCESS TOKEN.');
  const r=await fetch('/api/pulse-sound-generator',{method:'POST',headers:{
    'Content-Type':'application/json','x-pulse-owner-token':token},
    body:JSON.stringify({action,...body}),signal,cache:'no-store'});
  const v=await r.json().catch(()=>({error:'INVALID_PROVIDER_RESPONSE'}));
  if(!r.ok)throw Error(ERR[v.error]||'MusicGPT request failed ('+(v.error||r.status)+').');
  return v;
 }
 const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(Object.assign(Error('Stopped'),{name:'AbortError'}));
  const abort=()=>{clearTimeout(t);reject(Object.assign(Error('Stopped'),{name:'AbortError'}))};
  const t=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms);
  signal.addEventListener('abort',abort,{once:true});
 });
 async function check(){
  if(!job||checking||disposed)return;
  const current=++seq,ac=new AbortController();controller=ac;checking=true;buttons();
  try{
   for(let i=0;i<45;i++){
    if(disposed||current!==seq||ac.signal.aborted)return;
    status('Generating sound · checking result '+(i+1)+'/45. You may stop checking without canceling the paid job.');
    const result=await gateway('result',{conversionId:job.id},ac.signal);
    if(disposed||current!==seq||ac.signal.aborted)return;
    if(result.status==='failed')throw Error(result.message||'MusicGPT sound generation failed.');
    if(result.status==='complete'){
     const playback=url(result.audioUrl);
     if(!playback)throw Error('MusicGPT returned no secure audio download.');
     $('[data-sfx-player]').src=playback;
     $('[data-sfx-link]').href=playback;
     $('[data-sfx-output]').hidden=false;
     finished=true;
     status('Sound ready. Play it here or open the download link.');
     return;
    }
    if(i<44)await wait(10000,ac.signal);
   }
   status('Still processing. Use CHECK RESULT to continue without spending credits again.');
  }catch(e){if(!disposed&&current===seq&&e.name!=='AbortError')status(e.message||'Sound generation status is unavailable.',true)}
  finally{if(controller===ac){controller=null;checking=false;buttons();}}
 }
 $('[data-sfx-form]').addEventListener('submit',async e=>{
  e.preventDefault();if(disposed||busy||job||checking)return;
  if(!configured){status('Sound Generator is not configured for this Preview.',true);return;}
  const prompt=$('[data-sfx-prompt]').value.trim(),length=Number($('[data-sfx-length]').value);
  if(prompt.length<4||prompt.length>600){status(ERR.INVALID_PROMPT,true);return;}
  if(!Number.isInteger(length)||length<5||length>60){status(ERR.INVALID_AUDIO_LENGTH,true);return;}
  if(!$('[data-sfx-token]').value.trim()){status('Enter PRIVATE PULSE ACCESS TOKEN.',true);return;}
  if(!$('[data-sfx-consent]').checked){status(ERR.CREDIT_CONSENT_REQUIRED,true);return;}
  const ac=new AbortController();controller=ac;busy=true;buttons();
  status('Submitting ONE paid sound generation. Please do not repeat the request after a timeout.');
  try{
   const r=await gateway('generate',{prompt,audioLength:length,
    generateAlbumCover:$('[data-sfx-cover]').checked,consent:true},ac.signal);
   if(!ID.test(r.conversionId||''))throw Error(ERR.MISSING_CONVERSION_ID);
   if(disposed||ac.signal.aborted)return;
   job={id:r.conversionId,created:Date.now()};store();buttons();
   status('Sound queued'+(r.creditEstimate!=null?' · estimated '+r.creditEstimate+' credits':'')+'. Checking output.');
  }catch(e){if(!disposed&&e.name!=='AbortError')status(e.message||'Could not start sound generation.',true)}
  finally{if(controller===ac){controller=null;busy=false;buttons();}}
  if(job&&!disposed)void check();
 });
 $('[data-sfx-stop]').onclick=()=>{
  seq++;controller?.abort();controller=null;checking=false;buttons();
  status('Checking stopped. The original paid task remains with MusicGPT. Resume without re-generating.');
 };
 $('[data-sfx-resume]').onclick=()=>void check();
 $('[data-sfx-new]').onclick=()=>{
  if(busy||checking)return;
  job=null;finished=false;store();
  $('[data-sfx-output]').hidden=true;$('[data-sfx-player]').removeAttribute('src');
  buttons();status('Ready for another paid generation.');
 };
 try{
  const value=session()?.getItem(JOB_KEY),saved=value?JSON.parse(value):null;
  if(saved&&ID.test(saved.id||'')&&Number.isFinite(saved.created)&&Date.now()-saved.created<7*86400000){
   job={id:saved.id,created:saved.created};
   status('Previous job found. Enter the owner token and press CHECK RESULT to resume without new credits.');
  }
 }catch{}
 buttons();
 void(async()=>{
  try{
   const res=await fetch('/api/pulse-sound-generator',{cache:'no-store'}),v=await res.json();
   if(disposed)return;
   configured=res.ok&&v.configured===true;
   $('[data-sfx-config]').textContent=configured?'SOUND GENERATOR READY':'API NOT CONFIGURED';
   if(!configured)status('Configure the server-only MusicGPT Sound Generator key before testing.',true);
  }catch{if(!disposed)$('[data-sfx-config]').textContent='API STATUS UNAVAILABLE';}
 })();
 return()=>{disposed=true;seq++;controller?.abort();$('[data-sfx-token]').value='';};
}
