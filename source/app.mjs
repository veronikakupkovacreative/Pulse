import {initStudioTools} from './tools.mjs';
import {clampPlayhead,pointerToTime,nudgePlayhead} from './playhead.mjs';
const $ = selector => document.querySelector(selector);
const ui = Object.fromEntries(['file-input','drop-zone','upload-empty','processing','track-content','result-panel','result-empty','result-controls','result-note','result-status','bpm-number','error','live-status'].map(id=>[id,$('#'+id)]));
const state = {file:null,generation:0,busy:false,worker:null,cancelWorker:null,buffer:null,result:null,bpm:0,factor:1,context:null,source:null,playing:false,starting:false,offset:0,startedAt:0,raf:0,metroTimer:null,metroNext:0,metroBeat:0,metroNodes:new Set(),beatTimers:new Set()};
const messages = {
  TOO_SHORT:'Track too short. Use at least 6 seconds.',
  SILENCE:'Silent or weak audio. Try a track with a clear beat.',
  NO_RHYTHM:'No steady beat detected. Try another section or Tap Tempo.',
  DECODE:'Cannot decode audio. Try WAV, MP3 or MP4 with AAC audio.',
  TIMEOUT:'Analysis timed out. Try a shorter track.'
};
const timeLabel = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const bpmLabel = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  if(state.source){state.source.onended=null;try{state.source.stop();}catch{}state.source.disconnect();state.source=null;}
  state.playing=false;cancelAnimationFrame(state.raf);$('#play-track use').setAttribute('href','#play');$('#play-track').setAttribute('aria-label','Play track');
}
function reset() {
  state.generation++;state.cancelWorker?.();state.cancelWorker=null;state.worker?.terminate();state.worker=null;stopPlayback();stopMetronome();state.file=null;state.buffer=null;state.result=null;window.dispatchEvent(new Event('pulse:bpm-track-ready'));state.offset=0;state.bpm=0;state.factor=1;state.starting=false;$('#bpm-override').value='';
  ui['result-panel'].classList.remove('has-result');ui['result-empty'].hidden=false;ui['result-controls'].hidden=true;ui['result-note'].hidden=true;ui.error.hidden=true;ui['bpm-number'].textContent='—';ui['bpm-number'].classList.remove('decimal');ui['file-input'].value='';setBusy(false);
}
async function processFile(file) {
  if(!file||state.busy)return;
  ui.error.hidden=true;
  if(!/\.(wav|mp3|mp4)$/i.test(file.name)){showError('Unsupported format. Use WAV, MP3 or MP4.');return;}
  if(file.size>100*1024*1024){showError('File exceeds 100 MB.');return;}
  if(file.size===0){showError('Empty file. Try another.');return;}
  reset();const generation=state.generation;setBusy(true);announce('Loading audio and detecting tempo.');$('#progress-detail').textContent='Loading audio…';
  try {
    // iOS Safari can reject OfflineAudioContext decoding even for supported files.
    // Prefer an ordinary AudioContext and reuse its buffer for playback.
    const Context=window.AudioContext||window.webkitAudioContext;
    const OfflineContext=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!Context&&!OfflineContext)throw new Error('Audio analysis is not supported in this browser.');
    let buffer;
    try {
      const bytes=await file.arrayBuffer();
      const decoder=Context?(state.context||=new Context()):new OfflineContext(1,1,22050);
      buffer=await decoder.decodeAudioData(bytes.slice(0));
    } catch { throw new Error('DECODE'); }
    if(generation!==state.generation)return;
    if(buffer.duration>1200)throw new Error('Track exceeds 20 minutes.');
    if(buffer.duration<6)throw new Error('TOO_SHORT');
    $('#progress-detail').textContent='Finding the beat…';
    // Use the most energetic channel to avoid phase cancellation in stereo recordings.
    let bestChannel=0,bestEnergy=-1;
    for(let ch=0;ch<buffer.numberOfChannels;ch++) {const data=buffer.getChannelData(ch);let energy=0;for(let i=0;i<data.length;i+=32)energy+=data[i]*data[i];if(energy>bestEnergy){bestEnergy=energy;bestChannel=ch;}}
    const samples=buffer.getChannelData(bestChannel).slice();
    const result=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./analysis-worker.mjs',import.meta.url),{type:'module'});state.worker=worker;
      const timeout=setTimeout(()=>{worker.terminate();reject(new Error('TIMEOUT'));},60000);
      state.cancelWorker=()=>{clearTimeout(timeout);worker.terminate();reject(new Error('CANCELLED'));};
      worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();if(state.worker===worker){state.worker=null;state.cancelWorker=null;}data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=()=>{clearTimeout(timeout);worker.terminate();state.cancelWorker=null;reject(new Error('Analysis failed to start. Refresh and retry.'));};
      worker.postMessage({samples,sampleRate:buffer.sampleRate},[samples.buffer]);
    });
    if(generation!==state.generation)return;
    state.file=file;state.buffer=buffer;state.result=result;window.dispatchEvent(new Event('pulse:bpm-track-ready'));state.bpm=result.bpm;setBusy(false);renderResult(file);announce(`Analysis complete. Estimated tempo: ${bpmLabel(result.bpm)} BPM.`);
  } catch(error) {
    if(generation!==state.generation)return;
    setBusy(false);showError(messages[error.message]||error.message);announce('Analysis could not be completed.');
  }
}
function renderResult(file) {
  $('#track-name').textContent=file.name;$('#track-name').title=file.name;
  $('#track-type').textContent=file.name.split('.').pop().toUpperCase();
  $('#track-meta').textContent=`${timeLabel(state.buffer.duration)} · ${(file.size/1024/1024).toLocaleString('en-US',{maximumFractionDigits:1})} MB · ${state.buffer.numberOfChannels===1?'Mono':'Stereo'}`;
  $('#total-time').textContent=timeLabel(state.buffer.duration);$('#current-time').textContent='0:00';$('#seek').max=state.buffer.duration;$('#seek').value=0;
  ui['result-panel'].classList.add('has-result');ui['result-empty'].hidden=true;ui['result-controls'].hidden=false;ui['result-note'].hidden=false;
  const confidence={high:'STRONG BEAT',medium:'ESTIMATED BPM',low:'LOW CONFIDENCE'}[state.result.confidence];
  ui['result-status'].replaceChildren(document.createTextNode(confidence),document.createElement('i'));
  ui['result-note'].textContent=state.result.confidence==='low'?'Low confidence. Verify with Tap Tempo.':'Tempo is an estimate. Verify by ear or use half/double tempo.';
  if (Number.isFinite(state.result.beatOffsetSeconds)) {
    const offset = state.result.beatOffsetSeconds.toFixed(2);
    const alternatives = (state.result.alternativeBpms||[]).slice(0,2);
    ui['result-note'].textContent += ` · Beat grid offset: ${offset}s${alternatives.length ? ' · Other tempo candidates: '+alternatives.join(' / ')+' BPM' : ''}`;
  }
  updateTempo();drawWaveform();
}
function updateTempo() {
  ui['bpm-number'].textContent=bpmLabel(state.bpm);ui['bpm-number'].classList.toggle('decimal',!Number.isInteger(state.bpm));
  $('#bpm-override').value=String(state.bpm);$('#reset-tempo').hidden=Math.abs(state.bpm-state.result.bpm)<.01;
  $('#half-tempo').disabled=state.bpm/2<20;$('#double-tempo').disabled=state.bpm*2>400;
}
function setTempo(value) {
  if(!state.result)return false;
  const next=Number(String(value).replace(',','.'));
  if(!Number.isFinite(next)||next<20||next>400){
    $('#bpm-override').value=String(state.bpm);toast('Enter 20–400 BPM.');return false;
  }
  const running=!!state.metroTimer;if(running)stopMetronome();
  state.bpm=Math.round(next*10)/10;state.factor=state.bpm/state.result.bpm;
  updateTempo();if(running)void startMetronome();
  announce(`Tempo updated to ${bpmLabel(state.bpm)} BPM.`);return true;
}
function changeTempo(multiplier){
  if(!state.result)return;setTempo(multiplier?state.bpm*multiplier:state.result.bpm);
}
function drawWaveform() {
  if(!state.result)return;
  const canvas=$('#waveform'),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const peaks=state.result.waveform,bar=rect.width/peaks.length;
  const progress=Number($('#seek').value)/state.buffer.duration;
  for(let i=0;i<peaks.length;i++){const h=Math.max(3,Math.pow(peaks[i],.6)*rect.height*.83);ctx.fillStyle=i/peaks.length<=progress?'#ff2b20':'#85857e';ctx.fillRect(i*bar,(rect.height-h)/2,Math.max(1,bar*.6),h);}
  $('#bpm-playhead').style.left=`${Math.max(0,Math.min(100,progress*100))}%`;
}
async function getAudioContext() {
  const Context=window.AudioContext||window.webkitAudioContext;
  state.context||=new Context();if(state.context.state==='suspended')await state.context.resume();return state.context;
}
function currentPosition() {return state.playing?Math.min(state.buffer.duration,state.offset+state.context.currentTime-state.startedAt):state.offset;}
function animatePlayback() {
  if(!state.playing)return;
  const position=currentPosition();$('#current-time').textContent=timeLabel(position);$('#seek').value=position;$('#seek').setAttribute('aria-valuetext',`${timeLabel(position)} of ${timeLabel(state.buffer.duration)}`);drawWaveform();state.raf=requestAnimationFrame(animatePlayback);
}
async function play() {
  if(!state.buffer||state.starting)return;
  if(state.playing){state.offset=currentPosition();stopPlayback();drawWaveform();return;}
  const generation=state.generation;state.starting=true;
  try {
    const context=await getAudioContext();if(generation!==state.generation||!state.buffer)return;
    if(state.offset>=state.buffer.duration-.05)state.offset=0;
    const source=context.createBufferSource();source.buffer=state.buffer;source.connect(context.destination);state.source=source;state.startedAt=context.currentTime;state.playing=true;
    source.onended=()=>{if(state.source!==source)return;state.offset=state.buffer.duration;stopPlayback();$('#seek').value=state.offset;$('#current-time').textContent=timeLabel(state.offset);drawWaveform();};source.start(0,state.offset);
    $('#play-track use').setAttribute('href','#pause');$('#play-track').setAttribute('aria-label','Pause track');animatePlayback();
  } catch {toast('Playback failed. Try again.');} finally {state.starting=false;}
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
$('#remove-file').onclick=()=>{reset();announce('File removed.');$('#choose-file').focus();};
$('#cancel-analysis').onclick=()=>{reset();announce('Analysis canceled.');$('#choose-file').focus();};
let dragDepth=0;
window.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
window.addEventListener('drop',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});
ui['drop-zone'].addEventListener('dragenter',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();dragDepth++;if(!state.busy)ui['drop-zone'].classList.add('is-dragging');}});
ui['drop-zone'].addEventListener('dragleave',()=>{dragDepth--;if(dragDepth<=0){dragDepth=0;ui['drop-zone'].classList.remove('is-dragging');}});
ui['drop-zone'].addEventListener('drop',event=>{event.preventDefault();dragDepth=0;ui['drop-zone'].classList.remove('is-dragging');if(event.dataTransfer.files.length>1){showError('Upload one track at a time.');return;}processFile(event.dataTransfer.files[0]);});
$('#play-track').onclick=play;
let bpmScrubbing=false;
function seekBpm(time,{autoplay=false}={}){
  if(!state.buffer)return;
  const wasPlaying=state.playing;
  stopPlayback();state.offset=clampPlayhead(time,state.buffer.duration);
  $('#seek').value=state.offset;$('#current-time').textContent=timeLabel(state.offset);
  $('#seek').setAttribute('aria-valuetext',`${timeLabel(state.offset)} of ${timeLabel(state.buffer.duration)}`);
  drawWaveform();
  if((autoplay||wasPlaying)&&!bpmScrubbing)void play();
}
$('#seek').addEventListener('pointerdown',()=>{bpmScrubbing=true;});
$('#seek').addEventListener('input',()=>seekBpm(Number($('#seek').value)));
$('#seek').addEventListener('change',()=>{bpmScrubbing=false;seekBpm(Number($('#seek').value),{autoplay:true});});
$('#seek').addEventListener('pointerup',()=>{bpmScrubbing=false;});
$('#seek').addEventListener('pointercancel',()=>{bpmScrubbing=false;});
$('#seek').addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();
    const current=state.offset,delta=(event.shiftKey?5:1)*(event.key==='ArrowRight'?1:-1);
    seekBpm(event.key==='Home'?0:event.key==='End'?state.buffer?.duration:nudgePlayhead(current,state.buffer?.duration,delta),{autoplay:state.playing});
  }
});
$('#half-tempo').onclick=()=>changeTempo(.5);$('#double-tempo').onclick=()=>changeTempo(2);$('#reset-tempo').onclick=()=>changeTempo(0);$('#bpm-override').onchange=event=>setTempo(event.target.value);
$('#bpm-send').onclick=()=>{if(!state.result)return;if(!setTempo($('#bpm-override').value))return;window.dispatchEvent(new CustomEvent('pulse:tempo-apply',{detail:{bpm:state.bpm,beatOffset:state.result?.beatOffsetSeconds||0}}));toast(`${bpmLabel(state.bpm)} BPM applied to production tools.`);};
$('#copy-bpm').onclick=()=>copy(state.bpm);$('#metronome').onclick=()=>state.metroTimer?stopMetronome():startMetronome();
new ResizeObserver(()=>drawWaveform()).observe($('#waveform'));
for(const [button,dialog] of [['open-help','help-dialog'],['open-tap','tap-dialog'],['open-privacy','privacy-dialog']])$('#'+button).onclick=()=>{if(dialog==='tap-dialog')stopMetronome();$('#'+dialog).showModal();};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
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
initStudioTools(()=>({file:state.file,buffer:state.buffer,bpm:state.bpm,beatOffset:state.result?.beatOffsetSeconds||0}));
