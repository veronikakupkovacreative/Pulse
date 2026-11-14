/* Exact HTML adapter: real shared workspace and existing production tool modules.
 * The uploaded HTML owns layout. No synthetic tracks, timers or fake analysis results.
 */
import {workspace as w} from './workspace.mjs';
import {editRegion,reverseBuffer,gainBuffer} from './dsp.mjs';
import {fadeBuffer,renderWithNodes} from './legacy-dsp.mjs';
import {convertBuffer,downloadConversion} from './converter.mjs';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const format=t=>{t=Math.max(0,Number(t)||0);return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')};
const tools={analyzer:'song-analyzer',tagger:'music-tagger',editor:'editor',converter:'wav',visualizer:'visualizer'};
const groups=[
 ['Master & mix',[['mastering','ai2-mastering','AI Mastering'],['mix','ai2-mix','Mix Assistant'],['stereo','ai2-stereo','Stereo Lab']]],
 ['Voice & stems',[['vocal','ai2-vocals','Vocal Studio'],['stems','ai2-extraction','Stem Extraction'],['repair','ai2-repair','Audio Repair']]],
 ['Creative',[['beat','ai2-beat','Beat Lab'],['fx','ai2-fx','Smart FX'],['pitch','ai2-pitch','Pitch & Time']]],
 ['Generate & clean',[['lyrics','ai2-lyrics','Lyrics Generator'],['music','ai2-musicai','AI Music Generator'],['watermark','ai2-watermark','Watermark Cleaner']]]
];
const aiMap=new Map(groups.flatMap(([g,items])=>items.map(([slug,id,label])=>[slug,{id,label,g}])));
const say=(message,error=false)=>{let n=$('#pulse-exact-status');if(n){n.hidden=false;n.textContent=message;n.dataset.error=String(error);}const old=$('#source-status');if(old)old.textContent=message;};
const busy={value:false};
let current='',analysisTrack=null,eqSelected=1,activeAI=null;
const eq=[{type:'lowshelf',f:80,g:3,q:1},{type:'peaking',f:400,g:-4,q:1.4},{type:'peaking',f:3000,g:2.5,q:1.2},{type:'highshelf',f:10000,g:4,q:.8}];
function selectModule(id){
 const tab=()=>$('#tool-tabs [data-tool="'+CSS.escape(id)+'"]');
 if(!tab()){
  const all=$$('#pulse-legacy-host [data-category]');
  const category=id==='song-analyzer'||id==='music-tagger'||id==='ai2-beat'?'analyze':
   id==='editor'||id==='wav'||id==='ai2-mastering'||id==='ai2-watermark'?'prepare':'create';
  all.find(b=>b.dataset.category===category)?.click();
 }
 const t=tab();if(!t){say('This feature is not available in the current PULSE build.',true);return false}
 if(t.getAttribute('aria-selected')!=='true')t.click();
 return true;
}
function sectionFor(){
 const path=decodeURIComponent(location.hash||'#/home').replace(/^#\/?/,'').split('/');
 if(path[0]==='ai'&&path[1])return ['ai-tool',aiMap.get(path[1])||null];
 return [['home','analyzer','tagger','editor','converter','ai','visualizer'].includes(path[0])?path[0]:'home',null];
}
function relocate(){
 const [view,info]=sectionFor();const panel=$('#tool-panel'),old=$('#pulse-legacy-host');
 if(!panel||!old)return;
 const target=view==='analyzer'?'#pulse-analyzer-module':
  view==='tagger'?'#pulse-tagger-module':
  view==='visualizer'?'#pulse-visualizer-module':
  view==='ai-tool'?'#pulse-ai-module':null;
 const slot=target?$(target):null;
 if(slot&&panel.parentElement!==slot)slot.append(panel);
 else if(!slot&&panel.parentElement!==old)old.append(panel);
 // The original library UI lives inside its module panel, never inside a fake form.
 for(const node of $$('#tool-panel .tool-module-host'))node.hidden=false;
 if(view==='editor')$('#pulse-editor-controls')?.removeAttribute('hidden');
 if(view==='analyzer')updateAnalyzer();
}
function navigate(){
 const [view,ai]=sectionFor();
 if(view==='ai-tool'&&!ai){location.hash='#/ai';return}
 for(const el of $$('#pulse-proto-root .view'))el.hidden=el.dataset.view!==view;
 for(const a of $$('[data-nav]')){
  const hit=a.dataset.nav===(view==='tagger'?'analyzer':view==='ai-tool'?'ai':view);
  if(hit)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');
 }
 if(view==='ai-tool'){
  activeAI=ai;$('#ai-crumb').textContent=ai.label;$('#ai-title').textContent=ai.label;
  $('#ai-desc').textContent='Real PULSE processing controls and results.';
  $('#ai-tag').textContent='PULSE ENGINE';
 }
 if(view==='editor'||view==='analyzer'||view==='tagger'||view==='visualizer'||view==='ai-tool'){
  selectModule(view==='ai-tool'?ai.id:tools[view]);
 }
 relocate();render();
}
function load(file){
 if(!file)return Promise.resolve();
 return w.load(file).then(()=>{analysisTrack=null;location.hash='#/analyzer';navigate();say('Source audio loaded: '+file.name)}).catch(e=>say(e.message||'Audio could not be decoded.',true));
}
function openFile(){const input=$('#audio-file');if(input)input.click();else say('The audio file picker is unavailable.',true);}
function updateAnalyzer(){
 syncAnalyzer();
}
function syncAnalyzer(){
 const source=$('#module-song-analyzer');if(!source)return;
 const get=k=>$('[data-focus="'+k+'"]',source)?.textContent?.trim()||'—';
 for(const [attr,k] of [['bpm','bpm'],['key','key'],['camelot','camelot'],['confidence','rhythm-confidence']])
  for(const el of $$('[data-live-'+attr+']'))el.textContent=get(k);
 const status=$('#an-live-status');if(status)status.textContent=$('[data-focus-status]',source)?.textContent?.trim()||'Run analysis to measure this track.';
 const chords=$('#live-chords');if(chords){
  const values=$$('.focus-chord-row strong',source).map(e=>e.textContent.trim()).filter(Boolean).slice(0,16);
  const signature=values.join('|');if(chords.dataset.values!==signature){chords.dataset.values=signature;chords.replaceChildren();
   for(const value of values.length?values:['—']){const el=document.createElement('span');el.textContent=value;chords.append(el)}
  }
 }
 drawWaveform($('#bg'),0,true);
}
function runAnalysis(){
 if(!w.buffer)return openFile();
 selectModule('song-analyzer');
 const b=$('#module-song-analyzer [data-focus-action="analyze"]');
 if(b&&!b.disabled){analysisTrack=w.trackId;b.click();say('Analyzing source audio…');}
 else say('Analyzer is loading or already running.',true);
}
function drawWaveform(svg,channel=0,beats=false){
 if(!svg)return;svg.replaceChildren();const b=w.buffer;if(!b)return;
 const arr=b.getChannelData(Math.min(channel,b.numberOfChannels-1)),ns='http://www.w3.org/2000/svg';
 const samples=220,chunk=Math.max(1,Math.floor(arr.length/samples));
 for(let i=0;i<samples;i++){
  const start=i*chunk,end=Math.min(arr.length,start+chunk),step=Math.max(1,Math.floor((end-start)/100));let peak=0;
  for(let j=start;j<end;j+=step)peak=Math.max(peak,Math.abs(arr[j]));
  const h=Math.max(1,Math.min(96,peak*94)),r=document.createElementNS(ns,'rect');
  for(const [k,v] of Object.entries({x:i,y:(100-h)/2,width:.68,height:h}))r.setAttribute(k,String(v));svg.append(r);
 }
 if(beats)for(let i=0;i<w.markers.length&&i<1000;i++){
  const x=220*w.markers[i]/b.duration,l=document.createElementNS(ns,'line');
  for(const [k,v] of Object.entries({x1:x,x2:x,y1:0,y2:100}))l.setAttribute(k,String(v));
  if(i%4===0)l.setAttribute('class','bar');svg.append(l);
 }
}
function editorDisplay(){
 const b=w.buffer;if(!b)return;
 drawWaveform($('#wl'));drawWaveform($('#wr'),1);
 const ruler=$('.ruler',$('[data-view="editor"]'));
 if(ruler)ruler.replaceChildren(...Array.from({length:8},(_,i)=>{let s=document.createElement('span');s.textContent=format(b.duration*i/7);return s}));
 const range=$('.selection',$('[data-view="editor"]'));
 if(range){const s=w.selection;range.hidden=!s;
  if(s){range.style.left=(100*s.start/b.duration)+'%';range.style.width=(100*(s.end-s.start)/b.duration)+'%';
   const tag=$('.selection__tag',range);if(tag)tag.textContent=(s.end-s.start).toFixed(2)+' s';}
 }
 const ph=$('#playhead');if(ph)ph.style.left=(100*w.position/b.duration)+'%';
 $('#now').textContent=format(w.position);
 const total=$('.time small',$('[data-view="editor"]'));if(total)total.textContent='/ '+format(b.duration);
 const playing=$('#play');if(playing){playing.textContent=w.playing?'❚❚':'▶';playing.setAttribute('aria-label',w.playing?'Pause':'Play')}
 const loop=$('#loopbtn');if(loop)loop.setAttribute('aria-pressed',String(w.loopEnabled));
 const kv=$$('.kv b',$('[data-view="editor"]'));
 if(kv.length===3){kv[0].textContent=w.selection?format(w.selection.start):'—';kv[1].textContent=w.selection?format(w.selection.end):'—';kv[2].textContent=w.selection?(w.selection.end-w.selection.start).toFixed(2)+' s':'—';}
 const items=$$('.history li',$('[data-view="editor"]'));if(items.length){const history=$('.history',$('[data-view="editor"]'));history.replaceChildren();
  for(const entry of [...w.history.undoEntries].reverse().slice(0,8)){
   const li=document.createElement('li'),label=document.createElement('span');label.textContent=entry.label;li.append(label);history.append(li);
  }
  if(!history.children.length){let li=document.createElement('li');li.textContent='Source audio loaded · no edits yet';history.append(li)}
 }
 const toolbar=$$('.toolbar .tool',$('[data-view="editor"]'));if(toolbar[0])toolbar[0].disabled=!w.history.canUndo;if(toolbar[1])toolbar[1].disabled=!w.history.canRedo;
}
function updateEq(){
 const W=400,mid=75,fx=f=>W*Math.log(f/20)/Math.log(1000),gy=g=>mid-g*mid/14;
 const grid=$('#eqgrid'),curve=$('#curve'),nodes=$('#nodes');if(!grid||!curve||!nodes)return;
 grid.replaceChildren();for(const f of [20,100,1000,10000]){
  const x=fx(f),line=document.createElementNS('http://www.w3.org/2000/svg','line');
  for(const [k,v] of Object.entries({x1:x,x2:x,y1:0,y2:150}))line.setAttribute(k,String(v));line.setAttribute('class','gridline');grid.append(line);
 }
 const points=[];for(let x=0;x<=W;x+=4){let gain=0;for(const b of eq)gain+=b.g*Math.exp(-Math.pow((x-fx(b.f))/(W/5.5/b.q),2));points.push('L'+x+','+gy(Math.max(-13,Math.min(13,gain))).toFixed(1))}
 curve.setAttribute('d','M0,75 '+points.join(' ')+' L400,75 Z');nodes.replaceChildren();
 for(const [i,b] of eq.entries()){const node=document.createElementNS('http://www.w3.org/2000/svg','circle');
  for(const [k,v] of Object.entries({cx:fx(b.f),cy:gy(b.g),r:i===eqSelected?7:5.5}))node.setAttribute(k,String(v));
  node.setAttribute('class','node'+(i===eqSelected?' is-active':''));nodes.append(node)}
 const b=eq[eqSelected];$('#ef').value=Math.round(1000*Math.log(b.f/20)/Math.log(1000));$('#eg').value=b.g;$('#eqq').value=b.q;
 $('#efO').textContent=b.f>=1000?(b.f/1000).toFixed(1)+' kHz':Math.round(b.f)+' Hz';
 $('#egO').textContent=(b.g>0?'+':'')+b.g.toFixed(1)+' dB';$('#eqO').textContent=b.q.toFixed(1);
 for(const el of $$('.bands [data-b]'))el.setAttribute('aria-pressed',String(Number(el.dataset.b)===eqSelected));
}
async function operation(name){
 if(busy.value)return;if(!w.buffer)return openFile();busy.value=true;
 try{
  const b=w.buffer,s=w.selection;
  const region=()=>{if(!s||s.end-s.start<.01)throw Error('Drag on the waveform to select an audio range.');return s};
  let out;
  if(name==='trim'||name==='cut'){const r=region();out=editRegion(b,r.start,r.end,name)}
  else if(name==='reverse')out=reverseBuffer(b);
  else if(name==='gain')out=gainBuffer(b,+$('#gn').value);
  else if(name==='fade-in'||name==='fade-out')out=fadeBuffer(b,+$('#'+(name==='fade-in'?'fi':'fo')).value,name==='fade-in'?'in':'out');
  else if(name==='eq')out=await renderWithNodes(b,eq.map(x=>({type:x.type,frequency:x.f,gain:x.g,q:x.q})));
  else if(name==='merge'){const control=$('#module-editor [data-edit-mode="merge"]');if(control){control.click();$('#module-editor [data-focus-action="merge"]')?.click();return}throw Error('Open the editor merge controls to add a second clip.')}
  else return;
  if(b!==w.buffer)throw Error('Source audio changed during processing.');
  w.commit(out,'Audio Editor: '+name);say('Applied '+name+'. Undo available.');
 }catch(e){say(e.message||'Audio processing failed.',true)}finally{busy.value=false}
}
async function exportAudio(format,button){
 if(!w.buffer)return openFile();if(busy.value)return;busy.value=true;if(button)button.disabled=true;
 try{
  const settings={format,bitDepth:16,bitrate:format==='m4a'?192:320,sampleRate:'original'};
  const blob=await convertBuffer(w.buffer,settings,m=>say(m));
  downloadConversion(blob,$('.exportbar .input')?.value||w.name,format);say('Real '+format.toUpperCase()+' audio exported.');
 }catch(e){say(e.message||'Export failed.',true)}finally{busy.value=false;if(button)button.disabled=false}
}
function render(){
 const b=w.buffer;document.body.dataset.track=b?'loaded':'none';
 for(const name of $$('[data-live-file]'))name.textContent=b?(w.displayName||w.name):'No audio loaded';
 for(const meta of $$('[data-live-meta]'))meta.textContent=b?format(b.duration)+' · '+(b.sampleRate/1000).toFixed(1)+' kHz · '+(b.numberOfChannels===2?'stereo':'mono'):'Choose a file';
 const currentView=sectionFor()[0];if(currentView==='editor')editorDisplay();if(currentView==='analyzer')syncAnalyzer();
 if(b){
  const converter=$('[data-view="converter"] .files');if(converter){converter.innerHTML='';const p=document.createElement('p');p.textContent=w.displayName+' · '+format(b.duration)+' · '+b.sampleRate+' Hz';converter.append(p)}
  const action=$('#cgo');if(action)action.textContent='Convert SOURCE AUDIO';
 }
 const empty=$('[data-view="home"] .dropzone__hint');if(empty)empty.textContent=b?'Loaded '+(w.displayName||w.name):'or click to browse · stays on your device';
}
function makeStatus(){
 const el=document.createElement('p');el.id='pulse-exact-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.style.cssText='position:fixed;bottom:18px;left:18px;z-index:1000;max-width:min(540px,calc(100vw - 36px));padding:12px 18px;background:#19191b;border:1px solid #48484c;border-radius:10px;color:#f4f2ee;font:13px Inter,Arial,sans-serif;pointer-events:none';
 el.hidden=true;document.body.append(el);return el;
}
function initToolUI(){
 // Replace all fake data and prototype actions, but preserve their exact visual containers.
 for(const area of $$('[data-slot="chip"]')){
  area.outerHTML='<div class="filechip when-loaded"><i class="dot"></i><b data-live-file>—</b><span data-live-meta>—</span><button class="btn btn--sm" type="button" data-open-audio>Replace</button></div>';
 }
 for(const area of $$('[data-slot="empty"]')){
  const message=area.dataset.msg||'Choose source audio to begin.';
  area.outerHTML='<div class="empty when-empty"><div class="dropzone__icon">+</div><h2>No track loaded yet</h2><p>'+message+'</p><button class="btn btn--primary" type="button" data-open-audio>Load audio</button></div>';
 }
 // Analyzer figures are fed from actual DOM outputs, never prototype constants.
 const metrics=$$('.metric',$('[data-view="analyzer"]'));
 for(const [i,k] of ['bpm','key','camelot'].entries())if(metrics[i])metrics[i].querySelector('b').outerHTML='<b data-live-'+k+'>—</b>';
 if(metrics[0])metrics[0].querySelector('small').outerHTML='<small data-live-confidence>Awaiting analysis</small>';
 const status=$('#an-run');if(status)status.outerHTML='<p class="note" id="an-live-status" role="status">Run analysis to measure your audio.</p>';
 const chords=$('.chords',$('[data-view="analyzer"]'));if(chords){chords.id='live-chords';chords.innerHTML='<span>—</span>'}
 for(const page of ['analyzer','tagger','ai-tool','visualizer']){
  const el=$('[data-view="'+page+'"]');if(!el)continue;
  let host=document.createElement('div');host.id='pulse-'+(page==='ai-tool'?'ai':page)+'-module';host.className='pulse-exact-real when-loaded';
  if(page==='analyzer')el.querySelector('.when-loaded .stack')?.append(host);
  else if(page==='tagger')el.querySelector('.when-loaded')?.replaceWith(host);
  else if(page==='ai-tool')el.querySelector('.when-loaded')?.replaceWith(host);
  else if(page==='visualizer')el.querySelector('.when-loaded')?.replaceWith(host);
 }
 // Retain approved AI hub grouping, wire cards to the real tool modules.
 const hub=$('#ai-groups');if(hub){hub.replaceChildren();
  for(const [title,items] of groups){const grp=document.createElement('div');grp.className='group';
   grp.innerHTML='<h2>'+title+' <small>'+items.length+' tools</small></h2>';
   const grid=document.createElement('div');grid.className='grid';
   for(const [slug,id,label] of items){
    const card=document.createElement('a');card.className='card card--tool';card.href='#/ai/'+slug;card.dataset.openTool=id;
    card.innerHTML='<div class="card__top"><span class="card__num">AI STUDIO</span><span class="tag tag--'+(['ai2-mastering','ai2-stereo','ai2-mix','ai2-beat','ai2-pitch','ai2-watermark'].includes(id)?'local':'cloud')+'">'+(['ai2-mastering','ai2-stereo','ai2-mix','ai2-beat','ai2-pitch','ai2-watermark'].includes(id)?'Local':'Local / cloud')+'</span></div><h3>'+label+'</h3><p>Open the real PULSE audio processing controls and results.</p><span class="card__link">Open '+label+'</span>';
    grid.append(card);
   }grp.append(grid);hub.append(grp);
  }
 }
 // Display only factual source audio in converter, never the two fake demo files.
 const files=$('[data-view="converter"] .files');if(files)files.replaceChildren();
 for(const action of $$('[data-view="editor"] [data-toast]'))action.removeAttribute('data-toast');
 const editor=$('[data-view="editor"]');
 if(editor){editor.querySelector('.stage__history .history')?.replaceChildren();
  editor.querySelector('.exportbar .input')?.setAttribute('value','pulse-edit');
  const eqParent=editor.querySelector('details:has(#eqgrid) .details__body');
  if(eqParent){const apply=document.createElement('button');apply.className='btn btn--primary';apply.type='button';apply.id='pulse-exact-eq-apply';apply.textContent='Apply EQ';eqParent.append(apply)}
 }
}
export function initializePrototypeRuntime(){
 if(!$('#pulse-proto-root'))return;
 // CSS was supplied by the user. It takes precedence over historical module styles.
 const style=$('#pulse-exact-style');if(style)document.head.append(style);
 initToolUI();makeStatus();updateEq();
 // Historical navigation handlers must not turn clicking the exact UI into the old shell.
 document.addEventListener('click',e=>{
  const link=e.target.closest('#pulse-proto-root [data-open-tool]');if(!link)return;
  e.preventDefault();e.stopImmediatePropagation();
  const ref=link.getAttribute('href');if(ref?.startsWith('#/')){location.hash=ref;navigate()}
  else {const id=link.dataset.openTool;selectModule(id);location.hash='#/ai/'+([...aiMap.entries()].find(([,v])=>v.id===id)?.[0]||'mastering');navigate()}
 },true);
 document.addEventListener('click',e=>{
  const trigger=e.target.closest('#pulse-proto-root [data-load],#pulse-proto-root [data-unload],#pulse-proto-root [data-open-audio]');
  if(trigger){e.preventDefault();e.stopImmediatePropagation();openFile();return}
  const item=e.target.closest('#pulse-proto-root [data-scroll]');if(item){document.getElementById(item.dataset.scroll)?.scrollIntoView({behavior:'smooth'});return}
  const toast=e.target.closest('#pulse-proto-root [data-toast]');if(toast){e.preventDefault();say('This action is only available through a live PULSE tool.',true)}
 },true);
 // AudioWorkspace owns the single file input handler; subscribing to its load avoids a second decode.
 const drop=$('#drop');if(drop){
  for(const type of ['dragover','dragenter'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('is-dragover')});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('is-dragover')});
  drop.addEventListener('drop',e=>{const file=e.dataTransfer.files?.[0];if(file)void load(file)});
 }
 // Filtering cards is interactive but never changes the audio source.
 for(const button of $$('#filters .chip'))button.addEventListener('click',()=>{
  for(const b of $$('#filters .chip'))b.setAttribute('aria-pressed',String(b===button));
  for(const card of $$('#toolgrid .card'))card.hidden=button.dataset.f!=='all'&&card.dataset.cat!==button.dataset.f;
 });
 const rerun=$('#an-rerun');if(rerun)rerun.addEventListener('click',runAnalysis);
 const report=$('[data-view="analyzer"] [data-toast*="Report"]');if(report){report.removeAttribute('data-toast');report.addEventListener('click',()=>{
  if(!w.buffer)return openFile();
  const payload={name:w.displayName,bpm:$('[data-live-bpm]')?.textContent,key:$('[data-live-key]')?.textContent,camelot:$('[data-live-camelot]')?.textContent,beats:w.markers};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});downloadBlob(blob,'pulse-analysis.json');
 });}
 for(const ctrl of $$('.toolbar .tool')){
  const key=ctrl.getAttribute('aria-label')||ctrl.textContent.trim().split(/\s/)[0];
  ctrl.removeAttribute('data-toast');
  ctrl.addEventListener('click',()=>{
   if(key==='Undo')return w.undo();if(key==='Redo')return w.redo();
   if(key==='Zoom in'||key==='+')return w.setWaveViewport(Math.min(16,w.getWaveViewport().zoom*2),w.getWaveViewport().view);
   if(key==='Zoom out'||key==='−')return w.setWaveViewport(Math.max(1,w.getWaveViewport().zoom/2),w.getWaveViewport().view);
   if(key==='Trim'||key==='Cut'||key==='Reverse'||key==='Gain'||key==='Fade in'||key==='Fade out'||key==='Merge')void operation({'Trim':'trim','Cut':'cut','Reverse':'reverse','Gain':'gain','Fade in':'fade-in','Fade out':'fade-out','Merge':'merge'}[key]);
  });
 }
 const selectionTools=$$('.details__body .row .btn',$('[data-view="editor"]'));if(selectionTools[0])selectionTools[0].addEventListener('click',()=>void operation('trim'));if(selectionTools[1])selectionTools[1].addEventListener('click',()=>void operation('cut'));
 $('#pulse-exact-eq-apply')?.addEventListener('click',()=>void operation('eq'));
 for(const [id,out,unit] of [['fi','fiO',' s'],['fo','foO',' s'],['gn','gnO',' dB']])$('#'+id)?.addEventListener('input',e=>$('#'+out).textContent=(id==='gn'&&Number(e.target.value)>0?'+':'')+Number(e.target.value).toFixed(1)+unit);
 for(const node of $$('.bands [data-b]'))node.addEventListener('click',()=>{eqSelected=+node.dataset.b;updateEq()});
 for(const key of ['ef','eg','eqq'])$('#'+key)?.addEventListener('input',()=>{
  eq[eqSelected].f=20*Math.pow(1000,$('#ef').value/1000);eq[eqSelected].g=+$('#eg').value;eq[eqSelected].q=+$('#eqq').value;updateEq()
 });
 $('#play')?.addEventListener('click',()=>void w.togglePlay().catch(e=>say(e.message,true)));
 $('#loopbtn')?.addEventListener('click',()=>w.setLoopEnabled(!w.loopEnabled));
 $('.vol input',$('[data-view="editor"]'))?.addEventListener('input',e=>w.setVolume(+e.target.value/100));
 const transport=$$('.transport .tbtn',$('[data-view="editor"]'));if(transport[0])transport[0].addEventListener('click',()=>w.seek(0));
 let drag=null;const wrap=$('.wave-wrap',$('[data-view="editor"]'));
 if(wrap){
  wrap.addEventListener('pointerdown',e=>{if(!w.buffer)return;const r=wrap.getBoundingClientRect(),v=w.getWaveViewport(),t=v.view+(e.clientX-r.left)/r.width*v.visible;
   drag=t;wrap.setPointerCapture(e.pointerId);w.setSelection(t,t)});
  wrap.addEventListener('pointermove',e=>{if(drag===null||!w.buffer)return;const r=wrap.getBoundingClientRect(),v=w.getWaveViewport(),t=v.view+(e.clientX-r.left)/r.width*v.visible;w.setSelection(drag,t)});
  wrap.addEventListener('pointerup',()=>drag=null);wrap.addEventListener('pointercancel',()=>drag=null);
 }
 const editorExport=$('[data-view="editor"] .exportbar .btn--primary');
 if(editorExport){editorExport.removeAttribute('data-toast');editorExport.addEventListener('click',()=>void exportAudio($('input[name="efmt"]:checked')?.value||'wav',editorExport))}
 $('#cgo')?.addEventListener('click',async e=>{
  const btn=e.currentTarget,format=$('input[name="cf"]:checked')?.value||'mp3';
  if(!w.buffer)return openFile();if(busy.value)return;busy.value=true;btn.disabled=true;
  const prog=$('#cprog');if(prog)prog.hidden=false;
  try{
   const blob=await convertBuffer(w.buffer,{format,bitrate:parseInt($('#cbr').value,10),sampleRate:parseFloat($('#csr').value)*1000,bitDepth:16},m=>say(m),p=>{if($('#cpct'))$('#cpct').textContent=p+'%';if($('#cbar'))$('#cbar').style.width=p+'%'});
   downloadConversion(blob,w.name,format);say('Real '+format.toUpperCase()+' conversion complete.');$('#cmsg').textContent='File downloaded.';
  }catch(err){say(err.message,true)}finally{busy.value=false;btn.disabled=false}
 });
 for(const input of $$('input[name="cf"]'))input.addEventListener('change',()=>{
  const val=$('input[name="cf"]:checked')?.value||'mp3';$('#cbr-wrap').hidden=val==='wav'||val==='flac';
 });
 $('#cest').textContent='Uses the shared SOURCE AUDIO; conversion runs locally.';
 // Do not falsely offer extra uploaded files or a pretend ZIP.
 const fake=$('[data-view="converter"] .row');if(fake)fake.remove();
 $('#cdone')?.remove();
 const moduleObserver=new MutationObserver(()=>syncAnalyzer());
 document.addEventListener('pulse:tool-mounted',()=>queueMicrotask(()=>{relocate();syncAnalyzer()}));
 document.addEventListener('pulse:workspace-change',e=>{
  if(e.detail?.reason==='load'){analysisTrack=null;if(sectionFor()[0]==='home')location.hash='#/analyzer';}render();
 });
 window.addEventListener('hashchange',navigate);window.addEventListener('popstate',navigate);
 w.subscribe((_,reason)=>{if(reason==='position'){if(sectionFor()[0]==='editor')editorDisplay();return}render()});
 // Watch analyzer results without observing/re-rendering the whole root.
 function watch(){const src=$('#module-song-analyzer');if(src&&src!==moduleObserver.node){
  moduleObserver.disconnect();moduleObserver.observe(src,{subtree:true,characterData:true,childList:true});moduleObserver.node=src;
 }}
 document.addEventListener('pulse:tool-mounted',()=>queueMicrotask(watch));watch();
 navigate();
 // The decorative hero waveform is generated once, exactly as in the supplied HTML.
 const wave=$('#wave');if(wave)wave.innerHTML=Array.from({length:90},(_,i)=>'<i style="--h:'+(18+Math.abs(Math.sin(i*.42)*60)).toFixed(0)+'%;--i:'+i+'"></i>').join('');
}
function downloadBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
