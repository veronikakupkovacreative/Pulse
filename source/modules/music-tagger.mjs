import {workspace as w} from './workspace.mjs';
import {runAudialMusicTags,isAbort} from './music-tagger-ai.mjs';
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,suffix='')=>value==null?'—':String(value)+suffix;
const transfer=(source,window)=>{
 const rate=source.sampleRate,start=Math.floor(window.start*rate),end=Math.min(source.length,Math.ceil(window.end*rate));
 return Array.from({length:source.numberOfChannels},(_,i)=>source.getChannelData(i).slice(start,end).buffer);
};
export const chooseTaggingWindow=(duration,selection,maxSeconds=60)=>{
 if(!Number.isFinite(duration)||duration<2)throw Error('At least two seconds of audio required.');
 const selected=Number.isFinite(selection?.start)&&Number.isFinite(selection?.end)&&selection.end-selection.start>=2&&
  selection.start>=0&&selection.end<=duration;
 const from=selected?selection.start:0,to=selected?selection.end:duration;
 const time=Math.min(to-from,maxSeconds);
 const start=from+(to-from-time)/2;
 return {start,end:start+time};
};

/** Encode up to 20 seconds from the already-decoded SOURCE AUDIO into a small
 * mono 44.1 kHz PCM16 WAV. This function does not upload anything.
 * A 20-second excerpt is ~1.76 MB (well under the Audial gateway's 2.5 MB limit).
 */
export function makeCloudTaggingExcerpt(audio,{selection=null,maxSeconds=20}={}){
 if(!audio||!Number.isFinite(audio.sampleRate)||!Number.isInteger(audio.length)||
  audio.length<1||audio.numberOfChannels<1||audio.numberOfChannels>2)
  throw Error('Load a valid mono/stereo track into SOURCE AUDIO.');
 const window=chooseTaggingWindow(audio.duration||audio.length/audio.sampleRate,selection,maxSeconds);
 const seconds=window.end-window.start;
 if(seconds<6)throw Error('Cloud tagging needs at least six seconds. Choose a longer section.');
 const targetRate=Math.min(44100,Math.round(audio.sampleRate));
 const frames=Math.floor(seconds*targetRate),bytes=new Uint8Array(44+frames*2);
 if(bytes.length>2500000)throw Error('Cloud excerpt exceeds the upload size limit.');
 const view=new DataView(bytes.buffer);
 const word=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);};
 word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,targetRate,true);view.setUint32(28,targetRate*2,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);
 word(36,'data');view.setUint32(40,frames*2,true);
 const channels=Array.from({length:audio.numberOfChannels},(_,index)=>audio.getChannelData(index));
 for(let i=0;i<frames;i++){
  const position=(window.start+i/targetRate)*audio.sampleRate,lo=Math.min(audio.length-1,Math.floor(position));
  const hi=Math.min(audio.length-1,lo+1),fraction=position-lo;
  let sample=0;
  for(const channel of channels)sample+=(channel[lo]*(1-fraction)+channel[hi]*fraction)/channels.length;
  sample=Math.max(-1,Math.min(1,Number.isFinite(sample)?sample:0));
  view.setInt16(44+i*2,Math.round(sample<0?sample*32768:sample*32767),true);
 }
 let base64='';
 for(let i=0;i<bytes.length;i+=8192)base64+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {file:{name:'pulse-excerpt.wav',base64:btoa(base64)},window};
}

function saveJson(name,data){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name.replace(/[^a-z0-9_-]/gi,'-').slice(0,60)+'-music-tags.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
}
function mountMusicTagger({host}){
 host.innerHTML='<section class="tool-view focus-module pulse-tagger">'+
 '<div class="tool-view-header"><span>02 / MUSIC TAGGER</span><span>LOCAL DSP + OPTIONAL AI TAGS</span></div>'+
 '<h3>Describe the<br><span>sound.</span></h3>'+
 '<p class="tool-description">Analyze tonal balance, dynamics, transient activity and stereo content locally. Actual genre, mood, and instrument tags require a trained model; optional Audial cloud tagging is separate.</p>'+
 '<div class="pulse-tagger-actions"><button type="button" class="focus-action" data-tag-action="local">ANALYZE LOCALLY <span aria-hidden="true">↗</span></button>'+
 '<button type="button" class="pulse-tagger-secondary" data-tag-action="download" disabled>EXPORT JSON ↗</button></div>'+
 '<p class="focus-status" role="status" aria-live="polite" data-tag-status>Load an audio track in SOURCE AUDIO. Shift-drag the waveform to analyze a selected passage (up to 60 seconds).</p>'+
 '<div data-tag-results aria-label="Measured acoustic descriptors" hidden></div>'+
 '<section class="pulse-tagger-cloud" aria-label="AI genre mood and instrument tagging">'+
 '<div class="pulse-tagger-ai-head"><div><span class="pulse-tagger-kicker">AI MUSIC TAGGING</span><h4>Genre. Mood.<br><span>Instruments.</span></h4></div><span class="pulse-tagger-cloud-label">AUDIAL API / CLOUD MODEL</span></div>'+
 '<p>Identify genres, moods and instruments for the whole mix, drums, bass, melody and vocals. Everything appears here in PULSE, without visiting the Audial website. One action runs the full workflow.</p>'+
 '<p class="pulse-tagger-warning">Unlike local acoustic measurements, AI tagging sends a short audio excerpt (up to 20 seconds) to Audial servers. Explicit consent is required. You may choose an optional short file instead.</p>'+
 '<div class="pulse-tagger-cloud-fields"><label>PULSE OWNER ACCESS TOKEN<input type="password" data-tag-token autocomplete="off" placeholder="Private PULSE access token"></label>'+
 '<label>OPTIONAL / DIFFERENT SHORT AUDIO FILE<input type="file" accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,audio/*" data-tag-file></label></div>'+
 '<label class="pulse-tagger-consent"><input type="checkbox" data-tag-consent> I authorize PULSE to send a short audio excerpt to Audial for AI tagging.</label>'+
 '<div class="pulse-tagger-cloud-buttons"><button type="button" class="focus-action" data-tag-action="cloud-run">GENERATE AI TAGS <span aria-hidden="true">↗</span></button>'+
 '<button type="button" class="pulse-tagger-secondary" data-tag-action="cloud-cancel" hidden>STOP WAITING</button></div>'+
 '<div class="pulse-tagger-progress"><span data-cloud-stage>READY</span><p class="focus-status" data-cloud-status role="status" aria-live="polite">Load a track, confirm cloud consent and start AI tagging.</p></div>'+
 '<div data-cloud-results aria-label="AI genre mood and instrument results" hidden></div></section></section>';
 let dead=false,worker=null,local=null,remote=null,busy=false,revision=0,cloudOrigin=null,cloudBusy=false,cloudController=null,cloudResume=null;
 const $=(q)=>host.querySelector(q),status=(text,error=false)=>{const el=$('[data-tag-status]');el.textContent=text;el.dataset.error=String(error);};
 const cloudStatus=(text,error=false)=>{const el=$('[data-cloud-status]');el.textContent=text;el.dataset.error=String(error);};
 const download=$('[data-tag-action="download"]');
 const abort=()=>{worker?.terminate();worker=null;};
 const refreshDownload=()=>{download.disabled=!local&&!remote;};
 const cancelCloud=()=>{
  cloudController?.abort();cloudController=null;cloudBusy=false;
  $('[data-tag-action="cloud-run"]').disabled=false;
  $('[data-tag-action="cloud-cancel"]').hidden=true;
 };
 const clear=()=>{
  revision++;abort();cancelCloud();busy=false;
  $('[data-tag-action="local"]').disabled=false;
  local=null;remote=null;cloudResume=null;cloudOrigin=null;refreshDownload();
  $('[data-tag-results]').hidden=true;$('[data-cloud-results]').hidden=true;
  $('[data-cloud-stage]').textContent='READY';
 };
 function renderLocal(result){
  const out=$('[data-tag-results]');out.replaceChildren();out.hidden=false;
  if(result.silent){out.textContent='No audible signal detected in this section.';return;}
  const values=[
   ['PEAK',fmt(result.peakDb,' dBFS')],['RMS',fmt(result.rmsDb,' dBFS')],
   ['CREST FACTOR',fmt(result.crestDb,' dB')],['SPECTRAL CENTROID',fmt(result.spectralCentroidHz,' Hz')],
   ['TRANSIENT ACTIVITY',fmt(result.transientDensityPerSecond,' / sec')],
   ['STEREO CORRELATION',result.stereoCorrelation===null?'MONO':String(result.stereoCorrelation)]
  ];
  const grid=document.createElement('div');grid.className='pulse-tagger-metrics';
  for(const [label,value] of values){const cell=document.createElement('div');const a=document.createElement('small');a.textContent=label;
   const b=document.createElement('strong');b.textContent=value;cell.append(a,b);grid.append(cell);}
  const d=document.createElement('p');d.className='pulse-tagger-descriptors';d.textContent=result.descriptors.join(' / ');
  const p=document.createElement('p');p.className='pulse-tagger-warning';p.textContent=result.disclaimer;
  const bands=document.createElement('div');bands.className='pulse-tagger-bands';
  for(const [key,value] of Object.entries(result.frequencyBalance)){
   const row=document.createElement('div'),label=document.createElement('span'),bar=document.createElement('meter');
   label.textContent=key.toUpperCase()+' / '+value+'%';bar.min=0;bar.max=100;bar.value=value;bar.setAttribute('aria-label',key+' frequency energy');
   row.append(label,bar);bands.append(row);
  }
  out.append(grid,bands,d,p);
 }
 function renderRemote(tags){
  const out=$('[data-cloud-results]');out.hidden=false;out.replaceChildren();
  const section=(heading,values)=>{
   const el=document.createElement('section');el.className='pulse-tagger-tag-section';
   const label=document.createElement('h5');label.textContent=heading;el.append(label);
   const chips=document.createElement('div');chips.className='pulse-tagger-tag-chips';
   const safe=Array.isArray(values)?values.filter(v=>typeof v==='string'&&v.trim()).slice(0,30):[];
   for(const value of safe){const chip=document.createElement('span');chip.className='pulse-tagger-chip';chip.textContent=value;chips.append(chip);}
   if(!safe.length){const empty=document.createElement('span');empty.textContent='Not detected';empty.className='pulse-tagger-empty';chips.append(empty);}
   el.append(chips);return el;
  };
  out.append(section('GENRES',tags.genre));
  const description=document.createElement('p');description.className='pulse-tagger-ai-description';
  description.textContent=tags.description||'No descriptive summary available.';out.append(description);
  const grid=document.createElement('div');grid.className='pulse-tagger-stem-grid';
  for(const name of ['full','drums','bass','melody','vocals']){
   const details=tags.song_tags?.[name]||{moods:[],instruments:[]};
   const card=document.createElement('article');card.className='pulse-tagger-stem';
   const title=document.createElement('h5');title.textContent=name==='full'?'FULL MIX':name.toUpperCase();card.append(title);
   if(details.silent){const empty=document.createElement('p');empty.textContent='No audible '+name+' detected.';card.append(empty);}
   else{card.append(section('MOODS',details.moods),section('INSTRUMENTS',details.instruments));}
   grid.append(card);
  }
  out.append(grid);
 }
 async function analyze(){
  if(dead||busy)return;
  const source=w.ensureAudio(),selection=w.selection,win=chooseTaggingWindow(source.duration,selection),at=revision;
  busy=true;$('[data-tag-action="local"]').disabled=true;
  status('Measuring the selected '+(win.end-win.start).toFixed(1)+' seconds in an offline Web Worker…');
  const id=Math.random().toString(36).slice(2),buffers=transfer(source,win);
  abort();
  worker=new Worker('/modules/music-tagger-worker.mjs',{type:'module'});
  const active=worker;
  const finish=()=>{const current=worker===active;if(current)worker=null;active.terminate();if(current){busy=false;if(!dead)$('[data-tag-action="local"]').disabled=false;}};
  active.onmessage=({data})=>{
   if(data?.id!==id)return;
   finish();if(dead||revision!==at||w.buffer!==source)return;
   if(data.type==='error'){status(data.error||'Measurement failed.',true);return;}
   local={...data.result,analysisWindow:win,method:'PULSE local FFT DSP'};
   renderLocal(local);refreshDownload();status('Local analysis complete. No audio has been uploaded.');
  };
  active.onerror=(e)=>{finish();if(!dead&&revision===at)status('Local audio Worker failed: '+(e.message||'Unknown error'),true);};
  active.postMessage({type:'analyze',id,channels:buffers,sampleRate:source.sampleRate},buffers);
 }
 const gateway=async(action,payload,token,signal)=>{
  const response=await fetch('/api/pulse-tags',{
   method:'POST',headers:{'Content-Type':'application/json','x-pulse-owner-token':token},
   body:JSON.stringify({action,...payload}),signal
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const code=String(data.error||'AUDIAL_PROVIDER_ERROR');
   const message={
    OWNER_AUTH_REQUIRED:'Incorrect PULSE owner access token.',
    AUDIAL_NOT_CONFIGURED:'AI tagging is not configured on this PULSE deployment.',
    SUBSCRIPTION_REQUIRED:'Audial requires an active subscription or trial access.',
    AUDIAL_AUTH_FAILED:'Audial rejected the configured server-side API key.',
    FILE_TOO_LARGE:'Selected audio exceeds the cloud upload limit.',
    RATE_LIMITED:'The Audial service is temporarily rate limiting requests.',
    STEMS_NOT_READY:'Audial is still preparing stems.',
    AUDIAL_TIMEOUT:'Audial request timed out. You can retry.',
    AUDIAL_CONNECTION_ERROR:'Unable to reach the Audial service.'
   }[code]||'AI tagging failed: '+code;
   const error=new Error(message);error.code=code;throw error;
  }
  return data;
 };
 async function runCloud(){
  if(dead||cloudBusy)return;
  if(!$('[data-tag-consent]').checked)return cloudStatus('Confirm consent to send the short audio excerpt to Audial.',true);
  const token=$('[data-tag-token]').value.trim();
  if(!token)return cloudStatus('Enter your private PULSE owner access token.',true);
  const at=revision,controller=new AbortController();
  cloudController=controller;cloudBusy=true;
  const runButton=$('[data-tag-action="cloud-run"]'),cancelButton=$('[data-tag-action="cloud-cancel"]');
  runButton.disabled=true;cancelButton.hidden=false;
  let file=null;
  try{
   if(!cloudResume){
    const optional=$('[data-tag-file]').files?.[0];
    if(optional){
     if(optional.size>2500000)throw Error('Optional audio file is over the 2.5 MB limit.');
     const bytes=new Uint8Array(await optional.arrayBuffer());
     let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
     file={name:optional.name,base64:btoa(binary)};
     cloudOrigin={kind:'optional-file',name:optional.name};
    }else{
     const source=w.ensureAudio(),excerpt=makeCloudTaggingExcerpt(source,{selection:w.selection});
     file=excerpt.file;cloudOrigin={kind:'source-excerpt',start:excerpt.window.start,end:excerpt.window.end};
    }
   }
   if(dead||revision!==at||controller.signal.aborted)return;
   const result=await runAudialMusicTags({
    file,resume:cloudResume,signal:controller.signal,
    send:(action,payload,signal)=>gateway(action,payload,token,signal),
    onProgress:info=>{
     if(dead||revision!==at||controller.signal.aborted)return;
     if(info.analysisExeId)cloudResume={analysisExeId:info.analysisExeId,tagsRequested:info.tagsRequested};
     $('[data-cloud-stage]').textContent=info.stage.replace(/-/g,' ').toUpperCase();
     cloudStatus(info.description);
    }
   });
   if(dead||revision!==at||controller.signal.aborted)return;
   cloudResume={analysisExeId:result.analysisExeId,tagsRequested:true};
   remote={...result.tags,provider:'Audial',audioInput:cloudOrigin};
   renderRemote(remote);refreshDownload();
   $('[data-cloud-stage]').textContent='COMPLETE';
   cloudStatus('AI tags ready. Everything is displayed in PULSE. Export JSON to save them.');
  }catch(error){
   if(!dead&&revision===at&&!isAbort(error)){
    $('[data-cloud-stage]').textContent='ACTION REQUIRED';
    cloudStatus(error.message||'Unable to complete AI music tagging.',true);
   }
  }finally{
   if(cloudController===controller){
    cloudController=null;cloudBusy=false;runButton.disabled=false;cancelButton.hidden=true;
   }
  }
 }
 $('[data-tag-action="local"]').onclick=()=>{const at=revision;void analyze().catch(e=>{if(dead||revision!==at)return;busy=false;$('[data-tag-action="local"]').disabled=false;status(e.message,true);});};
 download.onclick=()=>saveJson(w.name||'pulse-audio',{track:w.displayName||w.name,createdAt:new Date().toISOString(),acoustic:local,ai:remote});
 $('[data-tag-action="cloud-run"]').onclick=()=>{void runCloud();};
 $('[data-tag-action="cloud-cancel"]').onclick=()=>{cancelCloud();$('[data-cloud-stage]').textContent='PAUSED';cloudStatus('Stopped waiting. Audial may continue processing; click GENERATE AI TAGS to resume without re-uploading.');};
 $('[data-tag-file]').onchange=()=>{cloudResume=null;remote=null;cloudOrigin=null;refreshDownload();$('[data-cloud-results]').hidden=true;cloudStatus('Audio source changed. Ready for new AI tags.');};
 const unsubscribe=w.subscribe((snap,reason)=>{if(['load','clear','commit','undo','redo'].includes(reason)){clear();status('Source changed. Run analysis again.');}});
 return()=>{dead=true;unsubscribe();abort();cancelCloud();};
}
export const musicTaggerModule=Object.freeze({id:'music-tagger',category:'analyze',label:'Music Tagger',mount:mountMusicTagger});