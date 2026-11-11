import {toolModules as existingToolModules} from './features.mjs';
import {aiV2Modules} from './ai-v2.mjs';
import {workspace} from './workspace.mjs';
export const toolModules=Object.freeze([...existingToolModules.filter(module=>module.category!=='ai'),...aiV2Modules]);
if(typeof document!=='undefined'){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/modules/ui.css';document.head.append(link);
  const eqStyle=document.createElement('link');eqStyle.rel='stylesheet';eqStyle.href='/modules/eq-ui.css';document.head.append(eqStyle);
  const producerStyle=document.createElement('link');producerStyle.rel='stylesheet';producerStyle.href='/modules/producer-tools.css';document.head.append(producerStyle);
  const noiseStyle=document.createElement('link');noiseStyle.rel='stylesheet';noiseStyle.href='/modules/noise-tool.css';document.head.append(noiseStyle);
  const aiV2Style=document.createElement('link');aiV2Style.rel='stylesheet';aiV2Style.href='/modules/ai-v2.css';document.head.append(aiV2Style);
  workspace.mountSource();
  const set=(selector,copy)=>{const element=document.querySelector(selector);if(element)element.textContent=copy;};
  set('.hero-description','Analyze, edit, enhance and export audio directly in your browser. Upload a track, work with its waveform and choose a tool from the four categories.');
  set('.state-line','LOCAL AUDIO PROCESSING / MODULES ACTIVE');
  set('.toolkit-intro p','Explore local audio tools for analysis, editing, export and DSP-assisted mastering. All uploaded files remain in browser memory.');
  set('.toolkit-intro .intro-accent','Local tools require no account. Cloud AI needs protected access.');
  set('.toolkit-note','+ Local DSP stays in your browser. Neural voice operations use an explicitly authorized cloud service and require separate access.');
  set('.footer-brand p','A focused audio workspace for producers. Analyze, edit, process and export without installing software.');
  const status=document.querySelector('.tiny-status');if(status)status.textContent='READY FOR AUDIO';
  const source=document.querySelector('.tool-source');if(source)source.setAttribute('aria-label','Audio upload, waveform and transport');
}

if(typeof document!=='undefined')import('./source-ui.mjs').catch(error=>console.error('Source UI:',error));
