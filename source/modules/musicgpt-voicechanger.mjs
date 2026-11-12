/** MusicGPT Voice Changer within PULSE Vocal Studio. Authorized voices only. */
import {workspace as w} from './workspace.mjs';
import {makeCloudTaggingExcerpt} from './music-tagger.mjs';
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(Error('Stopped waiting'),{name:'AbortError'}));
 const abort=()=>{clearTimeout(timer);reject(Object.assign(Error('Stopped waiting'),{name:'AbortError'}));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
 signal?.addEventListener('abort',abort,{once:true});
});
const messages={
 MUSICGPT_NOT_CONFIGURED:'MusicGPT is not configured in this PULSE environment.',
 OWNER_AUTH_REQUIRED:'Incorrect private PULSE owner access token.',
 VOICE_RIGHTS_CONFIRMATION_REQUIRED:'Confirm authorization to process and convert this voice.',
 INSUFFICIENT_CREDITS:'MusicGPT account needs additional credits.',
 MUSICGPT_AUTH_FAILED:'MusicGPT rejected the server-side API key.',
 INVALID_VOICE_ID:'Choose or enter a valid voice ID.',
 AUDIO_SIZE_LIMIT:'Choose a shorter file (2.4 MB maximum).',
 MUSICGPT_TIMEOUT:'MusicGPT request timed out. Retry without generating again.',
 MUSICGPT_CONNECTION_ERROR:'MusicGPT service is temporarily unavailable.'
};
export function mountMusicGPTVoiceChanger({host}){
 host.innerHTML="<section class=\"tool-view ai2-panel pulse-voice-ai\">\n <div class=\"tool-view-header\"><span>04 / VOCAL STUDIO / AI VOICE CHANGER</span><span>MUSICGPT CLOUD PROCESSING</span></div>\n <h3>Change the voice.<br><span>Keep the performance.</span></h3>\n <p class=\"tool-description\">Transform a vocal with MusicGPT VoiceChanger. Work from SOURCE AUDIO or an optional short voice file. Processing occurs on MusicGPT servers with your permission, not locally.</p>\n <div class=\"pulse-voice-fields\">\n  <label>PULSE OWNER ACCESS TOKEN<input data-voice-token type=\"password\" autocomplete=\"off\" placeholder=\"Private PULSE access token\"></label>\n  <div class=\"pulse-voice-picker\"><label>FIND VOICE BY NAME<input data-voice-search type=\"search\" autocomplete=\"off\" placeholder=\"Search voice catalog (optional)\"></label><button type=\"button\" data-voice-action=\"voices\" class=\"pulse-voice-secondary\">FIND VOICES</button></div>\n  <label>AUTHORIZED VOICE ID<input data-voice-id type=\"text\" autocomplete=\"off\" placeholder=\"Choose below or paste a licensed voice ID\"></label>\n  <label>AVAILABLE VOICES<select data-voice-list aria-label=\"Available MusicGPT voices\"><option value=\"\">Search available voices or enter a licensed voice ID</option></select></label>\n  <label>OPTIONAL / OTHER VOCAL FILE<input data-voice-file type=\"file\" accept=\".wav,.mp3,.m4a,.flac,.aac,.ogg,audio/*\"></label>\n  <label>PITCH ADJUSTMENT (-12 TO +12)<input data-voice-pitch type=\"number\" min=\"-12\" max=\"12\" step=\"1\" value=\"0\"></label>\n  <label class=\"pulse-voice-check\"><input data-voice-remove type=\"checkbox\" checked> REMOVE BACKGROUND BEFORE CONVERSION</label>\n </div>\n <label class=\"pulse-voice-consent\"><input data-voice-consent type=\"checkbox\"> I own or am authorized to use the input recording and target voice, and consent to uploading audio to MusicGPT for conversion.</label>\n <div class=\"pulse-voice-actions\"><button class=\"ai2-action\" data-voice-action=\"submit\" type=\"button\">CONVERT VOICE ↗</button><button type=\"button\" class=\"pulse-voice-secondary\" data-voice-action=\"cancel\" hidden>STOP WAITING</button></div>\n <div class=\"pulse-voice-progress\"><strong data-voice-stage>READY</strong><p role=\"status\" aria-live=\"polite\" data-voice-status>Load your vocal, search for an authorized voice, then confirm permission to begin.</p></div>\n <div class=\"pulse-voice-output\" data-voice-output hidden></div>\n <p class=\"ai2-note\">The output is AI-generated. Only use voices you are authorized to reproduce; do not present converted audio as an authentic recording of another person.</p>\n </section>";
 const $=selector=>host.querySelector(selector);
 let dead=false,busy=false,controller=null,conversionId=null,rev=0;
 const status=(message,error=false)=>{const el=$('[data-voice-status]');el.textContent=message;el.dataset.error=String(error);};
 const setStage=stage=>$('[data-voice-stage]').textContent=stage;
 const setBusy=value=>{busy=value;$('[data-voice-action="submit"]').disabled=value;$('[data-voice-action="voices"]').disabled=value;$('[data-voice-action="cancel"]').hidden=!value;};
 const stop=()=>{rev++;controller?.abort();controller=null;setBusy(false);};
 async function gateway(action,payload,signal){
  const token=$('[data-voice-token]').value.trim();
  if(!token)throw Error('Enter the private PULSE owner access token.');
  const response=await fetch('/api/pulse-musicgpt',{method:'POST',
   headers:{'Content-Type':'application/json','x-pulse-owner-token':token},
   body:JSON.stringify({action,...payload}),signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const error=Error(messages[data.error]||('Voice conversion failed: '+String(data.error||response.status)));
   error.code=data.error;throw error;
  }
  return data;
 }
 const resetJob=(message='Voice settings changed. Ready to start a new conversion.')=>{
  stop();conversionId=null;
  const output=$('[data-voice-output]');if(output){output.replaceChildren();output.hidden=true;}
  const submit=$('[data-voice-action="submit"]');if(submit)submit.textContent='CONVERT VOICE ↗';
  setStage('READY');status(message);
 };
 $('[data-voice-list]').onchange=event=>{
  const id=event.target.value;
  if(id&&id!==$('[data-voice-id]').value){$('[data-voice-id]').value=id;resetJob();}
 };
 $('[data-voice-file]').onchange=()=>resetJob('Input changed. Ready for another conversion.');
 $('[data-voice-id]').onchange=()=>resetJob();
 $('[data-voice-pitch]').onchange=()=>resetJob();
 $('[data-voice-remove]').onchange=()=>resetJob();
 $('[data-voice-action="voices"]').onclick=async()=>{
  if(dead||busy)return;
  const at=rev,active=new AbortController();controller=active;setBusy(true);
  setStage('LOADING VOICES');status('Loading the MusicGPT voice catalog…');
  try{
   const query=$('[data-voice-search]').value.trim();
   if(query.length===1)throw Error('Enter at least two characters or leave search blank.');
   const result=await gateway('voices',{query,page:0},active.signal);
   if(dead||rev!==at)return;
   const select=$('[data-voice-list]');select.replaceChildren();
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select an authorized voice';select.append(placeholder);
   for(const voice of result.voices||[]){
    const option=document.createElement('option');option.value=voice.id;option.textContent=voice.label;select.append(option);
   }
   setStage('READY');status((result.voices?.length||0)+' voice models found. Select only a voice you have permission to use.');
  }catch(error){if(!dead&&rev===at){setStage('ACTION REQUIRED');status(error.message,true);}}
  finally{if(controller===active){controller=null;setBusy(false);}}
 };
 async function start(){
  if(dead||busy)return;
  if(!$('[data-voice-consent]').checked)return status('Confirm input and target voice authorization and consent to cloud processing.',true);
  const voiceId=$('[data-voice-id]').value.trim();
  if(!/^[a-zA-Z0-9_-]{3,100}$/.test(voiceId))return status('Select or enter a valid authorized voice ID.',true);
  const pitch=Number($('[data-voice-pitch]').value);
  if(!Number.isInteger(pitch)||pitch<-12||pitch>12)return status('Pitch must be an integer from -12 to +12.',true);
  const at=rev,active=new AbortController();controller=active;setBusy(true);
  let done=false;
  try{
   if(!conversionId){
    let file;
    const alternate=$('[data-voice-file]').files?.[0];
    if(alternate){
     if(alternate.size>2400000)throw Error('Optional voice file exceeds 2.4 MB. Use a shorter clip.');
     const bytes=new Uint8Array(await alternate.arrayBuffer());
     let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
     file={name:alternate.name,base64:btoa(binary)};
    }else{
     file=makeCloudTaggingExcerpt(w.ensureAudio(),{selection:w.selection}).file;
    }
    if(active.signal.aborted||dead||rev!==at)return;
    setStage('UPLOADING');status('Sending an authorized voice excerpt to MusicGPT…');
    const submitted=await gateway('submit',{file,voiceId,pitch,removeBackground:$('[data-voice-remove]').checked,consent:true,authorizedVoice:true},active.signal);
    if(active.signal.aborted||dead||rev!==at)return;
    conversionId=submitted.conversionId;
   }
   for(let attempt=0;attempt<24;attempt++){
    if(active.signal.aborted||dead||rev!==at)return;
    setStage('PROCESSING');status('MusicGPT is converting the voice ('+(attempt+1)+'/24). You can stop waiting and resume.');
    const result=await gateway('result',{conversionId},active.signal);
    if(active.signal.aborted||dead||rev!==at)return;
    if(result.status==='complete'&&result.audioUrl){
     const output=$('[data-voice-output]');output.replaceChildren();
     const label=document.createElement('h4');label.textContent='CONVERTED VOICE';
     const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=result.audioUrl;
     const link=document.createElement('a');link.href=result.audioUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='OPEN / DOWNLOAD AUDIO ↗';
     output.append(label,audio,link);output.hidden=false;
     conversionId=null;setStage('COMPLETE');status('Voice conversion complete. Listen to or download the result in PULSE.');
     done=true;break;
    }
    if(result.status==='failed')throw Error(result.message||'MusicGPT conversion failed.');
    if(attempt<23)await wait(12000,active.signal);
   }
   if(!done){setStage('PENDING');status('MusicGPT is still processing. Press RESUME CONVERSION to continue checking.');}
  }catch(error){
   if(!dead&&rev===at&&error?.name!=='AbortError'){setStage('ACTION REQUIRED');status(error.message||'Voice conversion failed.',true);}
  }finally{
   if(controller===active){controller=null;setBusy(false);}
   const submitButton=$('[data-voice-action="submit"]');if(submitButton&&!dead)submitButton.textContent=done?'CONVERT AGAIN ↗':conversionId?'RESUME CONVERSION ↗':'CONVERT VOICE ↗';
  }
 }
 $('[data-voice-action="submit"]').onclick=()=>{void start();};
 $('[data-voice-action="cancel"]').onclick=()=>{stop();setStage('PAUSED');status('Stopped waiting. The MusicGPT job may still run on the provider; press RESUME CONVERSION to check it.');};
 const unsubscribe=w.subscribe((snapshot,reason)=>{if(['load','clear','commit','undo','redo'].includes(reason)){
  stop();conversionId=null;$('[data-voice-output]').hidden=true;$('[data-voice-action="submit"]').textContent='CONVERT VOICE ↗';
  setStage('READY');status('Source changed. Select a voice and start again.');
 }});
 return()=>{dead=true;unsubscribe();stop();};
}
