/* PULSE dark UI enhancements; existing audio-engine modules remain authoritative. */
import {workspace as w} from './workspace.mjs';
import {editRegion,reverseBuffer,gainBuffer} from './dsp.mjs';
import {fadeBuffer,renderWithNodes} from './legacy-dsp.mjs';
import {convertBuffer,downloadConversion} from './converter.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],id=s=>document.getElementById(s);
const clock=t=>{t=Math.max(0,t||0);return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+Math.floor(t%1*10)};
const show=(message,error=false)=>{const node=id('pulse-redesign-status')||id('source-status');if(node){node.textContent=message;node.dataset.error=String(error)}};
const text=(i,v)=>{if(id(i))id(i).textContent=String(v)};
let editor=false,eqIndex=1,busy=false;
const eq=[
 {f:100,g:2,q:.8,type:'lowshelf'},
 {f:400,g:-3,q:1.4,type:'peaking'},
 {f:3000,g:2,q:1.2,type:'peaking'},
 {f:11000,g:1,q:.8,type:'highshelf'}
];
function refresh(){
 const b=w.buffer,sel=w.selection;
 text('pulse-current-name',b?w.displayName||w.name:'No track loaded');
 if(id('pulse-filechip'))id('pulse-filechip').hidden=!b;
 text('pulse-file-meta',b?clock(b.duration)+' · '+(b.sampleRate/1000).toFixed(1)+' kHz · '+(b.numberOfChannels>1?'stereo':'mono'):'Choose a file');
 text('pulse-editor-now',clock(w.position));text('pulse-editor-duration',clock(b?.duration));
 text('pulse-sel-start',sel?clock(sel.start):'—');text('pulse-sel-end',sel?clock(sel.end):'—');text('pulse-sel-length',sel?clock(sel.end-sel.start):'—');
 text('pulse-sel-tag',sel?clock(sel.end-sel.start)+' selected':'Drag to select');
 const play=id('pulse-editor-play');if(play){play.textContent=w.playing?'PAUSE':'PLAY';play.setAttribute('aria-label',w.playing?'Pause':'Play')}
 if(id('pulse-toolbar-undo'))id('pulse-toolbar-undo').disabled=!w.history.canUndo;
 if(id('pulse-toolbar-redo'))id('pulse-toolbar-redo').disabled=!w.history.canRedo;
 $$('[data-selection-edit]').forEach(x=>x.disabled=!sel||sel.end-sel.start<.01);
 if(id('pulse-export-btn'))id('pulse-export-btn').disabled=!b;
 $$('[data-editor-action]').forEach(button=>button.disabled=!b);
 $$('[data-editor-mode]').forEach(button=>button.disabled=!b);
 if(id('pulse-editor-play'))id('pulse-editor-play').disabled=!b;
 if(id('pulse-editor-loop'))id('pulse-editor-loop').setAttribute('aria-pressed',String(w.loopEnabled));
 if(id('pulse-editor-volume'))id('pulse-editor-volume').value=String(Math.round(w.volume*100));
 const hist=id('pulse-history-list');
 if(hist){hist.replaceChildren();const entries=[...w.history.undoEntries].reverse().slice(0,6);
  if(!entries.length){const li=document.createElement('li');li.textContent=b?'Track loaded · no edits yet':'Load a track to start editing';hist.append(li)}
  for(const entry of entries){const li=document.createElement('li'),name=document.createElement('span'),time=document.createElement('time');name.textContent=entry.label;const minutes=Math.floor((Date.now()-entry.createdAt)/60000);time.textContent=minutes?' '+minutes+'m ago':'just now';li.append(name,time);hist.append(li)}}
 const fmt=id('pulse-export-format')?.value||'wav',estimate=b?(fmt==='wav'?b.duration*b.sampleRate*b.numberOfChannels*2:fmt==='flac'?b.duration*b.sampleRate*b.numberOfChannels*1.2:b.duration*(fmt==='m4a'?192000:320000)/8):0;
 text('pulse-export-estimate',b?'~'+(estimate/1048576).toFixed(1)+' MB est.':'No audio');
}
function mode(on){
 editor=on;
 document.body.classList.toggle('pulse-editor-mode',on);
 for(const name of ['pulse-editor-controls','pulse-editor-export','pulse-editor-properties','pulse-editor-transport','pulse-editor-history']){
  const element=id(name);if(element)element.hidden=!on;
 }
 refresh();
 requestAnimationFrame(()=>w.drawWave());
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

const ROUTES=Object.freeze({
 'song-analyzer':'#/analyzer','music-tagger':'#/tagger','release-preflight':'#/release-preflight',
 'editor':'#/editor','wav':'#/converter','visualizer':'#/visualizer','audio-protection':'#/protection',
 'ai2-mastering':'#/ai','ai2-extraction':'#/ai/stems','ai2-lyrics':'#/ai/lyrics'
});
let currentTool='song-analyzer';
function pageTitle(idValue){
 const selected=document.querySelector('#tool-tabs .tool-tab.selected');
 let title=(selected?.textContent||'Song Analyzer').replace(/\s*↗\s*$/,'').trim();
 if(idValue==='song-analyzer')title='Song Analyzer';
 const labels=title.split(/\s+/),last=labels.pop(),head=labels.join(' ');
 const heading=id('toolkit-title');
 if(heading){heading.textContent='';if(head)heading.append(document.createTextNode(head+' '));const accent=document.createElement('span');accent.textContent=last+'.';heading.append(accent)}
 text('pulse-tool-crumb',title);
 const chip=id('pulse-tool-chip');
 if(chip)chip.textContent=idValue.startsWith('ai2-')?'LOCAL OR CLOUD · PER TOOL':'SHARED AUDIO WORKSPACE';
 document.title=title+' — PULSE Studio';
}
function navigateTool(toolId,{updateUrl=true,scroll=true}={}){
 currentTool=toolId||currentTool;
 document.body.classList.remove('pulse-home-view');
 document.body.classList.add('pulse-workspace-view');
 document.body.dataset.route='tool';
 mode(currentTool==='editor');
 pageTitle(currentTool);
 const group=currentTool==='editor'?'editor':currentTool==='wav'?'wav':currentTool==='visualizer'?'visualizer':currentTool==='audio-protection'?'audio-protection':currentTool.startsWith('ai2-')?'ai2-mastering':'song-analyzer';
 $$('.header-nav [data-open-tool]').forEach(link=>{
  const active=link.dataset.openTool===group;
  link.classList.toggle('is-active',active);
  if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
 });
 const desired=ROUTES[currentTool]||'#/tool/'+encodeURIComponent(currentTool);
 if(updateUrl&&location.hash!==desired)history.pushState(null,'',desired);
 requestAnimationFrame(()=>{w.drawWave();if(scroll)id('toolkit')?.scrollIntoView({block:'start',behavior:'auto'});});
}
function navigateHome({updateUrl=true,scroll=true}={}){
 document.body.classList.add('pulse-home-view');
 document.body.classList.remove('pulse-workspace-view','pulse-editor-mode');
 document.body.dataset.route='home';
 if(updateUrl&&location.hash!=='#/home')history.pushState(null,'','#/home');
 document.title='PULSE Studio — Find your rhythm';
 $$('.header-nav [data-open-tool]').forEach(link=>{
  link.classList.remove('is-active');link.removeAttribute('aria-current');
 });
 if(scroll)window.scrollTo({top:0,behavior:'auto'});
}
function handleDeepLink(){
 const hash=decodeURIComponent(location.hash||'');
 if(!hash||hash==='#/home'){navigateHome({updateUrl:false});return}
 if(['#top','#pulse-tool-directory','#how-it-works'].includes(hash)){navigateHome({updateUrl:false,scroll:false});return;}
 const tool=Object.entries(ROUTES).find(([,route])=>route===hash)?.[0]||
  (hash.startsWith('#/tool/')?hash.slice(7):null);
 if(tool){
  const target=document.querySelector('[data-open-tool="'+CSS.escape(tool)+'"]');
  if(target){target.click();return}
  const tab=document.querySelector('#tool-tabs [data-tool="'+CSS.escape(tool)+'"]');
  if(tab){tab.click();return}
 }
 if(hash==='#toolkit')navigateTool(currentTool,{updateUrl:false});
}
export function initializeStudioRedesign(){
 document.documentElement.setAttribute('data-theme','dark');
 const input=id('audio-file'),drop=id('pulse-hero-drop');
 const openSource=()=>input?.click();
 document.querySelectorAll('[data-open-audio]').forEach(button=>button.addEventListener('click',event=>{
  event.preventDefault();openSource();
 }));
 const load=async file=>{
  if(!file)return;
  try{await w.load(file);if(document.body.classList.contains('pulse-home-view'))navigateTool('song-analyzer');show('Track loaded in SOURCE AUDIO: '+file.name);}
  catch(error){show(error?.message||'Could not load audio.',true)}
 };
 if(drop){
  for(const type of ['dragover','dragenter'])drop.addEventListener(type,event=>{
   event.preventDefault();drop.classList.add('is-dragging');
  });
  for(const type of ['drop','dragleave'])drop.addEventListener(type,event=>{
   event.preventDefault();drop.classList.remove('is-dragging');
  });
  drop.addEventListener('drop',event=>void load(event.dataTransfer?.files?.[0]));
 }
 const strip=id('pulse-wave-strip');
 if(strip&&!strip.childElementCount)for(let i=0;i<90;i++){
  const bar=document.createElement('i');
  bar.style.setProperty('--height',Math.round(18+Math.abs(Math.sin(i*.42)*Math.cos(i*.13))*75)+'%');
  strip.append(bar);
 }
 $$('.pulse-tool-filter').forEach(button=>button.addEventListener('click',()=>{
  const f=button.dataset.filter;
  $$('.pulse-tool-filter').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  $$('.pulse-tool-card').forEach(card=>card.dataset.hidden=String(f!=='all'&&card.dataset.kind!==f));
 }));
 document.addEventListener('pulse:tool-mounted',event=>{
  const idValue=event.detail?.id||$('.tool-tabs .tool-tab.selected')?.dataset.tool;
  if(idValue)navigateTool(idValue);
 });
 document.addEventListener('click',event=>{
  if(!event.target.closest('[data-go-home]'))return;
  event.preventDefault();navigateHome();
 });
 window.addEventListener('popstate',handleDeepLink);
 window.addEventListener('hashchange',handleDeepLink);
 w.subscribe((snapshot,reason)=>{
  if(reason==='position')text('pulse-editor-now',clock(snapshot.position));
  else refresh();
  if(reason==='load'&&document.body.classList.contains('pulse-home-view')){
   const description=id('pulse-drop-description');if(description)description.textContent='Loaded '+(w.displayName||w.name)+' · ready in SOURCE AUDIO';
   navigateTool('song-analyzer');
  }
  if(reason==='clear'){
   const description=id('pulse-drop-description');if(description)description.textContent='or click to browse · one shared SOURCE AUDIO for all tools';
  }
  if(reason==='transport'){
   const button=id('pulse-editor-play');
   if(button){button.textContent=w.playing?'PAUSE':'PLAY';button.setAttribute('aria-label',w.playing?'Pause':'Play')}
  }
 });
 id('pulse-toolbar-undo')?.addEventListener('click',()=>w.undo());
 id('pulse-toolbar-redo')?.addEventListener('click',()=>w.redo());
 id('pulse-editor-replace')?.addEventListener('click',()=>input?.click());
 id('pulse-editor-play')?.addEventListener('click',()=>void w.togglePlay().catch(error=>show(error.message,true)));
 id('pulse-editor-start')?.addEventListener('click',()=>w.seek(0));
 id('pulse-toolbar-zoom-in')?.addEventListener('click',()=>id('source-zoomin')?.click());
 id('pulse-toolbar-zoom-out')?.addEventListener('click',()=>id('source-zoomout')?.click());
 id('pulse-editor-loop')?.addEventListener('click',event=>{
  const on=event.currentTarget.getAttribute('aria-pressed')!=='true';
  event.currentTarget.setAttribute('aria-pressed',String(on));w.setLoopEnabled(on);
 });
 id('pulse-editor-volume')?.addEventListener('input',event=>w.setVolume(Number(event.target.value)/100));
 $('[data-editor-mode]').forEach(button=>button.addEventListener('click',()=>{
  $('[data-editor-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  if(button.dataset.editorMode==='gain')id('pulse-gain')?.focus();
 }));
 $('[data-editor-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.editorAction;
  if(action==='merge'){document.querySelector('#module-editor [data-edit-mode="merge"]')?.click();document.querySelector('#module-editor [data-focus-action="merge"]')?.click();return;}
  void edit(action);
 }));
 id('pulse-selection-trim')?.addEventListener('click',()=>void edit('trim'));
 id('pulse-selection-cut')?.addEventListener('click',()=>void edit('cut'));
 for(const [inputId,output,unit] of [
  ['pulse-fade-in','pulse-fade-in-label',' s'],['pulse-fade-out','pulse-fade-out-label',' s'],
  ['pulse-gain','pulse-gain-label',' dB']
 ])id(inputId)?.addEventListener('input',()=>{
  const value=Number(id(inputId).value);
  text(output,(inputId==='pulse-gain'&&value>0?'+':'')+value.toFixed(1)+unit);
 });
 $$('[data-band]').forEach(button=>button.addEventListener('click',()=>{
  eqIndex=Number(button.dataset.band);syncEq();
 }));
 for(const field of ['pulse-eq-frequency','pulse-eq-gain','pulse-eq-q']){
  id(field)?.addEventListener('input',()=>{
   eq[eqIndex].f=Math.round(20*Math.pow(1000,id('pulse-eq-frequency').value/1000));
   eq[eqIndex].g=Number(id('pulse-eq-gain').value);
   eq[eqIndex].q=Number(id('pulse-eq-q').value);
   drawEq();
  });
 }
 id('pulse-eq-apply')?.addEventListener('click',()=>void applyEq());
 id('pulse-export-btn')?.addEventListener('click',()=>void exportAudio());
 id('pulse-export-format')?.addEventListener('change',refresh);
 const canvas=id('audio-wave');let gesture=null;
 if(canvas){
  const coord=event=>w.waveCoordinate(event.clientX-canvas.getBoundingClientRect().left,canvas.clientWidth);
  const xForTime=t=>{const v=w.getWaveViewport();return (t-v.view)/Math.max(.001,v.visible)*canvas.clientWidth;};
  canvas.addEventListener('pointerdown',event=>{
   if(!editor||!w.buffer||event.button!==0)return;
   const at=coord(event),x=event.clientX-canvas.getBoundingClientRect().left,sel=w.selection;
   const left=sel?Math.abs(x-xForTime(sel.start)):Infinity,right=sel?Math.abs(x-xForTime(sel.end)):Infinity;
   const handle=left<15&&left<=right?'start':right<15?'end':'new';
   gesture={anchor:at,handle,moved:false,start:sel?.start??at,end:sel?.end??at};
   canvas.setPointerCapture(event.pointerId);event.stopImmediatePropagation();
  },true);
  canvas.addEventListener('pointermove',event=>{
   if(!gesture)return;const at=coord(event);
   if(Math.abs(at-gesture.anchor)>.025)gesture.moved=true;
   if(gesture.moved){
    if(gesture.handle==='start')w.setSelection(Math.min(at,gesture.end),gesture.end);
    else if(gesture.handle==='end')w.setSelection(gesture.start,Math.max(at,gesture.start));
    else w.setSelection(gesture.anchor,at);
   }
   event.stopImmediatePropagation();
  },true);
  canvas.addEventListener('pointerup',event=>{
   if(!gesture)return;
   if(!gesture.moved&&gesture.handle==='new')w.seek(coord(event));
   gesture=null;event.stopImmediatePropagation();
  },true);
  canvas.addEventListener('pointercancel',()=>{gesture=null},true);
 }
 syncEq();refresh();
 if(location.hash&&location.hash!=='#/home')handleDeepLink();
 else navigateHome({updateUrl:false});
}
