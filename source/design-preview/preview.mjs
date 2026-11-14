/** Uploaded PULSE design preview. Demonstrative interactions only; no audio engine. */
const root=document;
const $=(selector)=>root.querySelector(selector);
const $$=(selector)=>[...root.querySelectorAll(selector)];
const viewNames=new Set(['home','analyzer','tagger','editor','converter','ai','ai-tool','visualizer']);
const route=()=>{
  const hash=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean);
  const requested=hash[0]||'home';
  const view=requested==='ai'&&hash.length>1?'ai-tool':(viewNames.has(requested)?requested:'home');
  for(const section of $$('.view[data-view]'))section.hidden=section.dataset.view!==view;
  for(const link of $$('[data-nav]')){
    if(link.dataset.nav===(view==='ai-tool'?'ai':view))link.setAttribute('aria-current','true');
    else link.removeAttribute('aria-current');
  }
  document.title='PULSE Studio / '+view.replace(/-/g,' ')+' / Design Reference';
};
let loaded=false;
const note=message=>{
 const toast=$('#toast');
 if(toast){toast.textContent=message;toast.classList.add('is-visible');toast.setAttribute('role','status');}
};
const simulate=next=>{
 loaded=next;document.body.dataset.track=loaded?'loaded':'none';
 for(const el of $$('[data-slot="chip"]'))el.textContent=loaded?'DEMO TRACK · illustrative data':'No file loaded';
 for(const el of $$('[data-slot="empty"]'))el.textContent=loaded?'':'Load audio in the working PULSE app; this reference does not process files.';
 note(loaded?'Showing example data only. No file was loaded.':'Design preview reset.');
};
window.addEventListener('hashchange',route);
$$('[data-load]').forEach(el=>el.addEventListener('click',event=>{
 event.preventDefault();simulate(true);if(el.dataset.go)location.hash='#/'+el.dataset.go;
}));
$$('[data-unload]').forEach(el=>el.addEventListener('click',event=>{event.preventDefault();simulate(false);}));
$$('[data-scroll]').forEach(el=>el.addEventListener('click',event=>{
 const target=document.getElementById(el.dataset.scroll);if(target){event.preventDefault();target.scrollIntoView({block:'start',behavior:'smooth'});}
}));
$$('[data-f]').forEach(el=>el.addEventListener('click',()=>{
 const choice=el.dataset.f;for(const chip of $$('[data-f]'))chip.setAttribute('aria-pressed',String(chip===el));
 for(const card of $$('#toolgrid [data-cat]'))card.hidden=choice!=='all'&&card.dataset.cat!==choice;
}));
$$('[data-toast]').forEach(el=>el.addEventListener('click',()=>note('Design reference only. No audio was processed or exported.')));
$$('[data-go]').filter(el=>!el.matches('[data-load]')).forEach(el=>el.addEventListener('click',()=>{location.hash='#/'+el.dataset.go;}));
route();