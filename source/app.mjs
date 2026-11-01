import {toolModules} from './modules/index.mjs';

// PULSE shell: category navigation and optional module mounting only.
// This file intentionally contains no audio DSP or legacy processors.
const categories=Object.freeze({
  analyze:{name:'ANALYZE',title:'Analyze.',description:'This category is ready for new analysis modules.',number:'01'},
  edit:{name:'EDIT',title:'Edit.',description:'This category is ready for new audio editing modules.',number:'02'},
  export:{name:'EXPORT',title:'Export.',description:'This category is ready for new audio export modules.',number:'03'},
  ai:{name:'AI STUDIO',title:'AI Studio.',description:'This category is ready for new AI audio modules.',number:'04'}
});
const query=(selector)=>document.querySelector(selector);
const blank=query('#blank-panel');
const panel=query('#tool-panel');
const tabs=query('#tool-tabs');
let activeCategory='analyze';
let currentCleanup=null;

function clearMountedTool(){
  if(typeof currentCleanup==='function'){
    try{currentCleanup();}catch(error){console.warn('Tool cleanup failed:',error);}
  }
  currentCleanup=null;
  panel.querySelectorAll('.tool-module-host').forEach((element)=>element.remove());
}
function showEmpty(){
  clearMountedTool();
  blank.hidden=false;
  query('#empty-title').textContent=categories[activeCategory].title;
  query('#empty-description').textContent=categories[activeCategory].description;
}
function mountTool(definition){
  clearMountedTool();
  blank.hidden=true;
  tabs.querySelectorAll('button').forEach((button)=>{
    const selected=button.dataset.tool===definition.id;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
  });
  const host=document.createElement('div');
  host.className='tool-module-host';
  host.id='module-'+definition.id;
  panel.append(host);
  try{
    const cleanup=definition.mount({host,category:activeCategory});
    if(typeof cleanup==='function')currentCleanup=cleanup;
  }catch(error){
    host.replaceChildren();
    const msg=document.createElement('p');
    msg.setAttribute('role','alert');
    msg.textContent='This module could not start.';
    host.append(msg);
    console.error('PULSE module failed:',error);
  }
}
function validModules(category){
  return toolModules.filter((module)=>module &&
    module.category===category && typeof module.id==='string' &&
    typeof module.label==='string' && typeof module.mount==='function');
}
function activateCategory(category){
  if(!Object.hasOwn(categories,category))return;
  activeCategory=category;
  const info=categories[category];
  query('#category-number').textContent=info.number+' / '+info.name;
  document.querySelectorAll('[data-category]').forEach((button)=>{
    const selected=button.dataset.category===category;
    button.classList.toggle('is-active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  document.querySelectorAll('[data-category-link]').forEach((link)=>{
    const selected=link.dataset.categoryLink===category;
    link.classList.toggle('is-active',selected);
    if(selected)link.setAttribute('aria-current','true');
    else link.removeAttribute('aria-current');
  });
  tabs.replaceChildren();
  const available=validModules(category);
  tabs.hidden=available.length===0;
  for(const tool of available){
    const button=document.createElement('button');
    button.type='button';
    button.className='tool-tab';
    button.dataset.tool=tool.id;
    button.textContent=tool.label+' ↗';
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected','false');
    button.tabIndex=-1;
    button.addEventListener('click',()=>mountTool(tool));
    tabs.append(button);
  }
  if(available.length)mountTool(available[0]);
  else showEmpty();
}
document.querySelectorAll('[data-category]').forEach((button)=>{
  button.addEventListener('click',()=>activateCategory(button.dataset.category));
});
document.querySelectorAll('[data-category-link]').forEach((link)=>{
  link.addEventListener('click',()=>activateCategory(link.dataset.categoryLink));
});
activateCategory('analyze');
