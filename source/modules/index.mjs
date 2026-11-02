import {toolModules} from './features.mjs';
import {workspace} from './workspace.mjs';
export {toolModules};
if(typeof document!=='undefined'){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/modules/ui.css';document.head.append(link);
  workspace.mountSource();
  const set=(selector,copy)=>{const element=document.querySelector(selector);if(element)element.textContent=copy;};
  set('.hero-description','Analyze, edit, enhance and export audio directly in your browser. Upload a track, work with its waveform and choose a tool from the four categories.');
  set('.state-line','LOCAL AUDIO PROCESSING / MODULES ACTIVE');
  set('.toolkit-intro p','Explore local audio tools for analysis, editing, export and DSP-assisted mastering. All uploaded files remain in browser memory.');
  set('.toolkit-intro .intro-accent','No account required. Audio is processed locally.');
  set('.toolkit-note','+ Audio processing runs locally in your browser. AI STUDIO currently contains DSP tools, not neural models.');
  set('.footer-brand p','A focused audio workspace for producers. Analyze, edit, process and export without installing software.');
  const status=document.querySelector('.tiny-status');if(status)status.textContent='READY FOR AUDIO';
  const source=document.querySelector('.tool-source');if(source)source.setAttribute('aria-label','Audio upload, waveform and transport');
}

if(typeof document!=='undefined')import('./source-ui.mjs').catch(error=>console.error('Source UI:',error));
