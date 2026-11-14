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
  // Active styles only. The prototype stylesheet is last so historical modules share one theme.
  const styles=["ui.css","music-tagger.css","eq-ui.css","producer-tools.css","noise-tool.css","musicgpt-voicechanger.css","musicgpt-lyrics.css","musicgpt-musicai.css","musicgpt-extraction.css","watermark-cleaner.css","ai-v2.css","audo-ui.css","producer-workflows.css","protection.css","studio-reference.css"];
  for(const name of styles){
    const element=document.createElement('link');
    element.rel='stylesheet';
    element.href='/modules/'+name;
    document.head.append(element);
  }
  workspace.mountSource();
  // HTML owns editorial copy. Never rewrite the approved design text on mount.
}

if(typeof document!=='undefined')import('./source-ui.mjs').catch(error=>console.error('Source UI:',error));
