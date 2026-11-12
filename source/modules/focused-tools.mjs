/** PULSE Focused Toolkit: one Song Analyzer and one integrated Audio Editor.
 * Keep the existing shared AudioWorkspace and DSP engines; no duplicate upload store.
 */
import {workspace as w} from './workspace.mjs';
import {editRegion,reverseBuffer,gainBuffer,fromChannels} from './dsp.mjs';
import {fadeBuffer,resampleBuffer} from './legacy-dsp.mjs';
import {advancedEqualizerModule} from './eq-advanced.mjs';
import {analyzeRhythmInWorker} from './rhythm-client.mjs';
import {analyzeKeyInWorker} from './key-client.mjs';
import {detectKeyAndChords} from './producer-dsp.mjs';

const section=(num,name,detail)=>'<div class="tool-view-header"><span>'+num+' / '+name+'</span><span>LOCAL AUDIO PROCESSING</span></div><h3>'+name+'.<br><span>'+detail+'.</span></h3>';
const setText=(host,key,text)=>{const el=host.querySelector('[data-focus="'+key+'"]');if(el)el.textContent=String(text);};
const report=(host,text,error=false)=>{const el=host.querySelector('[data-focus-status]');if(el){el.textContent=text;el.dataset.error=String(error);}};
const num=(host,id,min,max)=>{const el=host.querySelector('[data-focus-input="'+id+'"]');if(!el||el.value.trim()==='')throw Error('Enter '+id+'.');const n=Number(el.value);if(!Number.isFinite(n)||n<min||n>max)throw Error(id+' must be between '+min+' and '+max+'.');return n;};
const button=(id,title)=>'<button type="button" class="focus-action" data-focus-action="'+id+'">'+title+' <span aria-hidden="true">↗</span></button>';

function mountSongAnalyzer({host}){
 host.innerHTML='<section class="tool-view focus-module focus-song">'+
  section('01','Song Analyzer','Understand the track')+
  '<p class="tool-description">One place for BPM, musical key, Camelot, approximate chords and beat grid markers. Analysis runs locally. For detailed waveform inspection, use the full Song Analyzer above.</p>'+
  '<div class="focus-analysis-metrics" aria-label="Song analysis results">'+
  '<div><small>BPM</small><strong data-focus="bpm">—</strong></div>'+
  '<div><small>KEY</small><strong data-focus="key">—</strong></div>'+
  '<div><small>CAMELOT</small><strong data-focus="camelot">—</strong></div>'+
  '<div><small>BEAT MARKERS</small><strong data-focus="beats">—</strong></div></div>'+
  '<div class="focus-chords"><p class="pulse-detail-label">CHORD TIMELINE / APPROXIMATE</p><div data-focus-chords><p>Run analysis to view estimated major/minor chords.</p></div></div>'+
  '<div class="focus-actions">'+button('analyze','ANALYZE CURRENT TRACK')+button('full','OPEN FULL SONG ANALYZER')+'</div>'+
  '<p class="focus-status" data-focus-status role="status" aria-live="polite">Load audio into SOURCE AUDIO, then analyze.</p></section>';
 let disposed=false,busy=false,controller=null;
 const analyzeButton=host.querySelector('[data-focus-action="analyze"]');
 host.querySelector('[data-focus-action="full"]').onclick=()=>document.getElementById('analyzer')?.scrollIntoView({behavior:'smooth',block:'start'});
 analyzeButton.onclick=async()=>{
  if(busy||disposed)return;
  const ctrl=new AbortController();controller=ctrl;busy=true;analyzeButton.disabled=true;
  try{
   const source=w.ensureAudio();report(host,'Analyzing rhythm and tonality…');
   const [rhythm,key]=await Promise.allSettled([
    analyzeRhythmInWorker(source,{signal:ctrl.signal,onProgress:p=>report(host,'ANALYZING RHYTHM '+p+'%')}),
    analyzeKeyInWorker(source,{signal:ctrl.signal})
   ]);
   if(disposed||ctrl.signal.aborted||w.buffer!==source)return;
   let answered=false;
   if(rhythm.status==='fulfilled'&&Number.isFinite(rhythm.value.bpm)){
    const result=rhythm.value;
    setText(host,'bpm',result.bpm.toFixed(1));
    setText(host,'beats',result.beatTimes?.length??0);
    w.setMarkers(result.beatTimes||[]);answered=true;
   }else{setText(host,'bpm','—');setText(host,'beats','—');}
   if(key.status==='fulfilled'){
    setText(host,'key',key.value.key??'—');
    setText(host,'camelot',key.value.camelot??'—');answered=true;
   }else{setText(host,'key','—');setText(host,'camelot','—');}
   report(host,'Estimating chord timeline…');
   await new Promise(resolve=>setTimeout(resolve,0));
   if(disposed||ctrl.signal.aborted||w.buffer!==source)return;
   const box=host.querySelector('[data-focus-chords]');box.replaceChildren();
   try{
    const harmony=detectKeyAndChords(source);
    for(const chord of harmony.chords.slice(0,60)){
     const line=document.createElement('div');line.className='focus-chord-row';
     const time=document.createElement('span');time.textContent=Number(chord.time).toFixed(1)+' s';
     const name=document.createElement('strong');name.textContent=chord.label;
     const quality=document.createElement('span');quality.textContent=chord.confidence+'% est.';
     line.append(time,name,quality);box.append(line);
    }
    if(!box.children.length)box.textContent='No stable major/minor chords detected.';
    answered=answered||harmony.chords.length>0;
   }catch(e){box.textContent='Chord estimate unavailable: '+e.message;}
   report(host,answered?'Analysis complete. Beat markers are visible on the shared waveform. Verify chords by ear.':'No reliable musical estimate. Try a clearer section.',!answered);
  }catch(error){if(!disposed&&error?.name!=='AbortError')report(host,error.message||'Analysis failed.',true)}
  finally{if(!disposed){busy=false;analyzeButton.disabled=false;}if(controller===ctrl)controller=null;}
 };
 const unsub=w.subscribe((snapshot,reason)=>{
  if(reason!=='load'&&reason!=='clear'&&reason!=='commit'&&reason!=='undo'&&reason!=='redo')return;
  if(busy)controller?.abort();
  for(const k of ['bpm','key','camelot','beats'])setText(host,k,'—');
  const c=host.querySelector('[data-focus-chords]');if(c)c.textContent='Run analysis to view estimated chords.';
 });
 return()=>{disposed=true;controller?.abort();unsub();};
}

/** Concatenate already decoded, equal-rate mono/stereo audio with 5ms joins. */
export function mergePreparedAudio(buffers) {
 if(!Array.isArray(buffers)||buffers.length<2)throw Error('Select at least two audio files.');
 const rate=buffers[0].sampleRate,channels=buffers[0].numberOfChannels;
 if(channels<1||channels>2||buffers.some(b=>b.sampleRate!==rate||b.numberOfChannels!==channels||!b.length))throw Error('Inputs must use matching sample rate and channels.');
 const length=buffers.reduce((n,b)=>n+b.length,0);
 if(length/rate>1200||length*channels*4>240*1024*1024)throw Error('Merged audio exceeds 20 minutes or the workspace memory limit.');
 const fade=Math.max(1,Math.floor(rate*.005));
 const out=Array.from({length:channels},()=>new Float32Array(length));
 let offset=0;
 for(const [index,b] of buffers.entries()){
  for(let c=0;c<channels;c++){
   const src=b.getChannelData(c);out[c].set(src,offset);
   if(index>0)for(let i=0;i<Math.min(fade,src.length);i++)out[c][offset+i]*=i/Math.max(1,fade-1);
   if(index<buffers.length-1)for(let i=0;i<Math.min(fade,src.length);i++)out[c][offset+src.length-1-i]*=i/Math.max(1,fade-1);
  }
  offset+=b.length;
 }
 return fromChannels(out,rate);
}
function matchChannels(buffer,count){
 if(buffer.numberOfChannels===count)return buffer;
 if(count===2&&buffer.numberOfChannels===1){const data=buffer.getChannelData(0);return fromChannels([data.slice(),data.slice()],buffer.sampleRate);}
 if(count===1&&buffer.numberOfChannels===2){const a=buffer.getChannelData(0),b=buffer.getChannelData(1),out=new Float32Array(buffer.length);for(let i=0;i<out.length;i++)out[i]=(a[i]+b[i])*.5;return fromChannels([out],buffer.sampleRate);}
 throw Error('Only mono and stereo merges are supported.');
}
const editModes=[
 ['trim','TRIM'],['cut','CUT'],['merge','MERGE'],['fade','FADE'],
 ['reverse','REVERSE'],['gain','GAIN'],['eq','EQ']
];
function mountAudioEditor({host}){
 host.innerHTML='<section class="tool-view focus-module focus-editor">'+
  section('02','Audio Editor','Shape your sound')+
  '<p class="tool-description">Edit your current SOURCE AUDIO without switching between separate utilities. Use Shift + drag on the waveform for Trim and Cut. Undo/Redo remains available.</p>'+
  '<div class="focus-editor-modes" role="group" aria-label="Audio editing tools">'+
   editModes.map(([id,label],i)=>'<button type="button" data-edit-mode="'+id+'" aria-pressed="'+(i===0?'true':'false')+'">'+label+'</button>').join('')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="trim"><p>Keep the selected range and discard the rest of the track.</p>'+button('trim','TRIM TO SELECTION')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="cut" hidden><p>Remove the selected range and join the remaining audio.</p>'+button('cut','CUT SELECTION')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="merge" hidden><p>Append up to seven more tracks. The editor matches sample rates and mono/stereo layout, and adds short boundary fades.</p><label class="focus-input">ADD AUDIO FILES<input type="file" data-edit-files accept="audio/*,.wav,.mp3,.m4a,.flac" multiple></label>'+button('merge','MERGE INTO WORKSPACE')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="fade" hidden><p>Apply a smooth fade at the start or end of the full track.</p><label class="focus-input">DIRECTION<select data-edit-direction><option value="in">Fade in</option><option value="out">Fade out</option></select></label><label class="focus-input">DURATION (SECONDS)<input type="number" data-focus-input="fade" min="0.01" max="60" step="0.1" value="2"></label>'+button('fade','APPLY FADE')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="reverse" hidden><p>Reverse the full audio track without changing its duration.</p>'+button('reverse','REVERSE TRACK')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="gain" hidden><p>Adjust the overall track gain. Positive values may clip loud audio.</p><label class="focus-input">GAIN (dB)<input type="number" data-focus-input="gain" min="-24" max="24" step="0.5" value="-2"></label>'+button('gain','APPLY GAIN')+'</div>'+
  '<div class="focus-edit-view focus-eq-view" data-edit-view="eq" hidden></div>'+
  '<p class="focus-status" data-focus-status role="status" aria-live="polite">Choose a tool and load audio to begin.</p></section>';
 let disposed=false,busy=false;
 const eqHost=host.querySelector('[data-edit-view="eq"]');
 const cleanupEq=advancedEqualizerModule.mount({host:eqHost});
 function selectMode(mode){
  for(const b of host.querySelectorAll('[data-edit-mode]'))b.setAttribute('aria-pressed',String(b.dataset.editMode===mode));
  for(const p of host.querySelectorAll('[data-edit-view]'))p.hidden=p.dataset.editView!==mode;
  report(host,mode==='eq'?'Choose an EQ preset and apply it in the panel above.':'Ready for '+mode.toUpperCase()+'.');
 }
 host.querySelectorAll('[data-edit-mode]').forEach(b=>b.onclick=()=>selectMode(b.dataset.editMode));
 host.querySelectorAll('[data-focus-action]').forEach(buttonEl=>buttonEl.onclick=async()=>{
  if(busy||disposed)return;
  busy=true;for(const b of host.querySelectorAll('[data-focus-action]'))b.disabled=true;
  const mode=buttonEl.dataset.focusAction;
  try{
   const source=w.ensureAudio();let output=null;
   if(mode==='trim'||mode==='cut'){
    const range=w.selection;if(!range||range.end-range.start<.01)throw Error('Shift + drag over at least 10 ms of the waveform to select audio.');
    output=editRegion(source,range.start,range.end,mode);
   }else if(mode==='reverse')output=reverseBuffer(source);
   else if(mode==='gain')output=gainBuffer(source,num(host,'gain',-24,24));
   else if(mode==='fade')output=fadeBuffer(source,num(host,'fade',.01,60),host.querySelector('[data-edit-direction]').value);
   else if(mode==='merge'){
    const files=[...(host.querySelector('[data-edit-files]').files||[])];
    if(!files.length||files.length>7)throw Error('Select between one and seven additional audio files.');
    if(files.some(f=>f.size>100*1024*1024))throw Error('Each audio file must be under 100 MB.');
    const ctx=await w.ensureContext(),buffers=[source];
    for(const file of files){
     const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
     if(disposed||w.buffer!==source)throw Error('Source audio changed. Retry merge.');
     const resampled=decoded.sampleRate===source.sampleRate?decoded:await resampleBuffer(decoded,source.sampleRate);
     buffers.push(matchChannels(resampled,source.numberOfChannels));
    }
    output=mergePreparedAudio(buffers);
   }
   if(!output)throw Error('No audio generated.');
   if(w.buffer!==source||disposed)throw Error('Source audio changed. Retry the operation.');
   w.commit(output,'Audio Editor: '+mode+' applied.');
   report(host,mode.toUpperCase()+' complete. Use Undo to compare.');
  }catch(e){if(!disposed)report(host,e.message||'Editing failed.',true);}
  finally{busy=false;if(!disposed)for(const b of host.querySelectorAll('[data-focus-action]'))b.disabled=false;}
 });
 selectMode('trim');
 return()=>{disposed=true;cleanupEq?.();};
}
export const songAnalyzerModule=Object.freeze({id:'song-analyzer',category:'analyze',label:'Song Analyzer',mount:mountSongAnalyzer});
export const audioEditorModule=Object.freeze({id:'editor',category:'edit',label:'Audio Editor',mount:mountAudioEditor});
