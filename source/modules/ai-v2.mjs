/** PULSE AI STUDIO — eight production modules using the shared audio workspace.
 * Stereo Lab and Vocal Doubler are local DSP; neither performs neural separation.
 */
import {workspace as w} from './workspace.mjs';
import {fromChannels, encodeWav} from './dsp.mjs';
import {mountMasteringTool} from './mastering-ui.mjs';
import {noiseRemoverModule} from './noise-tool.mjs';
import {advancedModules} from './advanced-features.mjs';
import {mountStereoLab,mountVocalDoubler} from './stereo-lab-ui.mjs';
import {analyzeRhythmInWorker} from './rhythm-client.mjs';
import {processVocal} from './vocal-v2-dsp.mjs';
import {mountMusicGPTVoiceChanger} from './musicgpt-voicechanger.mjs';
import {mountLyricsGenerator} from './musicgpt-lyrics.mjs';
import {mountMusicAIV2} from './musicgpt-musicai.mjs';
import {mountWatermarkCleaner} from './watermark-cleaner.mjs';
import {mountStemExtraction} from './musicgpt-extraction.mjs';
import {suggestGainDb,renderMultitrack} from './mix-v2-dsp.mjs';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const heading=(id,title,detail,tag='LOCAL DSP')=>`<div class="tool-view-header"><span>04 / ${id}</span><span>${tag}</span></div><h3>${title}</h3><p class="tool-description">${detail}</p>`;
const button=(id,title)=>`<button class="ai2-action" type="button" data-ai2-action="${id}">${title} <span aria-hidden="true">↗</span></button>`;
const num=(id,label,min,max,value,step=1,unit='')=>`<label class="ai2-field"><span>${esc(label)}${unit?' · '+unit:''}</span><input type="number" data-ai2-param="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
const status=(host,message,isError=false)=>{const el=host.querySelector('[data-ai2-status]');if(el){el.textContent=message;el.dataset.error=String(isError);}};
const read=(host,id,min,max)=>{const v=Number(host.querySelector(`[data-ai2-param="${id}"]`)?.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+id+' value.');return v;};
const safeFile=name=>String(name||'pulse-audio').replace(/[^a-z0-9_-]/gi,'-').slice(0,72);
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function panel(host,html){host.innerHTML=`<section class="tool-view ai2-panel">${html}<p class="ai2-status" role="status" aria-live="polite" data-ai2-status>Upload or select audio in SOURCE AUDIO to begin.</p></section>`;}

function switcher({host},options){
 host.innerHTML='<section class="ai2-switch"><div class="ai2-switch-buttons" role="group" aria-label="Choose an audio subtool"></div><div class="ai2-switch-body"></div></section>';
 const nav=host.querySelector('.ai2-switch-buttons'),body=host.querySelector('.ai2-switch-body');
 let currentCleanup=null,disposed=false;
 const open=(item)=>{
  if(disposed)return;
  if(typeof currentCleanup==='function')currentCleanup();
  currentCleanup=null;body.replaceChildren();
  for(const b of nav.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.view===item.id));
  try{currentCleanup=item.mount({host:body})||null;}
  catch(e){body.textContent='Could not open tool: '+e.message;console.error(e);}
 };
 for(const item of options){
  const b=document.createElement('button');b.type='button';b.textContent=item.label;
  b.dataset.view=item.id;b.setAttribute('aria-pressed','false');
  b.addEventListener('click',()=>open(item));nav.append(b);
 }
 open(options[0]);
 return()=>{disposed=true;if(typeof currentCleanup==='function')currentCleanup();};
}

function mountVocalEnhance({host}){
 panel(host,heading('VOCAL STUDIO','Shape your voice.<br><span>Keep the character.</span>',
  'Local high-pass, tone shaping, sibilance smoothing and stereo-linked compression. This does not perform neural pitch correction.')+
  '<div class="ai2-fields">'+num('highpass','Rumble cut',40,220,80,5,'Hz')+
  num('warmth','Body',-5,5,0,.5,'dB')+num('presence','Presence',-5,6,2,.5,'dB')+
  num('sibilance','Sibilance smoothing',0,8,2,.5,'dB')+
  num('compression','Compression threshold',4,32,16,1,'-dBFS')+
  num('mix','Effect amount',0,100,100,5,'%')+'</div>'+button('render','APPLY VOCAL PROCESSING')+
  '<p class="ai2-note">For Auto-Tune, a true pitch tracking and correction engine is required. No automatic tuning is faked here.</p>');
 const action=host.querySelector('[data-ai2-action]');let disposed=false;
 action.onclick=async()=>{
  action.disabled=true;try{const source=w.ensureAudio();const settings={};
   for(const [key,min,max] of [['highpass',40,220],['warmth',-5,5],['presence',-5,6],['sibilance',0,8],['compression',4,32],['mix',0,100]])
    settings[key]=read(host,key,min,max);
   status(host,'Rendering vocal DSP locally…');await frame();
   const result=await processVocal(source,settings);if(disposed||w.buffer!==source)return;
   w.commit(result,'Vocal processing applied.');status(host,'Vocal processing applied. Use Undo to compare.');
  }catch(e){if(!disposed)status(host,e.message,true)}finally{if(!disposed)action.disabled=false;}
 };
 return()=>{disposed=true};
}

function mountVocals(args){
 return switcher(args,[
  {id:'enhance',label:'VOCAL ENHANCE',mount:mountVocalEnhance},
  {id:'doubler',label:'VOCAL DOUBLER',mount:mountVocalDoubler},
  {id:'ai-voice-changer',label:'AI VOICE CHANGER',mount:mountMusicGPTVoiceChanger}
 ]);
}

function mountBeatLab({host}){
 panel(host,heading('BEAT LAB','Detect the beat.<br><span>Cut the loop.</span>',
  'Estimate tempo and beat positions in a Web Worker. Create a 4-bar selection and export it as WAV. This tool analyzes beats and exports loops without cloud processing.','BEAT ANALYSIS / WORKER')+
  '<div class="ai2-metrics"><div>BPM<strong data-bpm>—</strong></div><div>CONFIDENCE<strong data-confidence>—</strong></div><div>MARKERS<strong data-markers>—</strong></div></div>'+
  '<div class="ai2-actions">'+button('analyze','ANALYZE RHYTHM')+button('loop','SELECT 4 BARS')+button('export','EXPORT SELECTED LOOP')+'</div>'+
  '<p class="ai2-note">Half-time/double-time interpretation remains possible. Check the beat grid against the music.</p>');
 let disposed=false,controller=null,result=null;
 const buttons=[...host.querySelectorAll('[data-ai2-action]')];
 const setBusy=x=>buttons.forEach(b=>b.disabled=x);
 const perform=async(id)=>{
  try{
   if(id==='analyze'){
    const source=w.ensureAudio();controller?.abort();controller=new AbortController();setBusy(true);status(host,'Analyzing rhythm in background…');
    const next=await analyzeRhythmInWorker(source,{signal:controller.signal,onProgress:p=>{if(!disposed)status(host,`Analyzing rhythm · ${p}%`);}});
    if(disposed||w.buffer!==source)return;result=next;w.setMarkers(next.beatTimes);
    host.querySelector('[data-bpm]').textContent=next.bpm.toFixed(2);
    host.querySelector('[data-confidence]').textContent=String(next.confidence).toUpperCase();
    host.querySelector('[data-markers]').textContent=next.beatTimes.length;
    status(host,'Detected '+next.beatTimes.length+' beat markers. Select a loop or revise BPM by ear.');
   }else if(id==='loop'){
    const b=w.ensureAudio();if(!result?.bpm||!result.beatTimes?.length)throw Error('Analyze rhythm first.');
    const start=result.beatTimes.find(t=>t>=w.position-.05)??result.beatTimes[0];
    const seconds=16*60/result.bpm;
    if(start+seconds>b.duration)throw Error('Not enough audio remains for four bars. Move the playhead earlier.');
    w.setSelection(start,start+seconds);status(host,'Selected four 4/4 bars · '+seconds.toFixed(2)+' s.');
   }else if(id==='export'){
    w.save(24,true);status(host,'Exported 24-bit WAV loop.');
   }
  }catch(e){if(!disposed&&e.name!=='AbortError')status(host,e.message,true)}
  finally{if(!disposed)setBusy(false)}
 };
 for(const b of buttons)b.onclick=()=>void perform(b.dataset.ai2Action);
 return()=>{disposed=true;controller?.abort();};
}

function mountMultitrack({host}){
 panel(host,heading('MIX ASSISTANT','Build your mix.<br><span>Control the balance.</span>',
  'Import up to 8 tracks, apply RMS-assisted gain suggestions, adjust pan, and render a stereo mix. This is heuristic/local DSP, not a trained mixing model.')+
  '<div class="ai2-import"><button type="button" data-add-current>+ ADD SOURCE AUDIO</button><label>+ ADD AUDIO FILES<input type="file" data-add-files accept="audio/*,.wav,.mp3,.m4a,.flac" multiple></label></div>'+
  '<div data-mix-tracks class="ai2-tracks" aria-label="Mix tracks"><p class="ai2-note">No tracks added.</p></div>'+
  '<div class="ai2-actions">'+button('balance','SUGGEST LEVEL BALANCE')+button('render','RENDER STEREO MIX')+'</div>'+
  '<p class="ai2-note">RMS matching is a starting point, not a replacement for listening. The rendered mix becomes SOURCE AUDIO, with Undo available.</p>');
 let disposed=false,busy=false,tracks=[];
 const list=host.querySelector('[data-mix-tracks]'),actions=[...host.querySelectorAll('[data-ai2-action]')];
 const setBusy=v=>{busy=v;actions.forEach(x=>x.disabled=v);host.querySelector('[data-add-current]').disabled=v;host.querySelector('[data-add-files]').disabled=v;};
 function repaint(){
  list.replaceChildren();
  if(!tracks.length){const p=document.createElement('p');p.className='ai2-note';p.textContent='No tracks added.';list.append(p);return;}
  tracks.forEach((t,i)=>{
   const row=document.createElement('div');row.className='ai2-track';
   const head=document.createElement('div');head.className='ai2-track-head';
   const label=document.createElement('strong');label.textContent=(i+1)+'. '+t.name;
   const remove=document.createElement('button');remove.textContent='REMOVE';remove.type='button';remove.disabled=busy;
   remove.onclick=()=>{tracks.splice(i,1);repaint()};head.append(label,remove);
   const fields=document.createElement('div');fields.className='ai2-fields';
   for(const [key,title,min,max,step] of [['gainDb','GAIN (dB)',-36,18,.5],['pan','PAN (L/R)',-1,1,.05]]){
    const field=document.createElement('label');field.className='ai2-field';field.textContent=title;
    const input=document.createElement('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(t[key]);
    input.addEventListener('change',()=>{const v=Number(input.value);if(Number.isFinite(v)&&v>=min&&v<=max)t[key]=v;else input.value=String(t[key]);});
    field.append(input);fields.append(field);
   }
   const note=document.createElement('p');note.className='ai2-note';note.textContent=t.buffer.duration.toFixed(1)+' s · '+t.buffer.sampleRate+' Hz';
   row.append(head,fields,note);list.append(row);
  });
 }
 const append=(buffer,name)=>{if(tracks.length>=8)throw Error('Maximum 8 tracks.');
  if(buffer.duration>300)throw Error('The mixer currently supports up to 5-minute tracks.');
  const totalSamples=tracks.reduce((sum,t)=>sum+t.buffer.length*t.buffer.numberOfChannels,0)+buffer.length*buffer.numberOfChannels;
  if(totalSamples*4>192*1024*1024)throw Error('Total decoded tracks exceed the 192 MB memory limit.');
  tracks.push({buffer,name,gainDb:0,pan:0});repaint();};
 host.querySelector('[data-add-current]').onclick=()=>{try{append(w.ensureAudio(),w.displayName||'SOURCE AUDIO');status(host,'Source track added.');}catch(e){status(host,e.message,true)}};
 host.querySelector('[data-add-files]').onchange=async e=>{
  const files=[...e.target.files];setBusy(true);try{
   const ctx=await w.ensureContext();
   for(const file of files){
    if(file.size>50*1024*1024)throw Error(file.name+' exceeds 50 MB.');
    const b=await ctx.decodeAudioData(await file.arrayBuffer());if(disposed)return;
    append(b,file.name);
   }status(host,'Added '+files.length+' audio files.');
  }catch(err){if(!disposed)status(host,err.message,true)}finally{e.target.value='';if(!disposed)setBusy(false)}
 };
 actions.forEach(b=>b.onclick=async()=>{
  const action=b.dataset.ai2Action;if(busy)return;
  try{if(!tracks.length)throw Error('Add an audio track first.');
   if(action==='balance'){
    for(const track of tracks)track.gainDb=suggestGainDb(track.buffer,-20);
    repaint();status(host,'Suggested gains based on RMS. Verify the balance by listening.');return;
   }
   setBusy(true);status(host,'Rendering local stereo mix…');await frame();
   const {buffer,attenuationDb}=renderMultitrack(tracks);
   if(disposed)return;
   if(w.buffer)w.commit(buffer,'Multitrack mix rendered.');
   else await w.load(new File([encodeWav(buffer,16)],'pulse-mix.wav',{type:'audio/wav'}));
   status(host,'Mix rendered · peak protection '+attenuationDb.toFixed(1)+' dB. Use Undo to compare.');
  }catch(e){if(!disposed)status(host,e.message,true)}finally{if(!disposed)setBusy(false)}
 });
 return()=>{disposed=true;tracks=[];};
}

function mountPitchTime({host}){
 panel(host,heading('PITCH & TIME','Change the tempo.<br><span>Keep the pitch.</span>',
  'Independent tempo and pitch processing using resampling and WSOLA overlap alignment. Works offline on clips up to 120 seconds. Strong shifts may introduce artifacts.','LOCAL DSP / WEB WORKER')+
  '<div class="ai2-fields">'+num('tempo','Tempo multiplier',.7,1.5,1,.01,'×')+num('pitch','Pitch transpose',-6,6,0,1,'semitones')+'</div>'+
  '<div class="ai2-actions">'+button('process','PROCESS PITCH & TIME')+button('reset','RESTORE PARAMETER DEFAULTS')+'</div>'+
  '<p class="ai2-note">Tempo 1.25× makes the clip faster while holding pitch. +2 semitones raises the notes while preserving the chosen duration.</p>');
 let disposed=false,worker=null,job=0;
 const actions=[...host.querySelectorAll('[data-ai2-action]')];
 const stop=()=>{worker?.terminate();worker=null;};
 for(const btn of actions)btn.onclick=()=>{
  if(btn.dataset.ai2Action==='reset'){
   host.querySelector('[data-ai2-param="tempo"]').value='1';host.querySelector('[data-ai2-param="pitch"]').value='0';
   status(host,'Parameters reset.');return;
  }
  void (async()=>{
   try{
    const b=w.ensureAudio();if(b.duration>120)throw Error('Select or trim a clip to 120 seconds first.');
    const tempo=read(host,'tempo',.7,1.5),semitones=read(host,'pitch',-6,6);
    if(tempo===1&&semitones===0)throw Error('Change tempo or pitch to begin.');
    actions.forEach(x=>x.disabled=true);status(host,'Rendering independent pitch/tempo transformation…');
    const id=++job,channels=Array.from({length:Math.min(2,b.numberOfChannels)},(_,i)=>b.getChannelData(i).slice());
    stop();worker=new Worker(new URL('./pitch-v2-worker.mjs',import.meta.url),{type:'module'});
    const result=await new Promise((resolve,reject)=>{
     worker.onmessage=e=>{if(e.data.id!==id)return;e.data.ok?resolve(e.data.channels):reject(Error(e.data.error));};
     worker.onerror=e=>reject(Error('Pitch & Time worker failed: '+(e.message||'unknown error')));
     worker.postMessage({id,channels,sampleRate:b.sampleRate,tempo,semitones},channels.map(c=>c.buffer));
    });
    if(disposed||w.buffer!==b)return;
    const output=fromChannels(result,b.sampleRate);w.commit(output,'Pitch & Time processed.');
    status(host,'Processed '+output.duration.toFixed(2)+' s. Use Undo to compare.');
   }catch(e){if(!disposed)status(host,e.message,true)}
   finally{stop();if(!disposed)actions.forEach(x=>x.disabled=false)}
  })();
 };
 return()=>{disposed=true;job++;stop();};
}

function mountSmartFx(args){
 const select=id=>advancedModules.find(x=>x.id===id);
 return switcher(args,[
  {id:'rack',label:'FX RACK',mount:select('rack').mount},
  {id:'sidechain',label:'SIDECHAIN',mount:select('sidechain').mount},
  {id:'modulation',label:'CHORUS / FLANGER',mount:select('modulation').mount}
 ]);
}


export const aiV2Modules=Object.freeze([
 {id:'ai2-mastering',category:'ai',label:'AI Mastering',mount:({host})=>mountMasteringTool({host,mode:'smart'})},
 {id:'ai2-stereo',category:'ai',label:'Stereo Lab',mount:mountStereoLab},
 {id:'ai2-vocals',category:'ai',label:'Vocal Studio',mount:mountVocals},
 {id:'ai2-beat',category:'ai',label:'Beat Lab',mount:mountBeatLab},
 {id:'ai2-mix',category:'ai',label:'Mix Assistant',mount:mountMultitrack},
 {id:'ai2-repair',category:'ai',label:'Audio Repair',mount:noiseRemoverModule.mount},
 {id:'ai2-pitch',category:'ai',label:'Pitch & Time',mount:mountPitchTime},
 {id:'ai2-fx',category:'ai',label:'Smart FX',mount:mountSmartFx},
 {id:'ai2-lyrics',category:'ai',label:'Lyrics Generator',mount:mountLyricsGenerator},
  {id:'ai2-musicai',category:'ai',label:'AI Music Generator',mount:mountMusicAIV2},
  {id:'ai2-watermark',category:'ai',label:'Watermark Cleaner',mount:mountWatermarkCleaner},
  {id:'ai2-extraction',category:'ai',label:'Stem Extraction',mount:mountStemExtraction}
]);
