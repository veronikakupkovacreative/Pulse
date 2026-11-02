import {workspace as w} from './modules/workspace.mjs';
import {estimateBpm} from './modules/dsp.mjs';
const $=id=>document.getElementById(id);
let currentBpm=null;let lastBuffer=null;
function draw(){const c=$('bpm-canvas'),b=w.buffer;if(!c||!b)return;const dpr=Math.min(devicePixelRatio||1,2),width=Math.round(c.clientWidth*dpr)||500,height=Math.round(c.clientHeight*dpr)||100;c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='#202020';ctx.fillRect(0,0,width,height);ctx.strokeStyle='#ff2b20';const arr=b.getChannelData(0);for(let x=0;x<width;x++){const start=Math.floor(arr.length*x/width),end=Math.floor(arr.length*(x+1)/width);let min=1,max=-1;for(let j=start;j<end;j+=Math.max(1,Math.floor((end-start)/64))){min=Math.min(min,arr[j]);max=Math.max(max,arr[j])}ctx.beginPath();ctx.moveTo(x,height*(.5-.42*max));ctx.lineTo(x,height*(.5-.42*min));ctx.stroke()}}
function update(){const b=w.buffer;if(!b)return;$('bpm-empty').hidden=true;$('bpm-loaded').hidden=false;$('bpm-track-name').textContent=w.name;$('bpm-track-details').textContent=fmt(b.duration)+' · '+(b.numberOfChannels===2?'Stereo':'Mono')+' · '+(b.sampleRate/1000).toFixed(1)+' kHz';draw();$('bpm-reanalyze').disabled=false;const result=estimateBpm(b);currentBpm=result.bpm;if(result.bpm)setTempo(result.bpm);else $('bpm-number').textContent='—';$('bpm-format').textContent=(w.name.split('.').pop()||'AUDIO').toUpperCase();$('bpm-result-caption').textContent=result.bpm?'Estimated tempo / '+result.confidence+'% relative confidence':'Could not identify reliable beats';$('bpm-status').textContent=result.bpm?'ANALYZED':'NOT DETECTED';lastBuffer=b;}
async function loadFile(file){if(!file)return;try{$('bpm-error').textContent='';await w.load(file);update()}catch(e){$('bpm-error').textContent=e.message}}
$('bpm-choose').onclick=()=>$('bpm-file').click();
$('bpm-replace').onclick=()=>$('bpm-file').click();
$('bpm-file').onchange=e=>loadFile(e.target.files?.[0]);
const dz=$('bpm-drop-zone');dz.ondragover=e=>{e.preventDefault();dz.classList.add('is-dragover')};dz.ondragleave=()=>dz.classList.remove('is-dragover');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('is-dragover');void loadFile(e.dataTransfer.files?.[0])};
$('bpm-reanalyze').onclick=()=>{try{update()}catch(e){$('bpm-error').textContent=e.message}};
$('bpm-play').onclick=async()=>{try{await w.togglePlay();$('bpm-play').textContent=w.playing?'Ⅱ':'▶'}catch(e){$('bpm-error').textContent=e.message}};
$('bpm-canvas').addEventListener('click',e=>{if(!w.buffer)return;w.seek((e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.clientWidth*w.buffer.duration)});
const descriptions={
bpm:['BPM','Analyzer','Estimate the tempo of an audio track through rhythmic onset analysis.','Load your track in the source audio panel.','Run BPM analysis.','Review the tempo estimate and confidence indicator.'],
key:['Key','Finder','Harmonic analysis estimates the musical key of a track, including Camelot notation.','Load your audio file.','Start Key Finder analysis.','Verify the result by ear.'],
beats:['Beat','Detection','Locate rhythmic transients and display onset markers along the waveform.','Upload a track.','Select Beat Detection.','Review the onset markers in the waveform.'],
editor:['Audio','Editor','Trim or remove a selected section of audio while preserving the rest of the timeline.','Upload your track.','Hold Shift and drag to select a range.','Choose Cut or Trim.'],
reverse:['Reverse','Audio','Reverse the sample sequence for a creative backspin sound.','Load audio.','Run Reverse Audio.','Preview the result or use Undo.'],
normalize:['Peak','Normalize','Set the highest sample peak to a chosen dBFS target without changing the dynamics.','Load audio.','Choose a peak target.','Normalize and export.'],
equalizer:['Equalizer','.','Shape low, mid and high frequencies through three adjustable EQ bands.','Load audio.','Set the low, mid and high gains.','Apply the EQ and preview the audio.'],
volume:['Gain','.','Adjust the overall audio level by an exact decibel offset.','Load audio.','Enter the gain amount.','Apply the change.'],
wav:['Audio','Converter','Export compatible input audio as a 16-bit or 24-bit PCM WAV file.','Load your audio file.','Choose the WAV bit depth.','Export your file.'],
loop:['Loop','Cutter','Export a selected fragment of the waveform as a separate WAV loop.','Load audio.','Shift and drag to select a range.','Export the selected loop.'],
health:['Mix','Health','Evaluate sample peak, RMS, crest factor and detected clipped samples.','Load your mix.','Run Mix Health.','Review the levels and dynamics.'],
master:['Smart','Master','Use local compression and soft limiting to adjust dynamics. This is DSP, not neural AI.','Load your mix.','Adjust compression and output ceiling.','Process and listen to the result.'],
quickfix:['Mix','Quick Fix','Apply a simplified local normalization and dynamics processing chain.','Load your audio file.','Run Quick Fix.','Listen and compare with Undo.']
};
const tabs=$('tool-tabs');function setEditorial(id){const d=descriptions[id];if(!d)return;const heading=$('toolkit-title');heading.replaceChildren(document.createTextNode(d[0]));heading.append(document.createElement('br'));const span=document.createElement('span');span.textContent=d[1]==='.'?'':d[1]+'.';heading.append(span);$('pulse-tool-summary').textContent=d[2];$('pulse-tool-steps').replaceChildren(...d.slice(3).map(t=>{const li=document.createElement('li');li.textContent=t;return li}))}
tabs?.addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b)setEditorial(b.dataset.tool)});
document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>requestAnimationFrame(()=>{const active=tabs?.querySelector('.selected');if(active)setEditorial(active.dataset.tool)})));
new MutationObserver(()=>{if(w.buffer&&lastBuffer!==w.buffer){lastBuffer=w.buffer;update()}}).observe($('audio-meta'),{childList:true,subtree:true});
function tick(){if(w.buffer){$('bpm-time').textContent=fmt(w.position)+' / '+fmt(w.buffer.duration);$('bpm-playhead').style.left=(100*w.position/w.buffer.duration)+'%';$('bpm-play').textContent=w.playing?'Ⅱ':'▶'}requestAnimationFrame(tick)}
tick();setEditorial('bpm');


let beatTimer=null,beatIndex=0,previewCtx=null;
const fmt=t=>{const sec=Math.max(0,Math.floor(t||0));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')};
function setTempo(value){const v=Number(value);if(!Number.isFinite(v)||v<20||v>400)return;currentBpm=Math.round(v*10)/10;$('bpm-number').textContent=currentBpm.toFixed(1);$('bpm-override').value=currentBpm.toFixed(1);$('bpm-half').disabled=currentBpm<40;$('bpm-double').disabled=currentBpm>200;$('bpm-copy').disabled=false;$('bpm-apply').disabled=false;restartPreview();}
function stopPreview(){if(beatTimer!==null){clearInterval(beatTimer);beatTimer=null}document.querySelectorAll('#bpm-beat-dots i').forEach(x=>x.classList.remove('is-active'))}
function restartPreview(){stopPreview();if(!$('bpm-preview').checked||!currentBpm)return;previewCtx??=new(window.AudioContext||window.webkitAudioContext)();void previewCtx.resume();const tick=()=>{const count=Number($('bpm-meter').value)||4;beatIndex=(beatIndex+1)%count;const osc=previewCtx.createOscillator(),gain=previewCtx.createGain(),now=previewCtx.currentTime;osc.frequency.value=beatIndex===0?1040:760;gain.gain.setValueAtTime(Math.max(0,Number($('bpm-volume').value)/100)*.12,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.045);osc.connect(gain).connect(previewCtx.destination);osc.start(now);osc.stop(now+.05);document.querySelectorAll('#bpm-beat-dots i').forEach((x,i)=>x.classList.toggle('is-active',i===beatIndex))};beatIndex=-1;tick();beatTimer=setInterval(tick,60000/currentBpm)}
$('bpm-half').onclick=()=>setTempo(currentBpm/2);
$('bpm-double').onclick=()=>setTempo(currentBpm*2);
$('bpm-override').onchange=e=>setTempo(e.target.value);
$('bpm-copy').onclick=async()=>{if(currentBpm){try{await navigator.clipboard.writeText(currentBpm.toFixed(1));$('bpm-copy').textContent='Copied ✓'}catch{$('bpm-error').textContent='Copy unavailable'}}};
$('bpm-apply').onclick=()=>{if(!currentBpm)return;document.querySelector('[data-category="analyze"]')?.click();document.querySelector('[data-tool="bpm"]')?.click();document.getElementById('toolkit')?.scrollIntoView({behavior:'smooth'});$('bpm-result-caption').textContent='Tempo '+currentBpm.toFixed(1)+' BPM selected. The toolkit BPM tool analyzes the loaded audio independently.'};
$('bpm-preview').onchange=restartPreview;
$('bpm-meter').onchange=()=>{const dots=$('bpm-beat-dots');dots.replaceChildren(...Array.from({length:Number($('bpm-meter').value)},()=>document.createElement('i')));restartPreview()};
$('bpm-volume').oninput=()=>{if($('bpm-preview').checked)restartPreview()};
$('bpm-clear').onclick=()=>{stopPreview();$('bpm-preview').checked=false;$('bpm-loaded').hidden=true;$('bpm-empty').hidden=false;$('bpm-number').textContent='—';$('bpm-override').value='';$('bpm-copy').disabled=$('bpm-half').disabled=$('bpm-double').disabled=$('bpm-apply').disabled=true;currentBpm=null;$('bpm-file').value='';$('bpm-result-caption').textContent='Tempo is an estimate. Verify by ear or use half/double tempo.'};
document.querySelectorAll('[data-open-tool]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.openTool;const module=Array.from(document.querySelectorAll('#tool-tabs [data-tool]')).find(b=>b.dataset.tool===id);if(module){module.click()}else{const category=({bpm:'analyze',key:'analyze',tap:'analyze',editor:'edit',loop:'export',reverse:'edit',equalizer:'edit',normalize:'edit',wav:'export',health:'ai',quickfix:'ai',master:'ai'})[id];if(category){document.querySelector('[data-category="'+category+'"]')?.click();document.querySelector('#tool-tabs [data-tool="'+id+'"]')?.click()}}document.getElementById('toolkit')?.scrollIntoView({behavior:'smooth'})}));
