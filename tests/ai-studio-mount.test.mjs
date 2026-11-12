import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';

const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');

/** Mount actual production module functions into a DOM.
 * This catches invalid selectors and runtime initialization exceptions that a build misses.
 */
test('all eight AI Studio modules mount without throwing',async()=>{
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
  assert.equal(aiV2Modules.length,8);
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
   'ai2-mastering','ai2-stems','ai2-vocals','ai2-beat',
   'ai2-mix','ai2-repair','ai2-pitch','ai2-fx'
  ]);
 }finally{
  for(const key of props) {
   if(before[key])Object.defineProperty(globalThis,key,before[key]);
   else delete globalThis[key];
  }
 }
});

test('AI Mastering exposes all controls and has a valid cloud-status selector',()=>{
 const code=read('modules/mastering-ui.mjs');
 assert.ok(code.includes("cloudAvailability=$('[data-master-cloud-availability]')"));
 assert.ok(!code.includes("cloudAvailability=$('[data-master-cloud-availability\"]')"));
 for(const marker of [
  'data-master-engine="local"',
  'data-master-engine="cloud"',
  'data-master-cloud-availability',
  'data-master-reference',
  'data-master-action="render"',
  'data-master-action="assist"',
  'data-master-action="match"',
  'data-master-ab="c"'
 ])assert.ok(code.includes(marker),'Missing control: '+marker);
});


test('full application routes to all eight AI Studio tabs without a module initialization error',async()=>{
 const html=read('index.html');
 const {window,document}=parseHTML(html);
 // linkedom does not emulate a Canvas 2D context: skip only Source Audio painting.
 document.querySelector('.tool-empty')?.remove();
 // Browser navigation methods are omitted from linkedom; provide small DOM-test shims.
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
 await import('../source/app.mjs');
 assert.ok(document.querySelector('#module-song-analyzer .focus-song-v3'),'Single Producer Toolkit analyzer must mount');
 const event=()=>new window.Event('click',{bubbles:true,cancelable:true});
 document.querySelector('[data-category="ai"]').dispatchEvent(event());
 const errors=[];
 const ids=[];
 for(const button of [...document.querySelectorAll('#tool-tabs [data-tool]')]){
  button.dispatchEvent(event());
  ids.push(button.dataset.tool);
  const host=document.querySelector('.tool-module-host');
  assert.ok(host,button.dataset.tool+' must render');
  const message=host.querySelector('[role="alert"]');
  if(message)errors.push(button.dataset.tool+': '+message.textContent);
 }
 assert.deepEqual(ids,aiV2Modules.map(item=>item.id));
 assert.deepEqual(errors,[]);
 assert.ok(document.querySelector('#module-ai2-mastering')===null,'Last selection should replace the previous tool');
 document.querySelector('.nav-bpm').dispatchEvent(event());
 assert.ok(document.querySelector('#module-song-analyzer .focus-song-v3'),'Navigation must reopen the one active Song Analyzer');
});
