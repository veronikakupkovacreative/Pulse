/* PULSE dark UI enhancements; existing audio-engine modules remain authoritative. */
import {workspace as w} from './workspace.mjs';
import {editRegion,reverseBuffer,gainBuffer} from './dsp.mjs';
import {fadeBuffer,renderWithNodes} from './legacy-dsp.mjs';
import {convertBuffer,downloadConversion} from './converter.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],id=s=>document.getElementById(s);
const clock=t=>{t=Math.max(0,t||0);return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+Math.floor(t%1*10)};
const show=(message,error=false)=>{const node=id('pulse-redesign-status')||id('source-status');if(node){node.textContent=message;node.dataset.error=String(error)}};
const text=(i,v)=>{if(id(i))id(i).textContent=String(v)};
let editor=false,originalDraw=null,eqIndex=1,busy=false;
const eq=[
 {f:100,g:2,q:.8,type:'lowshelf'},
 {f:400,g:-3,q:1.4,type:'peaking'},
 {f:3000,g:2,q:1.2,type:'peaking'},
 {f:11000,g:1,q:.8,type:'highshelf'}
];
function refresh(){
 const b=w.buffer,sel=w.selection;
 text('pulse-current-name',b?w.displayName||w.name:'No track loaded');
 text('pulse-file-meta',b?clock(b.duration)+' · '+(b.sampleRate/1000).toFixed(1)+' kHz · '+(b.numberOfChannels>1?'stereo':'mono'):'Choose a file');
 text('pulse-editor-now',clock(w.position));text('pulse-editor-duration',clock(b?.duration));
 text('pulse-sel-start',sel?clock(sel.start):'—');text('pulse-sel-end',sel?clock(sel.end):'—');text('pulse-sel-length',sel?clock(sel.end-sel.start):'—');
 text('pulse-sel-tag',sel?clock(sel.end-sel.start)+' selected':'Drag to select');
 const play=id('pulse-editor-play');if(play){play.textContent=w.playing?'PAUSE':'PLAY';play.setAttribute('aria-label',w.playing?'Pause':'Play')}
 if(id('pulse-toolbar-undo'))id('pulse-toolbar-undo').disabled=!w.history.canUndo;
 if(id('pulse-toolbar-redo'))id('pulse-toolbar-redo').disabled=!w.history.canRedo;
 $$('[data-selection-edit]').forEach(x=>x.disabled=!sel||sel.end-sel.start<.01);
 if(id('pulse-export-btn'))id('pulse-export-btn').disabled=!b;
 const hist=id('pulse-history-list');
 if(hist){hist.replaceChildren();const entries=[...w.history.undoEntries].reverse().slice(0,6);
  if(!entries.length){const li=document.createElement('li');li.textContent=b?'Track loaded · no edits yet':'Load a track to start editing';hist.append(li)}
  for(const entry of entries){const li=document.createElement('li'),name=document.createElement('span'),time=document.createElement('time');name.textContent=entry.label;const minutes=Math.floor((Date.now()-entry.createdAt)/60000);time.textContent=minutes?' '+minutes+'m ago':'just now';li.append(name,time);hist.append(li)}}
 const fmt=id('pulse-export-format')?.value||'wav',estimate=b?(fmt==='wav'?b.duration*b.sampleRate*b.numberOfChannels*2:fmt==='flac'?b.duration*b.sampleRate*b.numberOfChannels*1.2:b.duration*(fmt==='m4a'?192000:320000)/8):0;
 text('pulse-export-estimate',b?'~'+(estimate/1048576).toFixed(1)+' MB est.':'No audio');
}
function drawStereo(){
 const canvas=id('audio-wave'),b=w.buffer;if(!canvas)return;
 const ratio=Math.min(devicePixelRatio||1,2),width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.fillStyle='#0e0e0f';ctx.fillRect(0,0,width,height);if(!b)return;
 const channels=Math.min(2,b.numberOfChannels),row=height/channels;
 for(let c=0;c<channels;c++){
  const samples=b.getChannelData(c),mid=row*(c+.5);ctx.strokeStyle='#35353a';ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(width,mid);ctx.stroke();
  ctx.fillStyle='#bdbab1';ctx.font='11px monospace';ctx.fillText(channels===1?'MONO':c===0?'L':'R',9,c*row+16);
  ctx.strokeStyle='#e2ded8';ctx.lineWidth=Math.max(1,ratio*.7);const dx=Math.max(1,Math.floor(width/900));
  for(let x=0;x<width;x+=dx){const start=Math.floor(samples.length*x/width),end=Math.max(start+1,Math.floor(samples.length*(x+dx)/width)),skip=Math.max(1,Math.floor((end-start)/60));let low=1,high=-1;for(let n=start;n<end;n+=skip){low=Math.min(low,samples[n]);high=Math.max(high,samples[n])}ctx.beginPath();ctx.moveTo(x,mid-high*row*.44);ctx.lineTo(x,mid-low*row*.44);ctx.stroke()}
 }
 if(w.selection){const a=w.selection.start/b.duration*width,z=w.selection.end/b.duration*width;ctx.fillStyle='rgba(255,77,28,.25)';ctx.fillRect(a,0,z-a,height);ctx.strokeStyle='#ff4d1c';ctx.lineWidth=2*ratio;for(const x of [a,z]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();ctx.fillStyle='#ff4d1c';ctx.fillRect(x-4*ratio,height/2-17*ratio,8*ratio,34*ratio)}}
 ctx.strokeStyle='#fff';ctx.lineWidth=2*ratio;const x=w.position/b.duration*width;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();
}
function mode(on){
 editor=on;document.body.classList.toggle('pulse-editor-mode',on);
 for(const name of ['pulse-editor-controls','pulse-filechip','pulse-editor-export','pulse-editor-properties','pulse-editor-transport','pulse-editor-history'])if(id(name))id(name).hidden=!on;
 if(on&&!originalDraw){originalDraw=w.drawWave.bind(w);w.drawWave=drawStereo;w.drawWave()}
 if(!on&&originalDraw){w.drawWave=originalDraw;originalDraw=null;w.drawWave()}
 refresh();
}
async function edit(action){
 if(busy)return;busy=true;
 try{
  const b=w.ensureAudio();let out;
  if(action==='trim'||action==='cut'){if(!w.selection)throw Error('Drag across the waveform to select a region.');out=editRegion(b,w.selection.start,w.selection.end,action)}
  if(action==='reverse')out=reverseBuffer(b);
  if(action==='gain')out=gainBuffer(b,Number(id('pulse-gain').value));
  if(action==='fade-in'||action==='fade-out')out=fadeBuffer(b,Math.max(.01,Number(id(action==='fade-in'?'pulse-fade-in':'pulse-fade-out').value)),action==='fade-in'?'in':'out');
  if(!out)return;if(b!==w.buffer)throw Error('Track changed during processing.');
  w.commit(out,'Audio Editor: '+action);show(action+' applied. Undo is available.');
 }catch(error){show(error.message||'Edit failed.',true)}finally{busy=false}
}
function eqX(f){return 400*Math.log(f/20)/Math.log(1000)}
function syncEq(){
 const b=eq[eqIndex],freq=id('pulse-eq-frequency'),gain=id('pulse-eq-gain'),q=id('pulse-eq-q');
 if(!freq)return;freq.value=Math.round(1000*Math.log(b.f/20)/Math.log(1000));gain.value=b.g;q.value=b.q;
 $$('[data-band]').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.band)===eqIndex)));drawEq();
}
function drawEq(){
 if(!id('pulse-eq-curve'))return;
 const data=[];for(let x=0;x<=400;x+=4){let db=0;for(const b of eq){const dx=(x-eqX(b.f))/(60/Math.sqrt(b.q));db+=b.g*Math.exp(-dx*dx)}data.push(x+','+(77-Math.max(-14,Math.min(14,db))*4.7).toFixed(1))}
 id('pulse-eq-curve').setAttribute('d','M'+data.join(' L'));const nodes=id('pulse-eq-nodes');nodes.replaceChildren();
 eq.forEach((b,i)=>{const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('cx',eqX(b.f));dot.setAttribute('cy',77-b.g*4.7);dot.setAttribute('r',i===eqIndex?6:4);dot.setAttribute('class','pulse-eq-node'+(i===eqIndex?' is-active':''));nodes.append(dot)});
 const b=eq[eqIndex];text('pulse-eq-freq-label',b.f>=1000?(b.f/1000).toFixed(1)+' kHz':b.f+' Hz');text('pulse-eq-gain-label',(b.g>0?'+':'')+b.g.toFixed(1)+' dB');text('pulse-eq-q-label',b.q.toFixed(1));
}
async function applyEq(){
 if(busy)return;busy=true;
 try{const source=w.ensureAudio(),out=await renderWithNodes(source,eq.map(b=>({type:b.type,frequency:b.f,gain:b.g,q:b.q})));if(source!==w.buffer)throw Error('Track changed during rendering');w.commit(out,'Audio Editor: 4-band EQ');show('EQ applied with OfflineAudioContext.')}
 catch(error){show(error.message,true)}finally{busy=false}
}
async function exportAudio(){
 const button=id('pulse-export-btn');if(busy)return;busy=true;button.disabled=true;
 try{const b=w.ensureAudio(),format=id('pulse-export-format').value;show('Encoding '+format.toUpperCase()+' locally…');
  const blob=await convertBuffer(b,{format,bitDepth:16,bitrate:format==='m4a'?192:320,sampleRate:'original'},message=>show(message));
  downloadConversion(blob,id('pulse-export-name').value||w.name,format);show('Export complete · '+format.toUpperCase());}
 catch(error){show(error.message||'Export failed',true)}finally{busy=false;button.disabled=false}
}
export function initializeStudioRedesign(){
 document.documentElement.setAttribute('data-theme','dark');
 const hero=id('pulse-hero-file'),drop=id('pulse-hero-drop');
 const load=async file=>{if(!file)return;try{await w.load(file);id('toolkit')?.scrollIntoView({block:'start'});show('Loaded '+file.name)}catch(e){show(e.message,true)}};
 hero?.addEventListener('change',()=>{void load(hero.files?.[0]);hero.value=''});
 $$('[data-open-audio]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();hero?.click()}));
 for(const type of ['dragover','dragenter'])drop?.addEventListener(type,event=>{event.preventDefault();drop.classList.add('is-dragging')});
 for(const type of ['drop','dragleave'])drop?.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('is-dragging')});
 drop?.addEventListener('drop',event=>void load(event.dataTransfer?.files?.[0]));
 const strip=id('pulse-wave-strip');if(strip)for(let i=0;i<82;i++){const bar=document.createElement('i');bar.style.setProperty('--height',Math.round(10+Math.abs(Math.sin(i*.37)*Math.cos(i*.1))*83)+'%');strip.append(bar)}
 $$('.pulse-tool-filter').forEach(button=>button.addEventListener('click',()=>{const f=button.dataset.filter;$$('.pulse-tool-filter').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));$$('.pulse-tool-card').forEach(x=>x.dataset.hidden=String(f!=='all'&&x.dataset.kind!==f))}));
 const onTool=()=>{mode($('.tool-tabs .tool-tab.selected')?.dataset.tool==='editor');text('pulse-workspace-mode',$('.tool-tabs .tool-tab.selected')?.textContent||'Audio workspace')};
 document.addEventListener('pulse:tool-mounted',onTool);onTool();
 w.subscribe((snapshot,reason)=>{if(reason==='position'){text('pulse-editor-now',clock(snapshot.position))}else refresh();if(reason==='transport'){const button=id('pulse-editor-play');if(button){button.textContent=w.playing?'PAUSE':'PLAY';button.setAttribute('aria-label',w.playing?'Pause':'Play')}}});
 id('pulse-toolbar-undo')?.addEventListener('click',()=>w.undo());
 id('pulse-toolbar-redo')?.addEventListener('click',()=>w.redo());
 id('pulse-editor-replace')?.addEventListener('click',()=>id('audio-file')?.click());
 id('pulse-editor-play')?.addEventListener('click',()=>void w.togglePlay().catch(e=>show(e.message,true)));
 id('pulse-editor-start')?.addEventListener('click',()=>w.seek(0));
 id('pulse-toolbar-zoom-in')?.addEventListener('click',()=>id('source-zoomin')?.click());
 id('pulse-toolbar-zoom-out')?.addEventListener('click',()=>id('source-zoomout')?.click());
 id('pulse-editor-loop')?.addEventListener('click',e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));w.setLoopEnabled(on)});
 id('pulse-editor-volume')?.addEventListener('input',e=>w.setVolume(Number(e.target.value)/100));
 $$('[data-editor-mode]').forEach(button=>button.addEventListener('click',()=>{$$('[data-editor-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));if(button.dataset.editorMode==='gain')id('pulse-gain')?.focus()}));
 $$('[data-editor-action]').forEach(button=>button.addEventListener('click',()=>{const a=button.dataset.editorAction;if(a==='merge'){document.querySelector('[data-edit-mode="merge"]')?.click();return;}void edit(a)}));
 id('pulse-selection-trim')?.addEventListener('click',()=>void edit('trim'));
 id('pulse-selection-cut')?.addEventListener('click',()=>void edit('cut'));
 for(const [input,output,unit] of [['pulse-fade-in','pulse-fade-in-label',' s'],['pulse-fade-out','pulse-fade-out-label',' s'],['pulse-gain','pulse-gain-label',' dB']])id(input)?.addEventListener('input',()=>text(output,(input==='pulse-gain'&&Number(id(input).value)>0?'+':'')+Number(id(input).value).toFixed(1)+unit));
 $$('[data-band]').forEach(button=>button.addEventListener('click',()=>{eqIndex=Number(button.dataset.band);syncEq()}));
 for(const key of ['pulse-eq-frequency','pulse-eq-gain','pulse-eq-q'])id(key)?.addEventListener('input',()=>{eq[eqIndex].f=Math.round(20*Math.pow(1000,id('pulse-eq-frequency').value/1000));eq[eqIndex].g=Number(id('pulse-eq-gain').value);eq[eqIndex].q=Number(id('pulse-eq-q').value);drawEq()});
 id('pulse-eq-apply')?.addEventListener('click',()=>void applyEq());
 id('pulse-export-btn')?.addEventListener('click',()=>void exportAudio());
 id('pulse-export-format')?.addEventListener('change',refresh);
 const canvas=id('audio-wave');let start=null,moved=false;
 if(canvas){
  const coord=e=>Math.max(0,Math.min(1,(e.clientX-canvas.getBoundingClientRect().left)/Math.max(1,canvas.clientWidth)))*(w.buffer?.duration||0);
  canvas.addEventListener('pointerdown',e=>{if(!editor||!w.buffer||e.button!==0)return;start=coord(e);moved=false;canvas.setPointerCapture(e.pointerId);e.stopImmediatePropagation()},true);
  canvas.addEventListener('pointermove',e=>{if(start===null)return;if(Math.abs(coord(e)-start)>.04){moved=true;w.setSelection(start,coord(e))}e.stopImmediatePropagation()},true);
  canvas.addEventListener('pointerup',e=>{if(start===null)return;if(!moved)w.seek(coord(e));start=null;e.stopImmediatePropagation()},true);
 }
 syncEq();refresh();
}