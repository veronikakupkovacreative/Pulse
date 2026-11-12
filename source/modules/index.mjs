import {toolModules as existingToolModules} from './features.mjs';
import {aiV2Modules} from './ai-v2.mjs';
import {workspace} from './workspace.mjs';
import {songAnalyzerModule,audioEditorModule} from './focused-tools.mjs';
import {videoToAudioModule} from './video-audio-tool.mjs';
import {mountAdvancedVisualizer} from './pulse-ai-master.mjs';
export const toolModules=Object.freeze([...existingToolModules.filter(module=>module.category!=='ai'),...aiV2Modules]);
const converter=toolModules.find(m=>m.id==='wav');
if(!converter)throw Error('PULSE converter module missing.');
const visualizer=Object.freeze({id:'visualizer',category:'visuals',label:'Audio Visualizer',mount:({host})=>mountAdvancedVisualizer({host})});
export const visibleToolModules=Object.freeze([songAnalyzerModule,audioEditorModule,converter,videoToAudioModule,...aiV2Modules,visualizer]);
if(typeof document!=='undefined'){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/modules/ui.css';document.head.append(link);
  const eqStyle=document.createElement('link');eqStyle.rel='stylesheet';eqStyle.href='/modules/eq-ui.css';document.head.append(eqStyle);
  const producerStyle=document.createElement('link');producerStyle.rel='stylesheet';producerStyle.href='/modules/producer-tools.css';document.head.append(producerStyle);
  const noiseStyle=document.createElement('link');noiseStyle.rel='stylesheet';noiseStyle.href='/modules/noise-tool.css';document.head.append(noiseStyle);
  const aiV2Style=document.createElement('link');aiV2Style.rel='stylesheet';aiV2Style.href='/modules/ai-v2.css';document.head.append(aiV2Style);
  // Canonical last-loaded layer: keeps every red toolkit consistent with Beat Lab.
  const designStyle=document.createElement('link');designStyle.rel='stylesheet';designStyle.href='/modules/pulse-design-system.css';document.head.append(designStyle);
  workspace.mountSource();
  const set=(selector,copy)=>{const element=document.querySelector(selector);if(element)element.textContent=copy;};
  set('.hero-description','Analyze, edit, master and export music in one focused browser workspace. Five sections, one shared waveform and eight AI Studio tools.');
  set('.state-line','LOCAL AUDIO PROCESSING / MODULES ACTIVE');
  set('.toolkit-intro p','Analyze rhythm and harmony, edit audio, convert formats or open a focused AI Studio tool. Your main SOURCE AUDIO stays in the shared workspace.');
  set('.toolkit-intro .intro-accent','Stereo, vocal, repair and beat tools process audio locally. Cloud mastering is optional.');
  set('.toolkit-note','+ Stereo Lab and Vocal Doubler run locally. Optional YouTube downloads use an owner-authorized external worker.');
  set('.footer-brand p','A focused audio workspace for producers. Analyze, edit, process and export without installing software.');
  const status=document.querySelector('.tiny-status');if(status)status.textContent='READY FOR AUDIO';
  const source=document.querySelector('.tool-source');if(source)source.setAttribute('aria-label','Audio upload, waveform and transport');
}

if(typeof document!=='undefined')import('./source-ui.mjs').catch(error=>console.error('Source UI:',error));
