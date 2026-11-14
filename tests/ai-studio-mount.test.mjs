import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';
import {TOOL_EDITORIAL} from '../source/modules/tool-editorial.mjs';
import {TOOL_BENEFITS} from '../source/modules/tool-benefits.mjs';
import {isAiV2} from '../source/modules/ai-v2-copy.mjs';

const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');

/** Mount actual production module functions into a DOM.
 * This catches invalid selectors and runtime initialization exceptions that a build misses.
 */
test('AI Studio registry has twelve valid editorial routes and safe backup copy',()=>{
 assert.equal(aiV2Modules.length,12);
 for(const tool of aiV2Modules){
  assert.equal(isAiV2(tool),true,tool.id+' missing dedicated AI Studio copy');
 }
 const lyrics=aiV2Modules.find(tool=>tool.id==='ai2-lyrics');
 assert.ok(lyrics,'Lyrics Generator must be registered');
 assert.deepEqual(TOOL_EDITORIAL[lyrics.id].title,['Lyrics','Generator']);
 assert.ok(TOOL_EDITORIAL[lyrics.id].steps.length>=3);
 assert.equal(TOOL_BENEFITS[lyrics.id].length,3);
});

test('all twelve AI Studio modules mount without throwing',async()=>{
 const {window,document}=parseHTML('<html><body><div id="audio-meta"></div><div id="source-status"></div><main id="host"></main></body></html>');
 const props=['window','document','navigator','fetch'];
 const before=Object.fromEntries(props.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:window});
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{clipboard:{writeText:async()=>{}}}});
 Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:async()=>({ok:true,json:async()=>({configured:false})})});
 const host=document.getElementById('host');
 const mounted=[];
 try{
  assert.equal(aiV2Modules.length,12);
  for(const module of aiV2Modules){
   host.replaceChildren();
   const cleanup=module.mount({host,category:'ai'});
   assert.ok(host.children.length,module.id+' must render a nonempty panel');
   assert.ok(host.querySelector('button'),module.id+' must have an actionable control');
   assert.ok(!host.textContent.includes('This module could not start.'),module.id);
   mounted.push(module.id);
   if(typeof cleanup==='function')cleanup();
  }
  assert.deepEqual(mounted,[
   'ai2-mastering','ai2-stereo','ai2-vocals','ai2-beat',
   'ai2-mix','ai2-repair','ai2-pitch','ai2-fx','ai2-lyrics','ai2-musicai','ai2-watermark','ai2-extraction'
  ]);
 }finally{
  for(const key of props) {
   if(before[key])Object.defineProperty(globalThis,key,before[key]);
   else delete globalThis[key];
  }
 }
});

test('AI Mastering exposes local DSP controls and no paid cloud mode',()=>{
 const code=read('modules/mastering-ui.mjs');
 assert.doesNotMatch(code,/mountMusicGPTMasteringCloud|data-master-engine|MUSICGPT MASTERING/,'Paid cloud mastering must be absent');
 for(const marker of [
  'data-master-reference',
  'data-master-preset',
  'data-master-auto',
  'data-master-action="analyze"',
  'data-master-action="render"',
  'data-master-action="assist"',
  'data-master-action="match"',
  'data-master-action="apply"',
  'data-master-action="export"',
  'data-master-ab="c"',
  "runMasteringWorker('render'"
 ])assert.ok(code.includes(marker),'Missing local mastering control: '+marker);
});

test('complete application routes to all 22 tools in ANALYZE / CREATE / PREPARE without module errors',async()=>{
 const html=read('index.html');
 const {window,document}=parseHTML(html);
 document.querySelector('.tool-empty')?.remove();
 window.HTMLElement.prototype.scrollIntoView=function(){};
 window.HTMLElement.prototype.click=function(){this.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));};
 for(const key of ['document','window','Element','HTMLElement','Node','Event','CustomEvent','MutationObserver']){
  if(window[key])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:window[key]});
 }
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:window});
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{clipboard:{writeText:async()=>{}}}});
 globalThis.localStorage={getItem:()=>null,setItem(){}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({configured:false})});
 globalThis.requestAnimationFrame=()=>1;
 globalThis.cancelAnimationFrame=()=>{};
 const {visibleToolModules}=await import('../source/modules/index.mjs');
 await import('../source/app.mjs');
 assert.ok(document.querySelector('#module-song-analyzer .focus-song-v3'),'Song Analyzer should mount by default');
 const event=()=>new window.Event('click',{bubbles:true,cancelable:true});
 const byCategory=new Map();
 for(const mod of visibleToolModules){
  const list=byCategory.get(mod.category)||[];
  list.push(mod.id);byCategory.set(mod.category,list);
 }
 let checked=0;
 for(const category of ['analyze','create','prepare']){
  document.querySelector('[data-category="'+category+'"]').dispatchEvent(event());
  const buttons=[...document.querySelectorAll('#tool-tabs [data-tool]')];
  assert.deepEqual(buttons.map(b=>b.dataset.tool),byCategory.get(category),category+' inventory');
  for(const button of buttons){
   button.dispatchEvent(event());
   const host=document.querySelector('.tool-module-host');
   assert.ok(host,'Cannot mount '+button.dataset.tool);
   assert.ok(host.children.length>0,'Empty panel '+button.dataset.tool);
   assert.ok(!host.querySelector('[role="alert"]'),'Module failed to mount: '+button.dataset.tool);
   assert.ok(document.querySelector('.pulse-howto'),'Help must be available');
   checked++;
  }
 }
 assert.equal(checked,22);
 const nav=document.querySelector('.header-nav [data-open-tool="song-analyzer"]');
 nav.dispatchEvent(event());
 assert.ok(document.querySelector('#module-song-analyzer .focus-song-v3'),'Header tool navigation should return to Song Analyzer');
});
