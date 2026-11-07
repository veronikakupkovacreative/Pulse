import {workspace} from '../modules/workspace.mjs';
import {gridLines} from './beat-grid.mjs';
const $ = selector => document.querySelector(selector);
const ui = Object.fromEntries(['file-input','drop-zone','upload-empty','processing','track-content','result-panel','result-empty','result-controls','result-note','result-status','bpm-number','error','live-status'].map(id=>[id,$('#'+id)]));
const state = {file:null,selfLoading:false,generation:0,busy:false,fullResult:null,selection:null,analyzedRange:null,channelIndex:0,selectionBusy:false,selectionWorker:null,selectMode:false,worker:null,cancelWorker:null,buffer:null,result:null,bpm:0,factor:1,context:null,source:null,playing:false,starting:false,offset:0,startedAt:0,raf:0,metroTimer:null,metroNext:0,metroBeat:0,metroNodes:new Set(),beatTimers:new Set()};
const messages = {
  TOO_SHORT:'Track too short. Use at least 6 seconds.',
  SILENCE:'Silence or weak audio. Try a track with a clear beat.',
  NO_RHYTHM:'No steady beat detected. Try another section or Tap Tempo.',
  DECODE:'Cannot decode audio. Try WAV, MP3 or MP4 with AAC audio.',
  TIMEOUT:'Analysis timed out. Try a shorter track.'
};
const timeLabel = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const bpmLabel = value => value==null?'—':Number.isInteger(value)?String(value):value.toFixed(1).replace('.',',');
function announce(text) { ui['live-status'].textContent=text; }
function showError(message) { ui.error.textContent=message; ui.error.hidden=false; }
let toastTimer;
function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2500); }
function setBusy(busy) {
  state.busy=busy;ui.processing.hidden=!busy;ui['upload-empty'].hidden=busy||!!state.buffer;ui['track-content'].hidden=busy||!state.buffer;
  $('#try-demo').disabled=busy;ui['drop-zone'].setAttribute('aria-busy',String(busy));
  ui['result-status'].replaceChildren(document.createTextNode(busy?'ANALYZING':'AWAITING TRACK'),document.createElement('i'));
}
function stopPlayback() {
  if(workspace.playing)workspace.stop();
  state.playing=false;cancelAnimationFrame(state.raf);
  $('#play-track use').setAttribute('href','#play');
  $('#play-track').setAttribute('aria-label','Play track');
}

function reset() {
  state.generation++;state.selectionWorker?.terminate();state.selectionWorker=null;state.cancelWorker?.();state.cancelWorker=null;state.worker?.terminate();state.worker=null;stopPlayback();stopMetronome();state.file=null;state.buffer=null;state.result=null;state.fullResult=null;state.selection=null;state.analyzedRange=null;state.channelIndex=0;state.selectMode=false;state.selectionBusy=false;window.dispatchEvent(new Event('pulse:bpm-track-ready'));state.offset=0;state.bpm=0;state.factor=1;state.starting=false;
  $('#tempo-circle').hidden=false;ui['result-panel'].classList.remove('has-result');ui['result-empty'].hidden=false;ui['result-controls'].hidden=true;ui['result-note'].hidden=true;ui.error.hidden=true;ui['bpm-number'].textContent='—';ui['bpm-number'].classList.remove('decimal');$('#song-results').hidden=true;$('#selection-tools').hidden=true;$('#select-range').setAttribute('aria-pressed','false');$('#analyzer-waveform').classList.remove('is-selecting');$('#analysis-scope').hidden=true;ui['file-input'].value='';setBusy(false);
}
// Analyze the already decoded shared workspace buffer, never decode a second full track.
// Audio is reduced to 22.05kHz in yielding chunks to keep UI responsive.
async function analysisSamples(buffer,from=0,to=buffer.duration,generation=state.generation) {
  const rate=Math.min(22050,buffer.sampleRate),ratio=buffer.sampleRate/rate;
  const start=Math.max(0,Math.floor(from*buffer.sampleRate)),end=Math.min(buffer.length,Math.ceil(to*buffer.sampleRate));
  const count=Math.max(0,Math.floor((end-start)/ratio)),mono=new Float32Array(count);
  let channelIndex=0,strongest=-1;
  for(let c=0;c<buffer.numberOfChannels;c++){
    const samples=buffer.getChannelData(c);let energy=0;
    for(let i=start;i<end;i+=2048)energy+=samples[i]*samples[i];
    if(energy>strongest){strongest=energy;channelIndex=c;}
  }
  const data=buffer.getChannelData(channelIndex);
  for(let base=0;base<count;base+=32768){
    if(generation!==state.generation)throw Error('CANCELLED');
    const limit=Math.min(count,base+32768);
    for(let i=base;i<limit;i++){
      const first=start+Math.floor(i*ratio),last=Math.min(end,Math.max(first+1,start+Math.floor((i+1)*ratio)));
      let value=0;
      for(let j=first;j<last;j++)value+=data[j];
      mono[i]=value/Math.max(1,last-first);
    }
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {samples:mono,sampleRate:rate};
}
function analyzeWorker(samples,sampleRate,asSelection=false) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./analysis-worker.mjs',import.meta.url),{type:'module'});
    if(asSelection)state.selectionWorker=worker;else state.worker=worker;
    let finished=false;
    const done=(error,result)=>{
      if(finished)return;finished=true;clearTimeout(timeout);
      worker.terminate();
      if(asSelection&&state.selectionWorker===worker)state.selectionWorker=null;
      if(!asSelection&&state.worker===worker){state.worker=null;state.cancelWorker=null;}
      if(error)reject(error);else resolve(result);
    };
    const timeout=setTimeout(()=>done(new Error('TIMEOUT')),65000);
    if(!asSelection)state.cancelWorker=()=>done(new Error('CANCELLED'));
    worker.onmessage=({data})=>data.error?done(new Error(data.error)):done(null,data.result);
    worker.onerror=()=>done(new Error('Analysis worker failed. Please retry.'));
    worker.postMessage({samples,sampleRate},[samples.buffer]);
  });
}
async function processFile(file,{reuse=false}={}){
  if(!file)return;
  ui.error.hidden=true;
  if(!/\.(wav|mp3|mp4|m4a|aac)$/i.test(file.name)){showError('Unsupported format. Use WAV, MP3, M4A, AAC or MP4.');return;}
  if(file.size>100*1024*1024){showError('File exceeds 100 MB. Choose a smaller file.');return;}
  if(file.size===0){showError('Empty file. Try another.');return;}
  reset();
  const generation=state.generation;
  setBusy(true);
  announce('Loading and analyzing your song.');
  $('#progress-detail').textContent=reuse?'Preparing shared audio…':'Loading audio…';
  try {
    if(!reuse) {
      state.selfLoading=true;
      try{await workspace.load(file);}finally{state.selfLoading=false;}
    }
    if(generation!==state.generation)return;
    const buffer=workspace.buffer;
    if(!buffer)throw Error('Audio is not loaded.');
    if(buffer.duration>1200)throw Error('Track exceeds 20 minutes.');
    if(buffer.duration<6)throw Error('TOO_SHORT');
    $('#progress-detail').textContent='Analyzing rhythm, key and tuning…';
    const {samples,sampleRate}=await analysisSamples(buffer,0,buffer.duration,generation);
    if(generation!==state.generation)return;
    const result=await analyzeWorker(samples,sampleRate);
    if(generation!==state.generation)return;
    state.file=workspace.originalFile||file;
    state.buffer=buffer;state.result=result;state.fullResult=result;
    state.selection={from:0,to:buffer.duration};state.channelIndex=0;
    state.bpm=result.bpm;state.factor=1;
    setBusy(false);renderResult(state.file);initializeRange();publishRhythm();
    announce('Song analysis completed. Tempo '+bpmLabel(result.bpm)+' BPM. Key '+(result.key?.primary?.display||'not detected')+'.');
  } catch(error) {
    if(generation!==state.generation)return;
    setBusy(false);
    showError(messages[error.message]||error.message);
    announce('Analysis could not be completed.');
  }
}
function publishRhythm(){
  if(!state.buffer||!state.result?.bpm||!Number.isFinite(state.bpm))return;
  const offset=state.result.beatOffset??0;
  const markers=gridLines(state.buffer.duration,state.bpm,offset,5000);
  workspace.setMarkers(markers);
  document.dispatchEvent(new CustomEvent('pulse:tempo',{detail:{bpm:state.bpm,offset,meter:4}}));
}

function renderResult(file) {
  $('#track-name').textContent=file.name;$('#track-name').title=file.name;
  $('#track-type').textContent=file.name.split('.').pop().toUpperCase();
  $('#track-meta').textContent=`${timeLabel(state.buffer.duration)} · ${(file.size/1024/1024).toLocaleString('en-US',{maximumFractionDigits:1})} MB · ${state.buffer.numberOfChannels===1?'Mono':'Stereo'}`;
  $('#total-time').textContent=timeLabel(state.buffer.duration);$('#current-time').textContent='0:00';$('#seek').max=state.buffer.duration;$('#seek').value=0;
  ui['result-panel'].classList.add('has-result');ui['result-empty'].hidden=true;ui['result-controls'].hidden=false;ui['result-note'].hidden=false;
  renderSongMetrics();
}
function renderSongMetrics(){
  const confidence={high:'STRONG BEAT',medium:'ESTIMATED BPM',low:'LOW CONFIDENCE',unavailable:'NO STEADY BEAT'}[state.result.confidence];
  ui['result-status'].replaceChildren(document.createTextNode(confidence),document.createElement('i'));
  ui['result-note'].textContent=state.result.bpm==null?'No steady tempo found. Harmony analysis may still be available.':state.result.confidence==='low'?'Low confidence. Verify with Tap Tempo.':'Half-time or double-time? Use ÷2 or ×2.';
  const key=state.result.key?.primary;
  $('#song-key').textContent=key?key.name+' '+(key.mode==='minor'?'Minor':'Major'):'Not detected';
  $('#song-camelot').textContent=key?.camelot??'—';
  $('#song-key-confidence').textContent=state.result.key?({higher:'HIGHER',moderate:'MODERATE',low:'LOW'})[state.result.key.confidence]:'UNAVAILABLE';
  $('#song-tuning').textContent=state.result.tuning?state.result.tuning.hz.toFixed(1)+' Hz':'Not detected';
  $('#song-analysis-note').textContent='Estimates only. Tempo, tonal center and tuning can be ambiguous in complex audio.';
  $('#song-results').hidden=false;
  $('#analysis-scope').hidden=false;
  $('#analysis-scope').textContent=state.result===state.fullResult?'FULL TRACK':'SELECTED RANGE';
  $('#tempo-circle').hidden=state.result.bpm==null;
  updateTempo();drawWaveform();
}
function updateTempo() {
  ui['bpm-number'].textContent=bpmLabel(state.bpm);ui['bpm-number'].classList.toggle('decimal',state.bpm!=null&&!Number.isInteger(state.bpm));
  $('#reset-tempo').hidden=state.result.bpm==null||Math.abs(state.bpm-state.result.bpm)<.01;
  $('#half-tempo').disabled=state.result.bpm==null||state.bpm/2<20;$('#double-tempo').disabled=state.result.bpm==null||state.bpm*2>400;$('#copy-bpm').disabled=state.result.bpm==null;$('#metronome').disabled=state.result.bpm==null;
}
function changeTempo(multiplier) {
  if(!state.result||state.result.bpm==null)return;const wasRunning=!!state.metroTimer;stopMetronome();state.factor=multiplier?state.factor*multiplier:1;state.bpm=Math.round(state.result.bpm*state.factor*10)/10;updateTempo();publishRhythm();drawWaveform();if(wasRunning)startMetronome();announce(`Tempo ${bpmLabel(state.bpm)} BPM.`);
}
function drawWaveform() {
  if(!state.result)return;
  const canvas=$('#waveform'),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const peaks=(state.fullResult??state.result).waveform,bar=rect.width/peaks.length;
  const progress=Number($('#seek').value)/state.buffer.duration;
  for(let i=0;i<peaks.length;i++){const h=Math.max(3,Math.pow(peaks[i],.6)*rect.height*.83);ctx.fillStyle=i/peaks.length<=progress?'#ff2b20':'#85857e';ctx.fillRect(i*bar,(rect.height-h)/2,Math.max(1,bar*.6),h);}
  const grid=state.result.bpm!=null?gridLines(state.buffer.duration,state.bpm,state.result.beatOffset??0,5000):[];
  const visibleSpacing=state.result.bpm?rect.width*60/state.result.bpm/state.buffer.duration:0;
  const stride=Math.max(1,Math.ceil(7/Math.max(visibleSpacing,0.01)));
  ctx.strokeStyle='#ffffff50';ctx.lineWidth=1;
  for(let i=0;i<grid.length;i+=stride){if(state.analyzedRange&&(grid[i]<state.analyzedRange.from||grid[i]>state.analyzedRange.to))continue;const x=grid[i]/state.buffer.duration*rect.width;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,rect.height);ctx.stroke();}
  if(state.selection&&(state.selection.from>.01||state.selection.to<state.buffer.duration-.01)){
    const from=state.selection.from/state.buffer.duration*rect.width;
    const to=state.selection.to/state.buffer.duration*rect.width;
    ctx.fillStyle='#ff000030';ctx.fillRect(from,0,to-from,rect.height);
    ctx.strokeStyle='#ff0000';ctx.beginPath();ctx.moveTo(from,0);ctx.lineTo(from,rect.height);ctx.moveTo(to,0);ctx.lineTo(to,rect.height);ctx.stroke();
  }
  ctx.fillStyle='#f5f4f0';ctx.fillRect(progress*rect.width-1,0,1,rect.height);
}
async function getAudioContext() {
  const context=await workspace.ensureContext();
  state.context=context;
  return context;
}
function currentPosition(){return workspace.buffer===state.buffer?workspace.position:0;}
function animatePlayback(){
  if(!workspace.playing){state.playing=false;$('#play-track use').setAttribute('href','#play');$('#play-track').setAttribute('aria-label','Play track');drawWaveform();return;}
  state.playing=true;
  const position=currentPosition();
  $('#current-time').textContent=timeLabel(position);
  $('#seek').value=position;
  $('#seek').setAttribute('aria-valuetext',timeLabel(position)+' of '+timeLabel(state.buffer.duration));
  drawWaveform();
  state.raf=requestAnimationFrame(animatePlayback);
}
async function play(){
  if(!state.buffer||state.starting||workspace.buffer!==state.buffer)return;
  state.starting=true;
  try{
    await workspace.togglePlay();
    state.playing=workspace.playing;
    $('#play-track use').setAttribute('href',state.playing?'#pause':'#play');
    $('#play-track').setAttribute('aria-label',state.playing?'Pause track':'Play track');
    cancelAnimationFrame(state.raf);
    if(state.playing)animatePlayback();
    else{$('#current-time').textContent=timeLabel(workspace.position);drawWaveform();}
  }catch{toast('Playback failed. Try again.');}
  finally{state.starting=false;}
}
async function startMetronome() {
  if(!state.bpm)return;const generation=state.generation;
  try {await getAudioContext();}catch{toast('Audio could not start.');return;}
  if(generation!==state.generation||state.metroTimer)return;
  state.metroNext=state.context.currentTime+.05;state.metroBeat=0;$('#metronome').setAttribute('aria-pressed','true');
  function schedule() {
    while(state.metroNext<state.context.currentTime+.1){
      const when=state.metroNext,index=state.metroBeat%4;const oscillator=state.context.createOscillator(),gain=state.context.createGain();
      oscillator.frequency.value=index===0?1300:950;gain.gain.setValueAtTime(.12,when);gain.gain.exponentialRampToValueAtTime(.001,when+.04);oscillator.connect(gain).connect(state.context.destination);oscillator.start(when);oscillator.stop(when+.05);state.metroNodes.add(oscillator);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();state.metroNodes.delete(oscillator);};
      const timer=setTimeout(()=>{state.beatTimers.delete(timer);document.querySelectorAll('.beat-dots i').forEach((dot,i)=>dot.classList.toggle('on',i===index));},Math.max(0,(when-state.context.currentTime)*1000));state.beatTimers.add(timer);state.metroNext+=60/state.bpm;state.metroBeat++;
    }
  }
  state.metroTimer=setInterval(schedule,25);schedule();
}
function stopMetronome() {
  clearInterval(state.metroTimer);state.metroTimer=null;state.beatTimers.forEach(clearTimeout);state.beatTimers.clear();state.metroNodes.forEach(node=>{try{node.stop();}catch{}});state.metroNodes.clear();$('#metronome').setAttribute('aria-pressed','false');document.querySelectorAll('.beat-dots i').forEach(dot=>dot.classList.remove('on'));
}
async function copy(value) {
  try {
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(String(value));
    else {const input=document.createElement('textarea');input.value=String(value);input.style.cssText='position:fixed;opacity:0;pointer-events:none';const parent=document.querySelector('dialog[open]')||document.body;parent.append(input);input.select();const success=document.execCommand('copy');input.remove();if(!success)throw new Error('COPY');}
    toast(`${bpmLabel(Number(value))} BPM copied.`);
  }catch{toast('Copy failed. Select and copy BPM manually.');}
}
$('#choose-file').onclick=$('#replace-file').onclick=()=>ui['file-input'].click();
ui['file-input'].onchange=event=>processFile(event.target.files[0]);
$('#remove-file').onclick=()=>{workspace.clear();reset();announce('File removed.');$('#choose-file').focus();};
$('#cancel-analysis').onclick=()=>{reset();announce('Analysis canceled.');$('#choose-file').focus();};
let dragDepth=0;
window.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
window.addEventListener('drop',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
ui['drop-zone'].addEventListener('dragenter',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();dragDepth++;if(!state.busy)ui['drop-zone'].classList.add('is-dragging');}});
ui['drop-zone'].addEventListener('dragleave',()=>{dragDepth--;if(dragDepth<=0){dragDepth=0;ui['drop-zone'].classList.remove('is-dragging');}});
ui['drop-zone'].addEventListener('drop',event=>{event.preventDefault();dragDepth=0;ui['drop-zone'].classList.remove('is-dragging');if(event.dataTransfer.files.length>1){showError('Upload one track at a time.');return;}processFile(event.dataTransfer.files[0]);});
$('#play-track').onclick=play;
$('#seek').addEventListener('input',()=>{
  if(!state.buffer||workspace.buffer!==state.buffer)return;
  workspace.seek(Number($('#seek').value));
  $('#current-time').textContent=timeLabel(workspace.position);
  drawWaveform();
});

function initializeRange(){
  const duration=state.buffer.duration;
  $('#selection-tools').hidden=false;
  for(const id of ['selection-start','selection-end']){$('#'+id).max=duration;$('#'+id).step=.1;}
  $('#selection-start').value=0;$('#selection-end').value=duration;
  state.selection={from:0,to:duration};updateRange();
}
function updateRange(){
  if(!state.buffer||!state.selection)return;
  $('#selection-start-label').textContent=timeLabel(state.selection.from);
  $('#selection-end-label').textContent=timeLabel(state.selection.to);
  const length=state.selection.to-state.selection.from;
  $('#analyze-selection').disabled=state.selectionBusy||length<6;
  $('#analyze-full').disabled=state.selectionBusy;
  $('#selection-status').textContent=state.selectionBusy?'Analyzing selected audio…':length<6?'Select at least 6 seconds.':'Range '+timeLabel(state.selection.from)+'–'+timeLabel(state.selection.to)+' · '+Math.round(length)+' seconds';
  drawWaveform();
}
function setSelection(from,to){
  if(!state.buffer)return;
  const duration=state.buffer.duration;
  const a=Math.min(duration,Math.max(0,Math.min(from,to)));
  const b=Math.min(duration,Math.max(0,Math.max(from,to)));
  state.selection={from:a,to:b};
  $('#selection-start').value=a;$('#selection-end').value=b;
  updateRange();
}
$('#selection-start').oninput=()=>setSelection(Number($('#selection-start').value),state.selection.to);
$('#selection-end').oninput=()=>setSelection(state.selection.from,Number($('#selection-end').value));
$('#select-range').onclick=()=>{
  state.selectMode=!state.selectMode;
  $('#select-range').setAttribute('aria-pressed',String(state.selectMode));
  $('#analyzer-waveform').classList.toggle('is-selecting',state.selectMode);
};
let selectionPointer=null;
const selectionWrap=$('#analyzer-waveform');
function pointerTime(event){
  const rect=selectionWrap.getBoundingClientRect();
  return Math.min(state.buffer.duration,Math.max(0,(event.clientX-rect.left)/rect.width*state.buffer.duration));
}
selectionWrap.addEventListener('pointerdown',event=>{
  if(!state.selectMode||!state.buffer||state.selectionBusy||event.button!==0)return;
  event.preventDefault();
  const start=pointerTime(event);
  selectionPointer={id:event.pointerId,start};
  selectionWrap.setPointerCapture(event.pointerId);
  setSelection(start,start);
});
selectionWrap.addEventListener('pointermove',event=>{
  if(selectionPointer?.id!==event.pointerId||!state.buffer)return;
  setSelection(selectionPointer.start,pointerTime(event));
});
for(const name of ['pointerup','pointercancel'])selectionWrap.addEventListener(name,event=>{
  if(selectionPointer?.id!==event.pointerId)return;
  if(name==='pointerup'&&state.buffer)setSelection(selectionPointer.start,pointerTime(event));
  selectionPointer=null;
});
$('#analyze-selection').onclick=async()=>{
  if(!state.buffer||!state.selection||state.selectionBusy)return;
  const {from,to}=state.selection;
  if(to-from<6){toast('Select at least 6 seconds.');return;}
  const generation=state.generation;state.selectionBusy=true;updateRange();
  try{
    const {samples,sampleRate}=await analysisSamples(state.buffer,from,to,generation);
    if(generation!==state.generation)return;
    const result=await analyzeWorker(samples,sampleRate,true);
    if(generation!==state.generation)return;
    state.result={...result,beatOffset:result.beatOffset==null?null:result.beatOffset+from};
    state.analyzedRange={from,to};
    state.bpm=state.result.bpm;state.factor=1;stopMetronome();
    renderSongMetrics();publishRhythm();announce('Selected range analysis completed.');
  }catch(error){
    if(generation===state.generation){toast(messages[error.message]||error.message);announce('Selection analysis failed.');}
  }finally{if(generation===state.generation){state.selectionBusy=false;updateRange();}}
};

$('#analyze-full').onclick=()=>{
  if(!state.fullResult)return;
  state.result=state.fullResult;state.analyzedRange=null;state.bpm=state.result.bpm;state.factor=1;stopMetronome();renderSongMetrics();publishRhythm();announce('Showing full track analysis.');
};
$('#song-export-json').onclick=()=>{if(!state.result||!state.file)return;const {key,tuning,diagnostics,bpm,confidence}=state.result;const report={schema:'pulse.song-analysis.v2',range:state.analyzedRange,filename:state.file.name,bytes:state.file.size,durationSeconds:state.buffer.duration,channels:state.buffer.numberOfChannels,sampleRate:state.buffer.sampleRate,rhythm:{bpm,confidence,estimatedBeatOffsetSeconds:state.result.beatOffset??null},harmony:{key:key?.primary??null,confidence:key?.confidence??'unavailable',alternatives:key?.alternatives??[]},tuning,diagnostics};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=(state.file.name.replace(/\.[^/.]+$/,'')||'song')+'_analysis.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#half-tempo').onclick=()=>changeTempo(.5);$('#double-tempo').onclick=()=>changeTempo(2);$('#reset-tempo').onclick=()=>changeTempo(0);$('#copy-bpm').onclick=()=>copy(state.bpm);$('#metronome').onclick=()=>state.metroTimer?stopMetronome():startMetronome();
new ResizeObserver(()=>drawWaveform()).observe($('#waveform'));
for(const [button,dialog] of [['open-tap','tap-dialog']]){const trigger=$('#'+button);if(trigger)trigger.onclick=()=>{stopMetronome();$('#'+dialog).showModal();};}
document.querySelectorAll('#analyzer [data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('#analyzer dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
let taps=[],tapBpm=null,tapVisualTimer;
function resetTaps(){taps=[];tapBpm=null;$('#tap-value').textContent='TAP';$('#tap-hint').textContent='Tap the beat';$('#tap-count').textContent='0 taps';$('#tap-copy').hidden=true;}
function tap() {
  const now=performance.now();if(taps.length&&now-taps.at(-1)>2500)resetTaps();if(taps.length&&now-taps.at(-1)<100)return;taps.push(now);if(taps.length>16)taps.shift();
  $('#tap-count').textContent=`${taps.length} ${'taps'}`;$('#tap-hint').textContent=taps.length<4?`${4-taps.length}×`:'BPM · YOUR TEMPO';
  if(taps.length>=4){const intervals=taps.slice(1).map((value,i)=>value-taps[i]).sort((a,b)=>a-b);const median=intervals[Math.floor(intervals.length/2)];const good=intervals.filter(value=>Math.abs(value-median)<median*.3);tapBpm=Math.round(60000/(good.reduce((a,b)=>a+b,0)/good.length)*10)/10;$('#tap-value').textContent=bpmLabel(tapBpm);$('#tap-copy').hidden=false;}
  $('#tap-pad').classList.add('pressed');clearTimeout(tapVisualTimer);tapVisualTimer=setTimeout(()=>$('#tap-pad').classList.remove('pressed'),90);
}
$('#tap-pad').onclick=tap;$('#tap-reset').onclick=resetTaps;$('#tap-copy').onclick=()=>tapBpm&&copy(tapBpm);
$('#tap-dialog').addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();tap();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMetronome();if(state.playing){state.offset=currentPosition();stopPlayback();}}});
window.addEventListener('pagehide',()=>{reset();state.context?.close();});
// A local, original 120 BPM groove exercises the same WAV decoding and analysis path.
function makeDemo() {
  const sr=22050,seconds=20,data=new Float32Array(sr*seconds);let seed=237;
  const noise=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1;};
  for(let beat=0;beat<40;beat++){
    const start=Math.round(beat*.5*sr);
    for(let j=0;j<sr*.22&&start+j<data.length;j++){const t=j/sr;data[start+j]+=.75*Math.sin(2*Math.PI*(48*t+1.5*(1-Math.exp(-t*35))))*Math.exp(-t*24);if(beat%2===1)data[start+j]+=.27*noise()*Math.exp(-t*32);}
    for(let half=0;half<2;half++){const off=start+Math.round(half*.25*sr);for(let j=0;j<sr*.04&&off+j<data.length;j++)data[off+j]+=.07*noise()*Math.exp(-j/sr*100);}
  }
  const wav=new ArrayBuffer(44+data.length*2),view=new DataView(wav);const str=(offset,text)=>[...text].forEach((ch,i)=>view.setUint8(offset+i,ch.charCodeAt(0)));
  str(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,data.length*2,true);for(let i=0;i<data.length;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,data[i]))*32767,true);
  return new File([wav],'Pulse — demo groove.wav',{type:'audio/wav'});
}
$('#try-demo').onclick=()=>processFile(makeDemo());

// Changes made by the existing toolkit are reflected in this top-level analyzer.
// This subscription never re-uploads audio: both sections use the same AudioSession.
workspace.subscribe((_snapshot,reason)=>{
  if(state.selfLoading)return;
  if(reason==='load'||reason==='commit'||reason==='undo'||reason==='redo'){
    if(workspace.buffer&&workspace.originalFile)void processFile(workspace.originalFile,{reuse:true});
  }else if(reason==='clear'){
    reset();
  }else if((reason==='seek'||reason==='transport')&&state.buffer===workspace.buffer){
    $('#seek').value=workspace.position;
    $('#current-time').textContent=timeLabel(workspace.position);
    if(!workspace.playing){state.playing=false;$('#play-track use').setAttribute('href','#play');}
    drawWaveform();
  }
});
if(workspace.buffer&&workspace.originalFile)void processFile(workspace.originalFile,{reuse:true});

