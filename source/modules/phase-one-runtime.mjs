/** Phase 1: live HTML shell wired to the existing AudioWorkspace. */
export function initializePhaseOne({workspace:w}){
 const root=document.getElementById('pulse-phase-one');
 if(!root||!w)return()=>{};
 const $=selector=>root.querySelector(selector);
 const $$=selector=>[...root.querySelectorAll(selector)];
 const source=()=>document.getElementById('audio-file');
 const status=$('#phase1-upload-status');
 const report=message=>{if(status){status.textContent=message||'';status.hidden=!message}};
 let pending=false;
 const sync=()=>{
  root.dataset.track=w.buffer?'loaded':'none';
  const title=$('#drop .dropzone__title'),hint=$('#drop .dropzone__hint');
  if(title)title.textContent=w.buffer?'Audio ready: '+(w.displayName||w.name):'Drop audio here';
  if(hint)hint.textContent=w.buffer?'Choose another track to replace it':'or click to browse · stays on your device';
 };
 const activate=name=>{
  for(const link of $$('[data-phase-nav]')){
   if(link.dataset.phaseNav===name)link.setAttribute('aria-current','true');
   else link.removeAttribute('aria-current');
  }
 };
 const goto=()=>document.getElementById('toolkit')?.scrollIntoView({behavior:'smooth',block:'start'});
 const openAudio=()=>{
  const input=source();
  if(!input){report('SOURCE AUDIO is unavailable. Reload the page.');return;}
  pending=true;input.value='';input.click();
 };
 for(const chip of $$('#filters [data-f]')){
  chip.addEventListener('click',()=>{
   for(const item of $$('#filters [data-f]'))item.setAttribute('aria-pressed',String(item===chip));
   for(const card of $$('#toolgrid [data-cat]'))card.hidden=chip.dataset.f!=='all'&&card.dataset.cat!==chip.dataset.f;
  });
 }
 const click=event=>{
  const upload=event.target.closest('[data-phase-open]');
  if(upload&&root.contains(upload)){event.preventDefault();openAudio();return;}
  const scroll=event.target.closest('[data-phase-scroll]');
  if(scroll&&root.contains(scroll)){event.preventDefault();document.getElementById(scroll.dataset.phaseScroll)?.scrollIntoView({behavior:'smooth'});return;}
  const category=event.target.closest('[data-phase-category]');
  if(category&&root.contains(category)){
   event.preventDefault();
   document.querySelector('[data-category="'+category.dataset.phaseCategory+'"]')?.click();
   activate(category.dataset.phaseNav||'ai');goto();return;
  }
  const nav=event.target.closest('[data-phase-nav]');
  if(nav&&root.contains(nav))activate(nav.dataset.phaseNav);
 };
 root.addEventListener('click',click);
 const drop=$('#drop');
 const over=event=>{event.preventDefault();drop.classList.add('is-dragover')};
 const leave=event=>{event.preventDefault();drop.classList.remove('is-dragover')};
 const onDrop=async event=>{
  event.preventDefault();drop.classList.remove('is-dragover');
  const file=event.dataTransfer?.files?.[0];if(!file)return;
  pending=true;report('');
  try{await w.load(file)}catch(error){pending=false;report(error?.message||'Could not load audio.')}
 };
 if(drop){drop.addEventListener('dragenter',over);drop.addEventListener('dragover',over);drop.addEventListener('dragleave',leave);drop.addEventListener('drop',onDrop);}
 const wave=$('#wave');
 if(wave&&!wave.childElementCount){
  const fragment=document.createDocumentFragment();
  for(let i=0;i<90;i++){
   const element=document.createElement('i');
   element.style.setProperty('--h',Math.min(100,18+Math.abs(Math.sin(i*.42)*60)+i*7%13).toFixed(0)+'%');
   element.style.setProperty('--i',String(i));
   fragment.append(element);
  }
  wave.append(fragment);
 }
 const unsubscribe=w.subscribe((_snapshot,reason)=>{
  if(reason==='position')return;
  sync();
  if(reason==='load'){
   report('');if(pending){pending=false;activate('analyzer');goto();}
  }
  if(reason==='clear')pending=false;
 });
 sync();
 return()=>{unsubscribe();root.removeEventListener('click',click);if(drop){drop.removeEventListener('dragenter',over);drop.removeEventListener('dragover',over);drop.removeEventListener('dragleave',leave);drop.removeEventListener('drop',onDrop);}};
}
