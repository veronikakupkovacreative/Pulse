import {workspace as w} from './modules/workspace.mjs';
import {mountWorkspaceActions} from './modules/workspace-actions.mjs';
import {analyzeRhythmInWorker} from './modules/rhythm-client.mjs';
const $=id=>document.getElementById(id);
mountWorkspaceActions(document.querySelector('#analyzer .bpm-result-panel'),w);
const duration=t=>{const x=Math.floor(Math.max(0,t));return Math.floor(x/60)+':'+String(x%60).padStart(2,'0')};
let result=null,track=null,priorBuffer=null,priorTrackId=null,runId=0,analysisController=null,playingMetro=false,metroTimer=null,metroContext=null,metroStep=0;
function status(msg){$('bpm-error').textContent=msg||''}
function draw(){
 const b=w.buffer,c=$('bpm-canvas');if(!b||!c)return;
 const dpr=Math.min(devicePixelRatio||1,2),width=Math.max(10,Math.round(c.clientWidth*dpr)),height=Math.max(10,Math.round(c.clientHeight*dpr));
 c.width=width;c.height=height;const ctx=c.getContext('2d'),s=b.getChannelData(0);
 ctx.fillStyle='#0b0b0b';ctx.fillRect(0,0,width,height);ctx.fillStyle='#ff0000';
 for(let x=0;x<width;x++){const start=Math.floor(x*s.length/width),end=Math.max(start+1,Math.floor((x+1)*s.length/width));let peak=0;for(let j=start;j<end;j+=Math.max(1,Math.floor((end-start)/60)))peak=Math.max(peak,Math.abs(s[j]));const h=Math.max(2,peak*height*.92);ctx.fillRect(x,height/2-h/2,Math.max(1,dpr),h);}
 const line=$('bpm-canvas').parentNode.querySelector('.bpm-wave-playhead');if(line)line.style.left=(w.position/b.duration*100)+'%';
}
function syncTrack(){
 const b=w.buffer;if(!b){$('bpm-loaded').hidden=true;$('bpm-empty').hidden=false;return}
 $('bpm-empty').hidden=true;$('bpm-loaded').hidden=false;$('bpm-track-name').textContent=track?.name||w.name;$('bpm-file-type').textContent=(track?.name?.split('.').pop()||'AUDIO').toUpperCase();
 $('bpm-track-details').textContent=duration(b.duration)+' · '+(track?(track.size/1024/1024).toFixed(1)+' MB · ':'')+b.numberOfChannels+' ch · '+(b.sampleRate/1000).toFixed(1)+' kHz';draw();
}
function setTempo(v){
 const bpm=Number(String(v).replace(',','.'));if(!Number.isFinite(bpm)||bpm<20||bpm>400){status('Enter a tempo between 20 and 400 BPM.');return false}
 result={...result,bpm:Math.round(bpm*100)/100};$('bpm-number').textContent=result.bpm.toFixed(2);$('bpm-edit').value=result.bpm.toFixed(2);status('');return true;
}
function stopMetro(){playingMetro=false;if(metroTimer)clearInterval(metroTimer);metroTimer=null;$('bpm-metronome').setAttribute('aria-pressed','false')}
function beat(){if(!playingMetro)return;const ctx=metroContext,t=ctx.currentTime,osc=ctx.createOscillator(),g=ctx.createGain(),accent=metroStep%Number($('bpm-meter').value)===0;osc.frequency.value=accent?1100:800;osc.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,Number($('bpm-volume').value)/100*.18),t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.055);osc.start(t);osc.stop(t+.06);const dots=[...$('bpm-beat-dots').children];dots.forEach((x,i)=>x.classList.toggle('active',i===metroStep%dots.length));metroStep++}
async function toggleMetro(){if(playingMetro){stopMetro();return}if(!result)return;metroContext??=new AudioContext();await metroContext.resume();playingMetro=true;metroStep=0;$('bpm-metronome').setAttribute('aria-pressed','true');beat();metroTimer=setInterval(beat,60000/result.bpm)}
async function analyze(){
 const b=w.buffer;if(!b)return;const id=++runId;analysisController?.abort();const controller=new AbortController();analysisController=controller;stopMetro();$('bpm-status').textContent='ANALYZING';$('bpm-number').textContent='…';status('');
 try{
  const next=await analyzeRhythmInWorker(b,{signal:controller.signal,onProgress:value=>{if(id===runId)$('bpm-status').textContent='ANALYZING '+value+'%';}});
  if(id!==runId)return;
  result=next;w.setMarkers(next.beatTimes);setTempo(next.bpm);$('bpm-offset').value=String(next.offset??0);$('bpm-status').textContent='RHYTHM ANALYZED';
  $('bpm-expanded').hidden=false;$('bpm-empty-result').hidden=true;
  $('bpm-note').textContent='Tempo estimate · '+(next.method==='web-audio-beat-detector'?'Web Audio Beat Detector':'onset fallback')+' · '+next.confidence.toUpperCase()+' rhythmic confidence · '+next.beatTimes.length+' beat markers. Half/double tempos remain possible.';
 }catch(error){
  if(id!==runId||error?.name==='AbortError')return;
  result=null;$('bpm-status').textContent='NO RHYTHM FOUND';$('bpm-number').textContent='—';$('bpm-expanded').hidden=true;$('bpm-empty-result').hidden=false;
  status(error.message==='NO_RHYTHM'?'No reliable rhythmic pulse found. Try Tap Tempo.':error.message);
 }finally{if(analysisController===controller)analysisController=null;}
}
async function load(file){if(!file)return;try{track=file;await w.load(file);priorBuffer=w.buffer;priorTrackId=w.trackId;syncTrack();await analyze()}catch(e){status(e.message)}}
$('bpm-choose').onclick=()=>$('bpm-file').click();$('bpm-replace').onclick=()=>$('bpm-file').click();
$('bpm-file').onchange=e=>load(e.target.files?.[0]);
$('bpm-remove').onclick=()=>{analysisController?.abort();w.clear();track=null;priorBuffer=null;priorTrackId=null;result=null;$('bpm-expanded').hidden=true;$('bpm-empty-result').hidden=false;$('bpm-number').textContent='—';syncTrack();stopMetro()};
const dz=$('bpm-drop-zone');dz.ondragover=e=>{e.preventDefault();dz.classList.add('is-dragover')};dz.ondragleave=()=>dz.classList.remove('is-dragover');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('is-dragover');void load(e.dataTransfer.files?.[0])};
$('bpm-reanalyze').onclick=analyze;$('bpm-half').onclick=()=>result&&setTempo(result.bpm/2);$('bpm-double').onclick=()=>result&&setTempo(result.bpm*2);
$('bpm-edit').onchange=e=>setTempo(e.target.value);
$('bpm-copy').onclick=async()=>{if(!result)return;try{await navigator.clipboard.writeText(result.bpm.toFixed(2));$('bpm-copy').textContent='Copied ✓'}catch{status('Clipboard unavailable')}};
$('bpm-apply').onclick=()=>{if(!result||!setTempo($('bpm-edit').value))return;document.dispatchEvent(new CustomEvent('pulse:tempo',{detail:{bpm:result.bpm,offset:Number($('bpm-offset').value)||0,meter:Number($('bpm-meter').value)||4}}));status('Tempo applied to source grid: '+result.bpm.toFixed(2)+' BPM.')};
$('bpm-metronome').onclick=toggleMetro;
$('bpm-play').onclick=()=>w.togglePlay().catch(e=>status(e.message));
$('bpm-canvas').onclick=e=>{if(!w.buffer)return;w.seek((e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.clientWidth*w.buffer.duration)};
$('bpm-open-tap').onclick=()=>{document.querySelector('[data-category="analyze"]').click();document.querySelector('[data-tool="tap"]')?.click();$('toolkit').scrollIntoView({behavior:'smooth'})};
function watch(){if(w.buffer!==priorBuffer){priorBuffer=w.buffer;syncTrack();if(w.buffer&&result){result=null;$('bpm-status').textContent='TRACK UPDATED';$('bpm-number').textContent='—';$('bpm-expanded').hidden=true;$('bpm-empty-result').hidden=false;$('bpm-note').textContent='The audio changed. Re-run Rhythm Engine to refresh tempo and beat markers.';}}if(w.trackId!==priorTrackId){priorTrackId=w.trackId;if(w.buffer){track=w.originalFile||track;result=null;void analyze()}else{track=null;result=null;stopMetro();}}
 if(w.buffer){$('bpm-time').textContent=duration(w.position)+' / '+duration(w.buffer.duration);$('bpm-play').textContent=w.playing?'Ⅱ':'▶';const line=$('bpm-loaded').querySelector('.bpm-wave-playhead');if(line)line.style.left=(w.position/w.buffer.duration*100)+'%';}
 requestAnimationFrame(watch)}
watch();
// Tool-specific editorial copy is now maintained centrally in app.mjs / tool-editorial.mjs.
