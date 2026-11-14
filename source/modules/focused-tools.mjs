/** PULSE Focused Toolkit: one Song Analyzer and one integrated Audio Editor.
 * Keep the existing shared AudioWorkspace and DSP engines; no duplicate upload store.
 */
import {workspace as w} from './workspace.mjs';
import {editRegion,gainBuffer,fromChannels} from './dsp.mjs';
import {fadeBuffer,resampleBuffer} from './legacy-dsp.mjs';
import {advancedEqualizerModule} from './eq-advanced.mjs';
import {analyzeRhythmInWorker} from './rhythm-client.mjs';
import {analyzeHarmonyInWorker} from './harmony-client.mjs';
import {buildBeatGrid} from './beat-detector.mjs';
import {mountAudoKeyComparison} from './audo-ui.mjs';

const section=(num,name,detail)=>'<div class="tool-view-header"><span>'+num+' / '+name+'</span><span>LOCAL AUDIO PROCESSING</span></div><h3>'+name+'.<br><span>'+detail+'.</span></h3>';
const setText=(host,key,text)=>{const el=host.querySelector('[data-focus="'+key+'"]');if(el)el.textContent=String(text);};
const report=(host,text,error=false)=>{const el=host.querySelector('[data-focus-status]');if(el){el.textContent=text;el.dataset.error=String(error);}};
const num=(host,id,min,max)=>{const el=host.querySelector('[data-focus-input="'+id+'"]');if(!el||el.value.trim()==='')throw Error('Enter '+id+'.');const n=Number(el.value);if(!Number.isFinite(n)||n<min||n>max)throw Error(id+' must be between '+min+' and '+max+'.');return n;};
const button=(id,title)=>'<button type="button" class="focus-action" data-focus-action="'+id+'">'+title+' <span aria-hidden="true">↗</span></button>';

function mountSongAnalyzer({host}){
 host.innerHTML='<section class="tool-view focus-module focus-song focus-song-v3">'+
  '<div class="tool-view-header"><span>01 / SONG ANALYZER</span><span>LOCAL ANALYSIS / V3</span></div>'+
  '<h3>Know your<br><span>track.</span></h3>'+
  '<p class="tool-description">Measure rhythm and harmony together. Tempo candidates are estimates, not guaranteed answers. The beat grid can be corrected manually and chord labels should always be checked by ear.</p>'+
  '<div class="focus-song-summary">'+
  '<div class="focus-song-main"><span class="focus-song-kicker">DETECTED TEMPO</span><strong data-focus="bpm">—</strong><span class="focus-song-unit">BEATS PER MINUTE</span><span class="focus-song-confidence" data-focus="rhythm-confidence">NO ANALYSIS</span></div>'+
  '<div class="focus-song-tonality"><div><span>KEY / ESTIMATE</span><strong data-focus="key">—</strong></div><div><span>CAMELOT</span><strong data-focus="camelot">—</strong></div><div><span>TONAL CONFIDENCE</span><strong data-focus="key-confidence">—</strong></div></div></div>'+
  '<div class="focus-song-panel"><div class="focus-song-panel-top"><span>01 / TEMPO INTERPRETATIONS</span><span data-focus="stability">—</span></div>'+
  '<p>Choose a suggested BPM or use half/double time. This rebuilds the shared waveform grid; it does not change the audio.</p>'+
  '<div class="focus-song-candidates" data-focus-candidates><p class="focus-song-muted">Candidates appear after analysis.</p></div>'+
  '<div class="focus-song-tools"><button type="button" data-focus-tempo="half" disabled>÷ 2</button><button type="button" data-focus-tempo="double" disabled>× 2</button><button type="button" data-focus-tempo="reset" disabled>RESET</button></div>'+
  '<div class="focus-song-grid"><span>BEAT GRID</span><strong data-focus="beats">—</strong><small>ESTIMATED QUARTER NOTES · SYNCED TO SOURCE AUDIO</small></div></div>'+
  '<div class="focus-song-panel focus-song-chord-panel"><div class="focus-song-panel-top"><span>02 / CHORD TIMELINE</span><span>APPROXIMATE MAJ / MIN</span></div>'+
  '<p>Short harmonic snapshots, not a transcription. Uncertain chords are deliberately hidden.</p>'+
  '<div class="focus-chords" data-focus-chords><p class="focus-song-muted">Analyze a musical track to view potential chords.</p></div></div>'+
  '<div class="focus-song-panel audo-key-panel" data-audo-key-panel>'+
   '<div class="focus-song-panel-top"><span>03 / INDEPENDENT KEY & BPM</span><span>CROSS-CHECK</span></div>'+
   '<p>Compare an independent BPM, key and Camelot estimate with the local analysis. Large files use a short excerpt.</p>'+
   '<label class="audo-check"><input type="checkbox" data-audo-key-consent> I agree to send a copy or excerpt to Audo.</label>'+
   '<button type="button" class="focus-action" data-audo-key-run>COMPARE WITH AUDO ↗</button>'+
   '<div class="audo-key-results" data-audo-key-result hidden></div>'+
   '<p class="focus-song-muted" data-audo-key-note aria-live="polite">Independent estimate. The local beat grid is not changed.</p></div>'+
   '<div class="focus-song-actions">'+button('analyze','ANALYZE TRACK')+
  '<button type="button" class="focus-song-link" data-focus-action="copy" disabled>COPY DETECTED BPM <span aria-hidden="true">↗</span></button></div>'+
  '<p class="focus-status" data-focus-status role="status" aria-live="polite">Load audio into SOURCE AUDIO, then analyze. For BPM use at least 6 seconds of clear rhythm.</p>'+
  '</section>';
 let disposed=false,busy=false,controller=null,current=null,selectionBpm=null;
 const cleanupAudo=mountAudoKeyComparison({host});
 const analyzeButton=host.querySelector('[data-focus-action="analyze"]');
 const candidatesHost=host.querySelector('[data-focus-candidates]');
 const controls=[...host.querySelectorAll('[data-focus-tempo]')];
 const status=(message,error=false)=>report(host,message,error);
 const copyButton=host.querySelector('[data-focus-action="copy"]');
 copyButton.onclick=async()=>{
  if(!Number.isFinite(selectionBpm)||selectionBpm<=0)return status('Analyze audio before copying BPM.',true);
  try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(selectionBpm.toFixed(1));
    status('Copied '+selectionBpm.toFixed(1)+' BPM to clipboard.');
  }catch{
    status('Detected tempo: '+selectionBpm.toFixed(1)+' BPM. Clipboard permission is unavailable — copy the number above.');
  }
 };
 function renderGrid(bpm){
  const source=w.buffer;
  if(!source||!current||!Number.isFinite(bpm))return;
  selectionBpm=bpm;
  const beats=buildBeatGrid(bpm,current.offset??0,source.duration);
  w.setMarkers(beats);
  setText(host,'bpm',bpm.toFixed(1));
  setText(host,'beats',beats.length.toLocaleString('en-US')+' MARKERS');
  copyButton.disabled=false;
  controls.forEach(b=>b.disabled=b.dataset.focusTempo==='half'?bpm/2<40:
   b.dataset.focusTempo==='double'?bpm*2>240:Math.abs(bpm-current.bpm)<.015);
  for(const b of candidatesHost.querySelectorAll('[data-candidate]'))b.setAttribute('aria-pressed',
   String(Math.abs(Number(b.dataset.candidate)-bpm)<.015));
 }
 function addCandidate(label,value){
  if(!Number.isFinite(value)||value<40||value>240)return;
  const button=document.createElement('button');
  button.type='button';button.dataset.candidate=value.toFixed(2);
  button.textContent=label+' / '+value.toFixed(1)+' BPM';
  button.setAttribute('aria-pressed',String(Math.abs(value-selectionBpm)<.015));
  button.onclick=()=>{renderGrid(value);status('Beat grid set to '+value.toFixed(1)+' BPM. Confirm by listening to the source.');};
  candidatesHost.append(button);
 }
 controls.forEach(button=>button.onclick=()=>{
  if(!current||!selectionBpm)return;
  const action=button.dataset.focusTempo;
  const next=action==='half'?selectionBpm/2:action==='double'?selectionBpm*2:current.bpm;
  renderGrid(next);
  status('Beat grid updated. This is a metrical interpretation, not an audio time stretch.');
 });
 function clear(){
  current=null;selectionBpm=null;
  for(const k of ['bpm','key','camelot','beats','key-confidence','stability'])setText(host,k,'—');
  setText(host,'rhythm-confidence','NO ANALYSIS');
  candidatesHost.replaceChildren();
  candidatesHost.textContent='Candidates appear after analysis.';
  const chords=host.querySelector('[data-focus-chords]');
  chords.replaceChildren();chords.textContent='Run analysis to see possible chords.';
  controls.forEach(b=>b.disabled=true);
  copyButton.disabled=true;
 }
 analyzeButton.onclick=async()=>{
  if(busy||disposed)return;
  const ctrl=new AbortController();controller=ctrl;
  busy=true;analyzeButton.disabled=true;
  try{
   const source=w.ensureAudio();
   status('Measuring BPM and harmonic content in background workers…');
   const [rhythm,harmony]=await Promise.allSettled([
    analyzeRhythmInWorker(source,{signal:ctrl.signal,onProgress:p=>status('RHYTHM ANALYSIS '+p+'%')}),
    analyzeHarmonyInWorker(source,{signal:ctrl.signal})
   ]);
   if(disposed||ctrl.signal.aborted||w.buffer!==source)return;
   if(rhythm.status==='fulfilled'&&Number.isFinite(rhythm.value.bpm)){
    const result=rhythm.value;current=result;selectionBpm=result.bpm;
    setText(host,'rhythm-confidence',(result.confidence??'low').toUpperCase()+' CONFIDENCE');
    setText(host,'stability',result.tempoStability==null?'STABILITY UNKNOWN':'STABILITY '+result.tempoStability+'% EST.');
    candidatesHost.replaceChildren();
    addCandidate('PRIMARY',result.bpm);
    const seen=[result.bpm];
    for(const item of result.alternatives||[]){
     if(!Number.isFinite(item.bpm)||seen.some(x=>Math.abs(x-item.bpm)<1))continue;
     seen.push(item.bpm);addCandidate('ALTERNATIVE',item.bpm);
    }
    addCandidate('HALF-TIME',result.bpm/2);
    addCandidate('DOUBLE-TIME',result.bpm*2);
    renderGrid(result.bpm);
   }else{
    current=null;selectionBpm=null;
    setText(host,'bpm','—');setText(host,'beats','—');
    setText(host,'rhythm-confidence','UNRELIABLE');
    candidatesHost.textContent='No reliable tempo found. Try a section with a distinct drum pattern.';
    controls.forEach(b=>b.disabled=true);
    copyButton.disabled=true;
   }
   const chordBox=host.querySelector('[data-focus-chords]');
   chordBox.replaceChildren();
   if(harmony.status==='fulfilled'){
    const result=harmony.value;
    if(result.key){
     setText(host,'key',result.key.name);
     setText(host,'camelot',result.key.camelot);
     setText(host,'key-confidence',result.key.confidence.toUpperCase());
    }else{
     setText(host,'key','UNDETERMINED');
     setText(host,'camelot','—');
     setText(host,'key-confidence','LOW');
    }
    if(result.chords.length){
     for(const chord of result.chords){
      const row=document.createElement('div');row.className='focus-chord-row';
      const time=document.createElement('span');
      time.textContent=Math.floor(chord.time/60)+':'+String(Math.floor(chord.time%60)).padStart(2,'0');
      const name=document.createElement('strong');name.textContent=chord.label;
      const note=document.createElement('span');note.textContent='ESTIMATE';
      row.append(time,name,note);chordBox.append(row);
     }
    }else chordBox.textContent='No stable major/minor triads detected. The mix may be too percussive or harmonically complex.';
   }else{
    setText(host,'key','—');setText(host,'camelot','—');setText(host,'key-confidence','—');
    chordBox.textContent='Harmonic analysis unavailable: '+(harmony.reason?.message||'processing error');
   }
   const rhythmOK=Boolean(current),harmonyOK=harmony.status==='fulfilled'&&Boolean(harmony.value.key);
   status(rhythmOK||harmonyOK
    ?'Analysis complete. Tempo and chord estimates may be ambiguous; check the beat grid by listening.'
    :'No dependable rhythm or harmony detected. Try a different musical section.',!rhythmOK&&!harmonyOK);
  }catch(error){if(!disposed&&error?.name!=='AbortError')status(error.message||'Song analysis failed.',true);}
  finally{busy=false;if(!disposed)analyzeButton.disabled=false;if(controller===ctrl)controller=null;}
 };
 const unsub=w.subscribe((snapshot,reason)=>{
  if(!['load','clear','commit','undo','redo'].includes(reason))return;
  if(busy)controller?.abort();
  clear();
 });
 return()=>{disposed=true;controller?.abort();unsub();cleanupAudo();};
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
 ['gain','GAIN'],['eq','EQ']
];
function mountAudioEditor({host}){
 host.innerHTML='<section class="tool-view focus-module focus-editor">'+
  section('03','Audio Editor','Shape your sound')+
  '<p class="tool-description">Trim, cut, merge, fade, gain and EQ your current SOURCE AUDIO. Use Shift + drag on the waveform for selection. Undo/Redo remains available.</p>'+
  '<div class="focus-editor-modes" role="group" aria-label="Audio editing tools">'+
   editModes.map(([id,label],i)=>'<button type="button" data-edit-mode="'+id+'" aria-pressed="'+(i===0?'true':'false')+'">'+label+'</button>').join('')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="trim"><p>Keep the selected range and discard the rest of the track.</p>'+button('trim','TRIM TO SELECTION')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="cut" hidden><p>Remove the selected range and join the remaining audio.</p>'+button('cut','CUT SELECTION')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="merge" hidden><p>Append up to seven more tracks. The editor matches sample rates and mono/stereo layout, and adds short boundary fades.</p><label class="focus-input">ADD AUDIO FILES<input type="file" data-edit-files accept="audio/*,.wav,.mp3,.m4a,.flac" multiple></label>'+button('merge','MERGE INTO WORKSPACE')+'</div>'+
  '<div class="focus-edit-view" data-edit-view="fade" hidden><p>Apply a smooth fade at the start or end of the full track.</p><label class="focus-input">DIRECTION<select data-edit-direction><option value="in">Fade in</option><option value="out">Fade out</option></select></label><label class="focus-input">DURATION (SECONDS)<input type="number" data-focus-input="fade" min="0.01" max="60" step="0.1" value="2"></label>'+button('fade','APPLY FADE')+'</div>'+
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
