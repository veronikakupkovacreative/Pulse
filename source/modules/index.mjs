import {toolModules as existingToolModules} from './features.mjs';
import {aiV2Modules} from './ai-v2.mjs';
import {workspace} from './workspace.mjs';
import {songAnalyzerModule,audioEditorModule} from './focused-tools.mjs';
import {musicTaggerModule} from './music-tagger.mjs';
import {mountAdvancedVisualizer} from './pulse-ai-master.mjs';
import {producerModules} from './producer-workflows.mjs';
import {audioProtectionModule} from './audio-protection-tool.mjs';
const converter=existingToolModules.find(m=>m.id==='wav');
if(!converter)throw Error('PULSE converter module missing.');
const visualizer=Object.freeze({id:'visualizer',category:'create',label:'Audio Visualizer',mount:({host})=>mountAdvancedVisualizer({host})});
const allModules=[songAnalyzerModule,musicTaggerModule,...producerModules,audioEditorModule,converter,audioProtectionModule,...aiV2Modules,visualizer];
const categoryOverrides=Object.freeze({
 'song-analyzer':'analyze','music-tagger':'analyze','release-preflight':'analyze',
 'vocal-session-mapper':'analyze','smart-sample-finder':'analyze','ai2-beat':'analyze',
 'editor':'prepare','wav':'prepare','audio-protection':'prepare','sample-pack-lab':'prepare','stem-delivery-studio':'prepare',
 'ai2-mastering':'prepare','ai2-watermark':'prepare'
});
export const visibleToolModules=Object.freeze(allModules.map(module=>Object.freeze({...module,category:categoryOverrides[module.id]||(module.category==='ai'?'create':module.category)||'create'})));
export const toolModules=visibleToolModules;
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
  const audoStyle=document.createElement('link');audoStyle.rel='stylesheet';audoStyle.href='/modules/audo-ui.css';document.head.append(audoStyle);
  const workflowStyle=document.createElement('link');workflowStyle.rel='stylesheet';workflowStyle.href='/modules/producer-workflows.css';document.head.append(workflowStyle);
  // Canonical last-loaded layer: keeps every red toolkit consistent with Beat Lab.
  const designStyle=document.createElement('link');designStyle.rel='stylesheet';designStyle.href='/modules/pulse-design-system.css';document.head.append(designStyle);
  const darkStyle=document.createElement('link');darkStyle.rel='stylesheet';darkStyle.href='/modules/studio-reference.css';document.head.append(darkStyle);
  const protectionStyle=document.createElement('link');protectionStyle.rel='stylesheet';protectionStyle.href='/modules/protection.css';document.head.append(protectionStyle);
  workspace.mountSource();
  // HTML owns editorial copy. Never rewrite the approved design text on mount.
}

if(typeof document!=='undefined')import('./source-ui.mjs').catch(error=>console.error('Source UI:',error));
