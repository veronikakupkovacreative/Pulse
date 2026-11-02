// Source Audio presentation controller; core workspace DSP and transport are untouched.
import {workspace as w} from './workspace.mjs';
const label=seconds=>{const t=Math.max(0,seconds||0),m=Math.floor(t/60),s=Math.floor(t%60);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(Math.round(t%1*100)).padStart(2,'0')};
const area=document.querySelector('.audio-source-area');
if(area){
 area.classList.add('pulse-source-original');
 const canvas=document.getElementById('audio-wave'),input=document.getElementById('audio-file'),metadata=document.getElementById('audio-meta');
 const fileTop=document.createElement('div');fileTop.className='pulse-source-file-top';fileTop.innerHTML='<span class="pulse-source-format" id="source-format">AUDIO</span><button id="source-clear" aria-label="Clear source audio">×</button>';
 metadata.before(fileTop);
 const actions=document.createElement('div');actions.className='pulse-wave-toolbar';actions.innerHTML='<div class="pulse-wave-edit"><button type="button" id="source-loop">LOOP OFF</button><button type="button" id="source-in">IN</button><button type="button" id="source-out">OUT</button><button type="button" id="source-snap">SNAP OFF</button></div><div class="pulse-wave-zoom"><button type="button" id="source-prev" aria-label="Pan left">←</button><button type="button" id="source-zoomout">−</button><span id="source-zoom">1×</span><button type="button" id="source-zoomin">+</button><button type="button" id="source-next" aria-label="Pan right">→</button></div>';
 canvas.before(actions);
 const ruler=document.createElement('div');ruler.className='pulse-source-ruler';ruler.id='source-ruler';canvas.before(ruler);
 const help=document.createElement('p');help.className='pulse-source-help';help.textContent='Click or drag to seek · I/O loop · L toggle · +/− zoom · Arrows ±1 s, Shift ±5 s.';canvas.after(help);
 const meta=document.createElement('p');meta.className='pulse-source-loopline';meta.id='source-loopline';help.after(meta);
 const reuse=document.createElement('button');reuse.className='pulse-source-reuse';reuse.textContent='Use track from BPM Analyzer ↗';document.getElementById('audio-controls')?.after(reuse);area.append(reuse);
 const reset=document.createElement('button');reset.className='pulse-source-reset';reset.textContent='Reset to Original';document.getElementById('audio-redo')?.after(reset);
 let loop=false,snap=false,zoom=1,view=0,tempo=122.7,offset=0,meter=4;
 const $=id=>document.getElementById(id);
 const refresh=()=>{const b=w.buffer,span=b?b.duration/zoom:0;$('source-zoom').textContent=zoom+'×';$('source-loop').textContent=loop?'LOOP ON':'LOOP OFF';$('source-snap').textContent=snap?'SNAP ON':'SNAP OFF';$('source-zoomout').disabled=zoom===1;$('source-zoomin').disabled=zoom===16;reset.disabled=!b||!w.original;reuse.disabled=!b;
  $('source-loopline').textContent=b?'LOOP '+label(w.selection?.start||0)+' – '+label(w.selection?.end||b.duration)+' · '+(loop?'ON':'OFF')+' · Grid '+tempo.toFixed(1)+' BPM (offset '+offset.toFixed(2)+'s)':'Upload or reuse a track to begin.';
  $('source-format').textContent=b?'AUDIO':'NO FILE';
  const ruler=$('source-ruler');ruler.replaceChildren();
  if(b){for(let i=0;i<=4;i++){const e=document.createElement('span');e.textContent=label(Math.min(b.duration,view+span*i/4));ruler.append(e)}}};
 $('source-loop').onclick=()=>{loop=!loop;refresh()};
 $('source-snap').onclick=()=>{snap=!snap;refresh()};
 $('source-in').onclick=()=>{if(w.buffer)w.setSelection(w.position,w.selection?.end??w.buffer.duration);refresh()};
 $('source-out').onclick=()=>{if(w.buffer)w.setSelection(w.selection?.start??0,w.position);refresh()};
 function changeZoom(v){zoom=Math.max(1,Math.min(16,v));view=w.buffer?Math.min(view,Math.max(0,w.buffer.duration-w.buffer.duration/zoom)):0;refresh()};
 $('source-zoomout').onclick=()=>changeZoom(zoom/2);$('source-zoomin').onclick=()=>changeZoom(zoom*2);
 $('source-prev').onclick=()=>{if(w.buffer){view=Math.max(0,view-w.buffer.duration/zoom*.5);refresh()}};
 $('source-next').onclick=()=>{if(w.buffer){view=Math.min(w.buffer.duration-w.buffer.duration/zoom,view+w.buffer.duration/zoom*.5);refresh()}};
 $('source-clear').onclick=()=>{w.stop();w.buffer=null;w.render();input.value='';refresh()};
 reset.onclick=()=>{if(w.buffer){w.reset();refresh()}};
 reuse.onclick=()=>{if(w.buffer){document.getElementById('source-status').textContent='The BPM Analyzer and toolkit now share the same loaded audio.';area.scrollIntoView({block:'center',behavior:'smooth'})}};
 document.addEventListener('pulse:tempo',e=>{tempo=e.detail.bpm;offset=e.detail.offset;meter=e.detail.meter;refresh()});
 // Playback, existing waveform drawing, editing and DSP functions are preserved.
 let last=null,selection=null;setInterval(()=>{if(last!==w.buffer||selection!==w.selection){last=w.buffer;selection=w.selection;refresh()}},500);refresh();
}
