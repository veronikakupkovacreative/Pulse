import {toolModules as existingToolModules} from './features.mjs';
import {aiV2Modules} from './ai-v2.mjs';
import {workspace} from './workspace.mjs';
import {songAnalyzerModule,audioEditorModule} from './focused-tools.mjs';
import {musicTaggerModule} from './music-tagger.mjs';
import {mountAdvancedVisualizer} from './pulse-ai-master.mjs';
export const toolModules=Object.freeze([...existingToolModules.filter(module=>module.category!=='ai'),...aiV2Modules]);
const converter=toolModules.find(m=>m.id==='wav');
if(!converter)throw Error('PULSE converter module missing.');
const visualizer=Object.freeze({id:'visualizer',category:'visuals',label:'Audio Visualizer',mount:({host})=>mountAdvancedVisualizer({host})});
export const visibleToolModules=Object.freeze([songAnalyzerModule,musicTaggerModule,audioEditorModule,converter,...aiV2Modules,visualizer]);
if(typeof document!=='undefined'){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/modules/ui.css';document.head.append(link);
  const musicStyle=document.createElement('link');musicStyle.rel='stylesheet';musicStyle.href='/modules/music-tagger.css';document.head.append(musicStyle);
  const eqStyle=document.createElement('link');eqStyle.rel='stylesheet';eqStyle.href='/modules/eq-ui.css';document.head.append(eqStyle);
  const producerStyle=document.createElement('link');producerStyle.rel='stylesheet';producerStyle.href='/modules/producer-tools.css';document.head.append(producerStyle);
  const noiseStyle=document.createElement('link');noiseStyle.rel='stylesheet';noiseStyle.href='/modules/noise-tool.css';document.head.append(noiseStyle);
  const voiceAiStyle=document.createElement('link');voiceAiStyle.rel='stylesheet';voiceAiStyle.href='/modules/musicgpt-voicechanger.css';document.head.append(voiceAiStyle);
  const lyricsStyle=document.createElement('link');lyricsStyle.rel='stylesheet';lyricsStyle.href='/modules/musicgpt-lyrics.css';document.head.append(lyricsStyle);
  const musicAIStyle=document.createElement('link');musicAIStyle.rel='stylesheet';musicAIStyle.href='/modules/musicgpt-musicai.css';document.head.append(musicAIStyle);
  const extractionStyle=document.createElement('link');extractionStyle.rel='stylesheet';extractionStyle.href='/modules/musicgpt-extraction.css';document.head.append(extractionStyle);
  const watermarkStyle=document.createElement('link');watermarkStyle.rel='stylesheet';watermarkStyle.href='/modules/watermark-cleaner.css';document.head.append(watermarkStyle);
  const aiV2Style=document.createElement('link');aiV2Style.rel='stylesheet';aiV2Style.href='/modules/ai-v2.css';document.head.append(aiV2Style);
  // Canonical last-loaded layer: keeps every red toolkit consistent with Beat Lab.
  const designStyle=document.createElement('link');designStyle.rel='stylesheet';designStyle.href='/modules/pulse-design-system.css';document.head.append(designStyle);
  workspace.mountSource();
  const set=(selector,copy)=>{const element=document.querySelector(selector);if(element)element.textContent=copy;};
  set('.hero-description','Analyze, edit, master and export audio.');
  set('.state-line','LOCAL AUDIO PROCESSING / MODULES ACTIVE');
  set('.toolkit-intro p','BPM, key, Camelot and beat grid.');
  set('.toolkit-intro .intro-accent','Cloud tools are labeled separately.');
  set('.toolkit-note','+ Local processing unless marked MUSICGPT CLOUD.');
  set('.footer-brand p','Audio tools for producers.');
  const status=document.querySelector('.tiny-status');if(status)status.textContent='READY FOR AUDIO';
  const source=document.querySelector('.tool-source');if(source)source.setAttribute('aria-label','Audio upload, waveform and transport');
}

if(typeof document!=='undefined')import('./source-ui.mjs').catch(error=>console.error('Source UI:',error));
