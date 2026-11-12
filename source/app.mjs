import {visibleToolModules as toolModules} from './modules/index.mjs';
import {enhanceParameterControls} from './modules/slider-ui.mjs';
import {renderToolEditorial} from './modules/tool-editorial.mjs';
import {renderToolBenefits} from './modules/tool-benefits.mjs';
import {isAiV2,renderAiV2Copy} from './modules/ai-v2-copy.mjs';
import {workspace as w} from './modules/workspace.mjs';
import {mountWorkspaceActions} from './modules/workspace-actions.mjs';
import {studioStore} from './modules/studio-store.mjs';
import {initializeThemeToggle} from './modules/theme-toggle.mjs';

// PULSE shell: category navigation and optional module mounting only.
// This file intentionally contains no audio DSP or legacy processors.
const categories=Object.freeze({
  analyze:{name:'ANALYSIS',title:'Song Analyzer.',description:'BPM, musical key, Camelot, approximate chords and beat grid.',number:'01'},
  edit:{name:'EDIT',title:'Audio Editor.',description:'Trim, cut, merge, fade, reverse, gain and parametric EQ.',number:'02'},
  export:{name:'EXPORT',title:'Audio Converter.',description:'Convert WAV, MP3, FLAC, AAC and OGG audio in your browser.',number:'03'},
  ai:{name:'AI STUDIO',title:'AI Studio.',description:'Eight focused tools for stereo, vocals, beats, mixing, mastering, repair and effects.',number:'04'},
  visuals:{name:'VISUALS',title:'Audio Visualizer.',description:'Waveform, spectrum, audiogram and browser-supported video export.',number:'05'}
});
const query=(selector)=>document.querySelector(selector);
initializeThemeToggle();
const blank=query('#blank-panel');
const panel=query('#tool-panel');
const tabs=query('#tool-tabs');
let activeCategory='analyze';
let currentCleanup=null;
const bitrateGuide=query('#pulse-bitrate-guide');
function showBitrateGuide(show){
  if(bitrateGuide)bitrateGuide.hidden=!show;
}

function clearMountedTool(){
  if(typeof currentCleanup==='function'){
    try{currentCleanup();}catch(error){console.warn('Tool cleanup failed:',error);}
  }
  currentCleanup=null;
  panel.querySelectorAll('.tool-module-host').forEach((element)=>element.remove());
}
function showEmpty(){
  studioStore.setActiveModule(null);
  showBitrateGuide(false);
  clearMountedTool();
  blank.hidden=false;
  query('#empty-title').textContent=categories[activeCategory].title;
  query('#empty-description').textContent=categories[activeCategory].description;
}
function mountTool(definition){
  studioStore.setActiveModule(definition.id);
  showBitrateGuide(false);
  clearMountedTool();
  blank.hidden=true;
  if(isAiV2(definition))renderAiV2Copy(definition);
  else {renderToolEditorial(definition);renderToolBenefits(definition);}
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
    const converterFormat=definition.id==='wav'?host.querySelector('#format'):null;
    const syncBitrateGuide=()=>showBitrateGuide(converterFormat?.value==='mp3');
    if(converterFormat){
      converterFormat.addEventListener('change',syncBitrateGuide);
      syncBitrateGuide();
    }
    const stopSliders=enhanceParameterControls(host);
    const stopAudioActions=mountWorkspaceActions(host,w);
    currentCleanup=()=>{converterFormat?.removeEventListener('change',syncBitrateGuide);stopAudioActions();stopSliders();if(typeof cleanup==='function')cleanup();};
  }catch(error){
    showBitrateGuide(false);
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
  studioStore.setActiveCategory(category);
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
// Directory and footer links open their registered tool in the existing toolkit.
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-open-tool]');if(!trigger)return;
 const selected=toolModules.find(tool=>tool.id===trigger.dataset.openTool);if(!selected)return;
 event.preventDefault();if(activeCategory!==selected.category)activateCategory(selected.category);
 const tab=[...tabs.querySelectorAll('[data-tool]')].find(button=>button.dataset.tool===selected.id);
 if(tab)tab.click();
 query('#toolkit')?.scrollIntoView({behavior:'smooth',block:'start'});
});


// The visualizer shortcuts open the selected real module and switch to its mode.
document.addEventListener('click',event=>{
 const shortcut=event.target.closest('[data-open-visual]');if(!shortcut)return;
 event.preventDefault();activateCategory('visuals');
 const target=[...tabs.querySelectorAll('[data-tool]')].find(b=>b.dataset.tool==='visualizer');
 if(target)target.click();
 const mode=shortcut.dataset.openVisual;
 const lookup={audiogram:'radial',podcast:'radial',bars:'spectrum',sound_wave_maker:'oscilloscope',waveform:'oscilloscope',audio_waveform_generator:'oscilloscope',spectrum:'spectrum'};
 const requested=lookup[mode]||mode;
 const control=[...document.querySelectorAll('#module-visualizer [data-option]')].find(b=>b.dataset.option===requested);
 if(control)control.click();
 query('#toolkit')?.scrollIntoView({behavior:'smooth',block:'start'});
});
/* Global edit history shortcuts; text-entry controls keep their native behavior. */
document.addEventListener('keydown',event=>{
  const target=event.target;
  if(target?.closest?.('input:not([type="range"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable="true"],[role="textbox"]'))return;
  if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
  const key=event.key.toLowerCase();
  if(key==='z'){
    event.preventDefault();
    if(event.shiftKey)w.redo();else w.undo();
  }else if(key==='y'){
    event.preventDefault();
    w.redo();
  }
});
