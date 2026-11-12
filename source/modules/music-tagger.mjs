/** PULSE Music Tagger — local acoustic measurements + local CLAP AI classification. */
import {workspace as w} from './workspace.mjs';
const fmt=(v,suffix='')=>v==null?'—':String(v)+suffix;
export const chooseTaggingWindow=(duration,selection,maxSeconds=60)=>{
 if(!Number.isFinite(duration)||duration<2)throw Error('Select at least two seconds of audio.');
 const valid=Number.isFinite(selection?.start)&&Number.isFinite(selection?.end)&&
  selection.start>=0&&selection.end<=duration&&selection.end-selection.start>=2;
 const from=valid?selection.start:0,to=valid?selection.end:duration;
 const n=Math.min(maxSeconds,to-from),start=from+(to-from-n)/2;
 return {start,end:start+n};
};
const slicePCM=(source,window)=>{
 const start=Math.floor(window.start*source.sampleRate),end=Math.min(source.length,Math.ceil(window.end*source.sampleRate));
 return Array.from({length:Math.min(2,source.numberOfChannels)},(_,c)=>source.getChannelData(c).slice(start,end).buffer);
};
/** Reusable bounded WAV encoder, retained for the separate MusicGPT voice feature. Not used by Music Tagger. */
export function makeCloudTaggingExcerpt(audio,{selection=null,maxSeconds=20}={}){
 if(!audio||!Number.isFinite(audio.sampleRate)||!Number.isInteger(audio.length)||
  audio.length<1||audio.numberOfChannels<1||audio.numberOfChannels>2)
  throw Error('Load a valid mono/stereo track into SOURCE AUDIO.');
 const window=chooseTaggingWindow(audio.duration||audio.length/audio.sampleRate,selection,maxSeconds);
 const seconds=window.end-window.start;
 if(seconds<6)throw Error('A voice excerpt needs at least six seconds. Choose a longer section.');
 const targetRate=Math.min(44100,Math.round(audio.sampleRate));
 const frames=Math.floor(seconds*targetRate),bytes=new Uint8Array(44+frames*2);
 if(bytes.length>2500000)throw Error('Audio excerpt exceeds the short-clip limit.');
 const view=new DataView(bytes.buffer),word=(at,value)=>{
  for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);
 };
 word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,targetRate,true);view.setUint32(28,targetRate*2,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);
 word(36,'data');view.setUint32(40,frames*2,true);
 const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
 for(let i=0;i<frames;i++){
  const position=(window.start+i/targetRate)*audio.sampleRate,lo=Math.min(audio.length-1,Math.floor(position));
  const hi=Math.min(audio.length-1,lo+1),fraction=position-lo;
  let sample=0;
  for(const channel of channels)sample+=(channel[lo]*(1-fraction)+channel[hi]*fraction)/channels.length;
  sample=Math.max(-1,Math.min(1,Number.isFinite(sample)?sample:0));
  view.setInt16(44+i*2,Math.round(sample<0?sample*32768:sample*32767),true);
 }
 let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {file:{name:'pulse-excerpt.wav',base64:btoa(binary)},window};
}
/** Resample shared SOURCE AUDIO to CLAP's required 48 kHz using browser Web Audio. */
export async function makeLocalClapSamples(source,selection=null){
 const window=chooseTaggingWindow(source.duration,selection,10);
 const start=Math.floor(window.start*source.sampleRate),end=Math.min(source.length,Math.ceil(window.end*source.sampleRate));
 const frames=end-start,channels=source.numberOfChannels;
 if(channels<1||channels>2||frames<=0)throw Error('Unsupported audio buffer.');
 const mono=new Float32Array(frames);
 for(let c=0;c<channels;c++){
  const input=source.getChannelData(c);
  for(let i=0;i<frames;i++)mono[i]+=input[start+i]/channels;
 }
 if(source.sampleRate===48000)return {samples:mono,window,sampleRate:48000};
 if(typeof OfflineAudioContext==='undefined')throw Error('This browser does not support local audio resampling.');
 const targetFrames=Math.round(mono.length*48000/source.sampleRate);
 const offline=new OfflineAudioContext(1,targetFrames,48000);
 const input=offline.createBuffer(1,mono.length,source.sampleRate);
 input.copyToChannel(mono,0);
 const playback=offline.createBufferSource();playback.buffer=input;playback.connect(offline.destination);playback.start();
 const result=await offline.startRendering();
 return {samples:result.getChannelData(0).slice(),window,sampleRate:48000};
}
function downloadJson(name,data){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=String(name||'pulse-track').replace(/[^a-z0-9_-]/gi,'-').slice(0,64)+'-music-tags.json';
 a.click();setTimeout(()=>URL.revokeObjectURL(url),12000);
}
function mount({host}){
 host.innerHTML='<section class="tool-view focus-module pulse-tagger">'+
  '<div class="tool-view-header"><span>01 / MUSIC TAGGER</span><span>PRIVATE / LOCAL DSP + ON-DEVICE AI</span></div>'+
  '<h3>Decode the<br><span>sound.</span></h3>'+
  '<p class="tool-description">Measure the sound, then identify likely genres, moods and instruments using CLAP AI locally in your browser. Your audio never leaves this device.</p>'+
  '<div class="pulse-tagger-actions"><button type="button" class="focus-action" data-tag-action="local">MEASURE ACOUSTICS ↗</button>'+
  '<button type="button" class="pulse-tagger-secondary" data-tag-action="download" disabled>EXPORT JSON ↗</button></div>'+
  '<p class="focus-status" data-tag-status role="status" aria-live="polite">Load audio into SOURCE AUDIO. Select a passage on the waveform if you want to focus on a particular section.</p>'+
  '<div data-tag-results hidden aria-label="Acoustic measurements"></div>'+
  '<section class="pulse-tagger-cloud pulse-tagger-local-ai" aria-label="Local AI music classification">'+
  '<div class="pulse-tagger-ai-head"><div><span class="pulse-tagger-kicker">LOCAL AI MUSIC TAGGING</span><h4>Genre. Mood.<br><span>Instruments.</span></h4></div><span class="pulse-tagger-cloud-label">LAION CLAP / ONNX</span></div>'+
  '<p>AI tagging compares a short musical passage against predefined genre, mood and instrument descriptions. No API key, audio upload or external processing is needed.</p>'+
  '<p class="pulse-tagger-warning">First use downloads roughly 160 MB of model weights from Hugging Face to your browser cache. Classification runs on your device and may be slow on older hardware. Scores indicate relative similarity, not calibrated confidence. Instruments are inferred from the full mix; stems are not separated.</p>'+
  '<div class="pulse-tagger-cloud-buttons"><button type="button" class="focus-action" data-tag-action="ai-run">GENERATE AI TAGS ↗</button>'+
  '<button type="button" class="pulse-tagger-secondary" data-tag-action="ai-stop" hidden>STOP ANALYSIS</button></div>'+
  '<div class="pulse-tagger-progress"><strong data-ai-stage>READY</strong><p class="focus-status" data-ai-status role="status" aria-live="polite">Load a track and run local AI tagging.</p></div>'+
  '<div data-ai-results hidden aria-label="Local AI genre mood and instrument predictions"></div>'+
  '<p class="pulse-tagger-model-credit">Model: LAION CLAP (Apache 2.0). Runtime: Transformers.js. Audio is processed in a browser Web Worker.</p>'+
  '</section></section>';
 let disposed=false,revision=0,local=null,ai=null,localWorker=null,aiWorker=null,localBusy=false,aiBusy=false;
 const $=q=>host.querySelector(q);
 const localStatus=(message,error=false)=>{const node=$('[data-tag-status]');node.textContent=message;node.dataset.error=String(error);};
 const aiStatus=(stage,message,error=false)=>{
  $('[data-ai-stage]').textContent=stage.toUpperCase();
  const node=$('[data-ai-status]');node.textContent=message;node.dataset.error=String(error);
 };
 const refresh=()=>{$('[data-tag-action="download"]').disabled=!local&&!ai;};
 const setAiBusy=busy=>{
  aiBusy=busy;$('[data-tag-action="ai-run"]').disabled=busy;
  $('[data-tag-action="ai-stop"]').hidden=!busy;
 };
 const stopAi=()=>{
  revision++;aiWorker?.terminate();aiWorker=null;setAiBusy(false);
 };
 const clear=()=>{
  revision++;localWorker?.terminate();localWorker=null;localBusy=false;
  $('[data-tag-action="local"]').disabled=false;stopAi();local=null;ai=null;refresh();
  $('[data-tag-results]').hidden=true;$('[data-ai-results]').hidden=true;
  aiStatus('ready','Source changed. Start AI analysis again.');
 };
 function renderLocal(result){
  const out=$('[data-tag-results]');out.replaceChildren();out.hidden=false;
  if(result.silent){out.textContent='No audible signal detected.';return;}
  const metrics=[
   ['PEAK',fmt(result.peakDb,' dBFS')],['RMS',fmt(result.rmsDb,' dBFS')],
   ['CREST FACTOR',fmt(result.crestDb,' dB')],['CENTROID',fmt(result.spectralCentroidHz,' Hz')],
   ['TRANSIENTS',fmt(result.transientDensityPerSecond,' / sec')],
   ['STEREO CORRELATION',result.stereoCorrelation===null?'MONO':String(result.stereoCorrelation)]
  ];
  const grid=document.createElement('div');grid.className='pulse-tagger-metrics';
  for(const [name,value] of metrics){
   const cell=document.createElement('div'),label=document.createElement('small'),strong=document.createElement('strong');
   label.textContent=name;strong.textContent=value;cell.append(label,strong);grid.append(cell);
  }
  const bands=document.createElement('div');bands.className='pulse-tagger-bands';
  for(const [name,value] of Object.entries(result.frequencyBalance)){
   const item=document.createElement('div'),label=document.createElement('span'),meter=document.createElement('meter');
   label.textContent=name.toUpperCase()+' / '+value+'%';meter.min=0;meter.max=100;meter.value=value;
   meter.setAttribute('aria-label',name+' frequency energy');item.append(label,meter);bands.append(item);
  }
  const text=document.createElement('p');text.className='pulse-tagger-descriptors';text.textContent=result.descriptors.join(' / ');
  const caveat=document.createElement('p');caveat.className='pulse-tagger-warning';caveat.textContent=result.disclaimer;
  out.append(grid,bands,text,caveat);
 }
 function renderAi(result){
  const out=$('[data-ai-results]');out.replaceChildren();out.hidden=false;
  const title=document.createElement('p');title.className='pulse-tagger-ai-description';
  title.textContent='LOCAL MODEL PREDICTIONS / FULL MIX';
  out.append(title);
  const grid=document.createElement('div');grid.className='pulse-tagger-ai-grid';
  for(const [name,values] of [['GENRES',result.genre],['MOODS',result.moods],['INSTRUMENTS',result.instruments]]){
   const card=document.createElement('section');card.className='pulse-tagger-stem';
   const heading=document.createElement('h5');heading.textContent=name;card.append(heading);
   for(const item of values){
    const row=document.createElement('div');row.className='pulse-tagger-prediction';
    const label=document.createElement('span');label.textContent=item.label;
    const score=document.createElement('span');score.textContent=Math.round(item.score*100)+'%';
    score.setAttribute('aria-label','Relative similarity '+Math.round(item.score*100)+' percent');
    row.append(label,score);card.append(row);
   }
   grid.append(card);
  }
  const caveat=document.createElement('p');caveat.className='pulse-tagger-warning';caveat.textContent=result.disclaimer;
  out.append(grid,caveat);
 }
 async function runLocal(){
  if(disposed||localBusy)return;
  const source=w.ensureAudio(),window=chooseTaggingWindow(source.duration,w.selection),at=revision;
  localBusy=true;$('[data-tag-action="local"]').disabled=true;
  localStatus('Measuring the selected audio locally…');
  const buffers=slicePCM(source,window),id=Math.random().toString(36).slice(2),worker=new Worker('/modules/music-tagger-worker.mjs',{type:'module'});
  localWorker?.terminate();localWorker=worker;
  const finish=()=>{
   worker.terminate();
   if(localWorker===worker){localWorker=null;localBusy=false;if(!disposed)$('[data-tag-action="local"]').disabled=false;}
  };
  worker.onmessage=({data})=>{
   if(data.id!==id)return;
   finish();if(disposed||at!==revision||source!==w.buffer)return;
   if(data.type==='error')return localStatus(data.error,true);
   local={...data.result,window,engine:'local-fft-dsp'};renderLocal(local);refresh();
   localStatus('Local acoustic measurements complete. No audio uploaded.');
  };
  worker.onerror=error=>{finish();if(!disposed&&at===revision)localStatus('Local measurement failed: '+error.message,true);};
  worker.postMessage({type:'analyze',id,channels:buffers,sampleRate:source.sampleRate},buffers);
 }
 async function runAi(){
  if(disposed||aiBusy)return;
  const source=w.ensureAudio(),at=revision;
  setAiBusy(true);aiStatus('preparing','Preparing a 48 kHz mono excerpt locally…');
  try{
   const {samples,window,sampleRate}=await makeLocalClapSamples(source,w.selection);
   if(disposed||at!==revision||source!==w.buffer)return;
   if(!aiWorker)aiWorker=new Worker('/modules/music-tagger-clap-worker.mjs',{type:'module'});
   const worker=aiWorker,id=Math.random().toString(36).slice(2);
   worker.onmessage=({data})=>{
    if(data.id!==id||disposed||revision!==at||worker!==aiWorker)return;
    if(data.type==='progress'){
     aiStatus(data.stage||'processing',data.message||'Running local inference…');return;
    }
    setAiBusy(false);
    if(data.type==='error'){
     aiStatus('error',(data.error||'Local CLAP analysis failed.')+' Check free memory and allow model downloads from Hugging Face.',true);
     return;
    }
    ai={...data.result,window,device:'browser',audioUploaded:false};
    renderAi(ai);refresh();aiStatus('complete','Genre, mood and instrument predictions ready. Audio stayed in your browser.');
   };
   worker.onerror=error=>{
    if(disposed||revision!==at)return;
    worker.terminate();aiWorker=null;setAiBusy(false);
    aiStatus('error','Local model failed to initialize: '+(error.message||'Unknown worker error'),true);
   };
   worker.postMessage({type:'classify',id,samples:samples.buffer,sampleRate},[samples.buffer]);
  }catch(error){
   if(!disposed&&revision===at){setAiBusy(false);aiStatus('error',error.message||'Unable to prepare audio.',true);}
  }
 }
 $('[data-tag-action="local"]').onclick=()=>{void runLocal().catch(error=>{
  localBusy=false;$('[data-tag-action="local"]').disabled=false;localStatus(error.message,true);
 });};
 $('[data-tag-action="ai-run"]').onclick=()=>{void runAi().catch(error=>{
  setAiBusy(false);aiStatus('error',error.message,true);
 });};
 $('[data-tag-action="ai-stop"]').onclick=()=>{stopAi();aiStatus('stopped','Analysis stopped. Re-run to restart model loading.');};
 $('[data-tag-action="download"]').onclick=()=>downloadJson(w.name,{track:w.displayName||w.name,createdAt:new Date().toISOString(),acoustic:local,ai});
 const unsubscribe=w.subscribe((snapshot,reason)=>{
  if(['load','clear','commit','undo','redo'].includes(reason)){
   clear();localStatus('Source changed. Run analysis again.');
  }
 });
 return()=>{disposed=true;unsubscribe();localWorker?.terminate();stopAi();};
}
export const musicTaggerModule=Object.freeze({id:'music-tagger',category:'analyze',label:'Music Tagger',mount});
