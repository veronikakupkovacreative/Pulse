import {workspace} from './workspace.mjs';
import {studioStore} from './studio-store.mjs';
import {createDemoTrack} from './demo-track.mjs';

const $=id=>document.getElementById(id);
const clock=seconds=>{const n=Math.max(0,Number(seconds)||0);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0');};
let initialized=false;
export function initializeStudioShell(){
 if(initialized)return;initialized=true;
 const importButton=$('studio-import'),demoButton=$('studio-load-demo'),exportButton=$('studio-export'),input=$('audio-file');
 const status=$('studio-session-status');
 if(!importButton||!demoButton||!exportButton||!input)return;
 const setStatus=text=>{if(status)status.textContent=text;};
 const snapshot=()=>{
  const state=studioStore.getState(),track=state.track;
  $('studio-project-name').textContent=track?.name||'UNTITLED PROJECT';
  $('studio-source-indicator').classList.toggle('has-audio',!!track);
  $('studio-source-indicator').innerHTML=track?'<i aria-hidden="true"></i> TRACK READY':'<i aria-hidden="true"></i> NO AUDIO LOADED';
  $('studio-track-format').textContent=track?`${(track.sampleRate/1000).toFixed(1)} kHz · ${track.channels===2?'STEREO':track.channels+' CH'}`:'—';
  $('studio-track-readout').textContent=track?`${track.name} · ${clock(track.duration)}`:'NO TRACK SELECTED';
  $('studio-rhythm-readout').textContent=track?`${state.beatMarkers.length} MARKERS`:'—';
  $('studio-selection-readout').textContent=state.selection?`${clock(state.selection.start)} – ${clock(state.selection.end)}`:'NO SELECTION';
  exportButton.disabled=!track;
 };
 studioStore.subscribe(snapshot);snapshot();
 importButton.addEventListener('click',()=>input.click());
 exportButton.addEventListener('click',()=>{
  if(!workspace.buffer)return;
  try{workspace.save(24,false);setStatus('24-BIT WAV EXPORTED');}
  catch(error){setStatus('EXPORT ERROR · '+error.message);}
 });
 demoButton.addEventListener('click',async()=>{
  if(demoButton.disabled)return;
  demoButton.disabled=true;const old=demoButton.textContent;demoButton.textContent='GENERATING…';
  try{
   await workspace.ensureContext();
   const file=await createDemoTrack({onProgress:progress=>setStatus('GENERATING DEMO · '+progress+'%')});
   await workspace.load(file);
   setStatus('DEMO LOADED · 120 BPM · GENERATED LOCALLY');
  }catch(error){setStatus('DEMO ERROR · '+(error?.message||String(error)));}
  finally{demoButton.textContent=old;demoButton.disabled=false;}
 });
 document.addEventListener('keydown',event=>{
  if(event.code!=='Space'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||!workspace.buffer)return;
  const t=event.target;if(t?.closest?.('button,a,input,textarea,select,summary,[contenteditable="true"],[role="textbox"]'))return;
  event.preventDefault();void workspace.togglePlay().catch(error=>setStatus(error.message));
 });
 // Every selected tool uses the active buffer and the same transport.
 document.addEventListener('pulse:workspace-change',event=>{
  if(event.detail?.reason==='load')setStatus('TRACK LOADED · READY');
  if(event.detail?.reason==='clear')setStatus('WORKSPACE CLEARED');
 });
}
