/** PULSE / Real prototype UI. Reuses existing AudioWorkspace and real tool mounts. */
import {workspace as w} from './workspace.mjs';
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const put = (s,v) => {for(const el of $$(s)) el.textContent=String(v);};
const seconds = s => {const v=Math.max(0,Number(s)||0);return `${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`;};
const slot = key => $(`[data-proto-module-slot="${key}"]`);
const toolRoutes={analyzer:'song-analyzer',tagger:'music-tagger',editor:'editor',converter:'wav',visualizer:'visualizer'};
const availableTools=[
 ['Master & mix',[['ai2-mastering','AI Mastering','Local DSP mastering','LOCAL'],['ai2-mix','Mix Assistant','Multitrack mixing workflow','LOCAL'],['ai2-stereo','Stereo Lab','Stereo width and mono compatibility','LOCAL']]],
 ['Voice & stems',[['ai2-vocals','Vocal Studio','Enhance or process vocals','LOCAL + CLOUD'],['ai2-extraction','Stem Extraction','Cloud separation with consent','CLOUD'],['ai2-repair','Audio Repair','Noise repair and cleanup','LOCAL + CLOUD']]],
 ['Creative',[['ai2-beat','Beat Lab','Detect rhythm and build loops','LOCAL'],['ai2-fx','Smart FX','Creative effects and processing','LOCAL + CLOUD'],['ai2-pitch','Pitch & Time','Pitch shift and time stretch','LOCAL']]],
 ['Generate & clean',[['ai2-lyrics','Lyrics Generator','Create original lyrics','CLOUD'],['ai2-musicai','Music Generator','Generate music from your prompt','CLOUD'],['ai2-watermark','Watermark Cleaner','Supported metadata cleanup','LOCAL']]]
];

function initHub(){
 const host=$('#proto-ai-groups');if(!host||host.childElementCount)return;
 for(const [label,items] of availableTools){
  const group=document.createElement('section');group.className='group';
  const title=document.createElement('h2');title.textContent=label+' · '+items.length+' tools';group.append(title);
  const grid=document.createElement('div');grid.className='grid';
  for(const [id,name,description,kind] of items){
   const button=document.createElement('button');button.type='button';button.className='card card--tool proto-ai-link';
   button.dataset.openTool=id;
   const top=document.createElement('div');top.className='card__top';
   const badge=document.createElement('span');badge.className='tag '+(kind==='CLOUD'?'tag--cloud':'tag--local');badge.textContent=kind;
   const key=document.createElement('span');key.className='card__num';key.textContent='AI STUDIO';top.append(key,badge);
   const h=document.createElement('h3');h.textContent=name;
   const p=document.createElement('p');p.textContent=description;
   const action=document.createElement('span');action.className='card__link';action.textContent='Open '+name;
   button.append(top,h,p,action);grid.append(button);
  }
  group.append(grid);host.append(group);
 }
}

function drawBeatGrid(){
 const svg=$('#bg');if(!svg)return;
 svg.replaceChildren();const b=w.buffer;if(!b)return;
 const ns='http://www.w3.org/2000/svg';const channel=b.getChannelData(0);
 const count=220,chunk=Math.max(1,Math.floor(channel.length/count));
 for(let i=0;i<count;i++){
  let peak=0;const start=i*chunk,end=Math.min(channel.length,start+chunk);
  for(let j=start;j<end;j+=Math.max(1,Math.floor(chunk/80))) peak=Math.max(peak,Math.abs(channel[j]));
  const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',String(i));rect.setAttribute('width','0.68');
  const size=Math.min(92,Math.max(2,peak*90));rect.setAttribute('y',String((100-size)/2));rect.setAttribute('height',String(size));svg.append(rect);
 }
 const markers=w.markers.filter(t=>t>=0&&t<=b.duration).slice(0,1200);
 for(let i=0;i<markers.length;i++){
  const x=220*markers[i]/b.duration;if(x<0||x>220)continue;
  const line=document.createElementNS(ns,'line');line.setAttribute('x1',String(x));line.setAttribute('x2',String(x));
  line.setAttribute('y1','0');line.setAttribute('y2','100');if(i%4===0)line.setAttribute('class','bar');svg.append(line);
 }
 const note=$('#proto-beat-count');if(note)note.textContent=markers.length?`${markers.length} detected beat markers · approximate`:'No beat markers yet';
}
function updateAnalyzer(){
 const source=$('#module-song-analyzer');if(!source)return;
 const val=(key)=>$(`[data-focus="${key}"]`,source)?.textContent?.trim()||'—';
 put('[data-proto-bpm]',val('bpm'));put('[data-proto-key]',val('key'));
 put('[data-proto-camelot]',val('camelot'));put('[data-proto-confidence]',val('rhythm-confidence'));
 const status=$('#proto-analysis-status');if(status)status.textContent=$('[data-focus-status]',source)?.textContent?.trim()||'Ready to analyze';
 const notes=$('#proto-chords');if(notes){
  const chords=$$('.focus-chord-row strong',source).map(el=>el.textContent.trim()).filter(Boolean).slice(0,16);
  const old=notes.dataset.chordList;if(old!==chords.join('|')){
   notes.replaceChildren();for(const chord of (chords.length?chords:['—'])){const chip=document.createElement('span');chip.textContent=chord;notes.append(chip)}
   notes.dataset.chordList=chords.join('|');
  }
 }
 drawBeatGrid();
}
function exportReport(){
 if(!w.buffer){alert('Load SOURCE AUDIO first.');return;}
 const get=k=>$(`[data-proto-${k}]`)?.textContent||'—';
 const data={file:w.displayName||w.name,seconds:w.buffer.duration,bpm:get('bpm'),key:get('key'),camelot:get('camelot'),confidence:get('confidence'),beatMarkers:w.markers};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(w.name||'pulse')+'-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}

let lastView='',hostObserver=null;
function viewForRoute(){
 const hash=decodeURIComponent(location.hash||'#/home').replace(/^#\/?/,'').split('/');
 const name=hash[0];
 if(!name||name==='home')return 'home';
 if(['analyzer','tagger','editor','converter','visualizer'].includes(name))return name;
 if(name==='ai'&&!hash[1])return 'ai';
 return 'ai-tool';
}
function activeToolLabel(){const tab=$('#tool-tabs [aria-selected="true"]');return tab?.textContent?.replace(/\s*↗\s*$/,'')?.trim()||'Audio tool';}
function ensureNodes(view){
 const sandbox=$('#pulse-legacy-host');
 const source=$('.audio-source-area');
 const panel=$('#tool-panel');
 if(source&&view==='editor'&&w.buffer)$('[data-proto-editor-source]')?.append(source);
 else if(source&&!sandbox.contains(source))sandbox.append(source);
 const modules={tagger:'tagger',converter:'converter',visualizer:'visualizer','ai-tool':'tool'};
 const target=slot(modules[view]);
 if(panel&&target)target.append(panel);else if(panel&&!sandbox.contains(panel))sandbox.append(panel);
 const transfers=[
 ['#pulse-editor-controls','[data-proto-editor-toolbar]'],
 ['#pulse-editor-transport','[data-proto-editor-transport]'],
 ['#pulse-editor-history','[data-proto-editor-history]'],
 ['#pulse-editor-properties','[data-proto-editor-properties]'],
 ['#pulse-editor-export','[data-proto-editor-export]']
 ];
 if(view==='editor'&&w.buffer){for(const [from,to] of transfers){const node=$(from),dest=$(to);if(node&&dest)dest.append(node)}}
 else for(const [from] of transfers){const node=$(from);if(node&&!sandbox.contains(node))sandbox.append(node)}
}
function syncTrack(){
 const b=w.buffer;document.body.dataset.track=b?'loaded':'none';
 for(const el of $$('[data-proto-file-name]'))el.textContent=b?w.displayName||w.name:'No source audio';
 for(const el of $$('[data-proto-file-meta]'))el.textContent=b?`${seconds(b.duration)} · ${(b.sampleRate/1000).toFixed(1)} kHz · ${b.numberOfChannels===2?'stereo':'mono'}`:'Load audio to begin';
 if(!b){for(const k of ['bpm','key','camelot'])put(`[data-proto-${k}]`,'—');put('[data-proto-confidence]','Awaiting analysis');const chords=$('#proto-chords');if(chords)chords.innerHTML='<span>—</span>'}
}
function updateUI(){
 syncTrack();const view=viewForRoute();
 for(const section of $$('.view'))section.hidden=section.dataset.view!==view;
 for(const link of $$('[data-nav]')){
  const active=(link.dataset.nav===(view==='tagger'?'analyzer':view==='ai-tool'?'ai':view));
  if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
 }
 // Prototype layout, not the old universal two-column toolkit.
 document.body.dataset.protoView=view;
 ensureNodes(view);
 if(view==='ai-tool'){
  const name=activeToolLabel();put('#proto-active-name',name);
  const heading=$('#proto-active-heading');if(heading){const parts=name.split(' '),last=parts.pop();heading.replaceChildren(document.createTextNode(parts.join(' ')+(parts.length?' ':'')));const hot=document.createElement('em');hot.textContent=last;heading.append(hot)}
 }
 if(view==='analyzer')updateAnalyzer();
 if(view==='editor'&&w.buffer)requestAnimationFrame(()=>w.drawWave());
 if(lastView!==view){lastView=view;document.title=(view==='home'?'PULSE Studio':view.replace(/(^|-)(\w)/g,(_,a,b)=>' '+b.toUpperCase()))+' — PULSE Studio';}
}
function showTool(id){
 const target=$(`[data-tool="${CSS.escape(id)}"]`,$('#tool-tabs'));
 if(target){target.click();return true}
 const nav=$(`[data-open-tool="${CSS.escape(id)}"]`,$('#pulse-legacy-host'));
 if(nav){nav.click();return true}
 return false;
}
function runAnalysis(){
 const button=$('#module-song-analyzer [data-focus-action="analyze"]');
 if(!w.buffer){$('#audio-file')?.click();return}
 if(button){button.click();updateAnalyzer();}
 else {showTool('song-analyzer');setTimeout(()=>$('#module-song-analyzer [data-focus-action="analyze"]')?.click(),0)}
}
export function initializePrototypeRuntime(){
 const proto=$('#pulse-proto-root');if(!proto)return;
 initHub();
 const filters=$$('#filters .chip');for(const chip of filters)chip.addEventListener('click',()=>{
  for(const button of filters)button.setAttribute('aria-pressed',String(button===chip));
  const filter=chip.dataset.f;for(const card of $$('#toolgrid .card'))card.hidden=!(filter==='all'||card.dataset.cat===filter);
 });
 $$('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById(btn.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
 /* The studio shell owns the single real file-picker handler. */
 // Home drop area is the one uploader. The local file is never sent by navigation.
 const drop=$('#drop');if(drop){for(const type of ['dragover','dragenter'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('is-dragover')});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('is-dragover')});
  drop.addEventListener('drop',e=>{const file=e.dataTransfer?.files?.[0];if(file)void w.load(file).catch(err=>w.setStatus(err.message))});}
 $$('[data-go-home]',proto).forEach(link=>link.addEventListener('click',e=>{e.preventDefault();location.hash='#/home';updateUI();window.scrollTo(0,0)}));
 $('#an-rerun')?.addEventListener('click',runAnalysis);
 $('#proto-report')?.addEventListener('click',exportReport);
 $('#proto-chords')?.setAttribute('aria-live','polite');
 document.addEventListener('pulse:tool-mounted',()=>queueMicrotask(()=>{updateUI();watchAnalyzer()}));
 document.addEventListener('click',event=>{
  if(event.target.closest('#pulse-proto-root [data-open-tool]'))queueMicrotask(updateUI);
  if(event.target.closest('#pulse-proto-root a[href^="#/"]'))queueMicrotask(updateUI);
 });
 window.addEventListener('hashchange',updateUI);window.addEventListener('popstate',updateUI);
 w.subscribe((_snapshot,reason)=>{if(reason==='position')return;syncTrack();if(reason==='load'||reason==='clear')updateUI();else if(reason==='markers'||reason==='analysis')updateAnalyzer()});
 updateUI();watchAnalyzer();
}
function watchAnalyzer(){
 const module=$('#module-song-analyzer');if(!module||module===hostObserver?.node)return;
 hostObserver?.observer.disconnect();
 const observer=new MutationObserver(()=>updateAnalyzer());observer.observe(module,{childList:true,characterData:true,subtree:true});
 hostObserver={node:module,observer};updateAnalyzer();
}