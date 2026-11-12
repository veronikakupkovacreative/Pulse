import {workspace as w} from './workspace.mjs';
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
 '<details class="pulse-tagger-cloud"><summary>OPTIONAL / AI GENRE, MOOD & INSTRUMENT TAGGING</summary>'+
 '<p>Audial runs an external cloud model and can classify the full mix, drums, bass, melody and vocals. PULSE never uploads audio when you choose local analysis. Cloud preview accepts the original file only, up to 2.5 MB. Audial subscription and owner credentials are required.</p>'+
 '<label>OWNER ACCESS TOKEN <input type="password" data-tag-token autocomplete="off" placeholder="Token configured on your Vercel server"></label>'+
 '<label>SHORT TRACK FILE <input type="file" accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,audio/*" data-tag-file></label>'+
 '<label class="pulse-tagger-consent"><input type="checkbox" data-tag-consent> I agree to send this selected file to Audial servers for music tagging.</label>'+
 '<div class="pulse-tagger-cloud-buttons"><button type="button" data-tag-action="cloud-start">1 / SEND TO AUDIAL</button>'+
 '<button type="button" data-tag-action="cloud-tag" disabled>2 / GENERATE TAGS</button>'+
 '<button type="button" data-tag-action="cloud-result" disabled>3 / FETCH RESULTS</button></div>'+
 '<p class="focus-status" data-cloud-status role="status" aria-live="polite">Cloud mode is optional and disabled until you authorize it.</p>'+
 '<div data-cloud-results hidden></div></details></section>';
 let dead=false,worker=null,local=null,remote=null,busy=false,analysisId=null,revision=0;
 const $=(q)=>host.querySelector(q),status=(text,error=false)=>{const el=$('[data-tag-status]');el.textContent=text;el.dataset.error=String(error);};
 const cloudStatus=(text,error=false)=>{const el=$('[data-cloud-status]');el.textContent=text;el.dataset.error=String(error);};
 const download=$('[data-tag-action="download"]');
 const abort=()=>{worker?.terminate();worker=null;};
 const refreshDownload=()=>{download.disabled=!local&&!remote;};
 const clear=()=>{revision++;abort();busy=false;$('[data-tag-action="local"]').disabled=false;$('[data-tag-action="cloud-start"]').disabled=false;local=null;remote=null;analysisId=null;refreshDownload();$('[data-tag-results]').hidden=true;$('[data-cloud-results]').hidden=true;for(const a of ['cloud-tag','cloud-result'])$('[data-tag-action="'+a+'"]').disabled=true;};
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
  const description=document.createElement('p');description.textContent=tags.description||'No description provided.';
  const genre=document.createElement('p');genre.textContent='GENRES / '+(tags.genre.length?tags.genre.join(' · '):'Not detected');
  out.append(genre,description);
  for(const [part,details] of Object.entries(tags.song_tags)){
   const row=document.createElement('div');row.className='pulse-tagger-part';
   const title=document.createElement('strong');title.textContent=part.toUpperCase();
   const info=document.createElement('span');info.textContent=details.silent?'Silent':
    'MOODS: '+(details.moods.join(', ')||'—')+' / INSTRUMENTS: '+(details.instruments.join(', ')||'—');
   row.append(title,info);out.append(row);
  }
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
 async function send(action){
  if(busy||dead)return;
  const at=revision;
  const consent=$('[data-tag-consent]').checked,token=$('[data-tag-token]').value;
  if(!consent)return cloudStatus('Please confirm explicit Audial upload consent.',true);
  if(!token)return cloudStatus('Enter owner access token.',true);
  const payload={action,consent:true};
  if(action==='start'){
   const file=$('[data-tag-file]').files?.[0];if(!file)return cloudStatus('Choose a short audio file for cloud analysis.',true);
   if(file.size>2500000)return cloudStatus('Cloud preview supports files up to 2.5 MB. Export a compressed short clip first.',true);
   const bytes=new Uint8Array(await file.arrayBuffer());
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   payload.file={name:file.name,base64:btoa(binary)};
   if(dead||revision!==at)return;
  }else{if(!analysisId)return cloudStatus('Request segmentation before fetching tags.',true);payload.analysisExeId=analysisId;}
  busy=true;
  for(const b of host.querySelectorAll('[data-tag-action]'))if(b.dataset.tagAction.startsWith('cloud-'))b.disabled=true;
  cloudStatus(action==='start'?'Uploading the selected short file…':action==='tag'?'Requesting model-generated tags…':'Checking the Audial analysis result…');
  try{
   const response=await fetch('/api/pulse-tags',{method:'POST',headers:{'Content-Type':'application/json','x-pulse-owner-token':token},body:JSON.stringify(payload)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Provider request failed.');
   if(dead||revision!==at)return;
   analysisId=data.analysisExeId||analysisId;
   if(action==='start'){remote=null;cloudStatus('Audial accepted the track. Select GENERATE TAGS. It may take time for stems to become ready.');}
   else if(action==='tag')cloudStatus('Tag request accepted. Select FETCH RESULTS. If still processing, repeat the action later.');
   else if(data.status==='complete'&&data.tags){remote={...data.tags,provider:'Audial'};renderRemote(remote);refreshDownload();cloudStatus('Audial tags received. Genres, moods and instruments are model estimates.');}
   else cloudStatus('Audial is still processing. Select FETCH RESULTS again later.');
  }catch(error){if(!dead&&revision===at)cloudStatus(error.message||'Cloud tagging failed.',true);}
  finally{if(revision===at){busy=false;if(!dead){$('[data-tag-action="cloud-start"]').disabled=false;for(const a of ['cloud-tag','cloud-result'])$('[data-tag-action="'+a+'"]').disabled=!analysisId;}}}
 }
 $('[data-tag-action="local"]').onclick=()=>{const at=revision;void analyze().catch(e=>{if(dead||revision!==at)return;busy=false;$('[data-tag-action="local"]').disabled=false;status(e.message,true);});};
 download.onclick=()=>saveJson(w.name||'pulse-audio',{track:w.displayName||w.name,createdAt:new Date().toISOString(),acoustic:local,ai:remote});
 for(const a of ['start','tag','result'])$('[data-tag-action="cloud-'+a+'"]').onclick=()=>{void send(a);};
 const unsubscribe=w.subscribe((snap,reason)=>{if(['load','clear','commit','undo','redo'].includes(reason)){clear();status('Source changed. Run analysis again.');}});
 return()=>{dead=true;unsubscribe();abort();};
}
export const musicTaggerModule=Object.freeze({id:'music-tagger',category:'analyze',label:'Music Tagger',mount:mountMusicTagger});