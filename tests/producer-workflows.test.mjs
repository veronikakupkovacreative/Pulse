import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {producerModules,createZip} from '../source/modules/producer-workflows.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';

test('producer roadmap modules are registered once in the intended categories',()=>{
 const ids=producerModules.map(module=>module.id);
 assert.deepEqual(ids,['release-preflight','vocal-session-mapper','smart-sample-finder','sample-pack-lab','stem-delivery-studio']);
 const categories=Object.fromEntries(visibleToolModules.map(module=>[module.id,module.category]));
 for(const id of ['song-analyzer','music-tagger','release-preflight','vocal-session-mapper','smart-sample-finder','ai2-beat'])
  assert.equal(categories[id],'analyze',id);
 for(const id of ['ai2-musicai','ai2-lyrics','ai2-vocals','ai2-fx','ai2-extraction','ai2-repair','ai2-mix','ai2-stereo','visualizer'])
  assert.equal(categories[id],'create',id);
 for(const id of ['sample-pack-lab','editor','wav','stem-delivery-studio','ai2-mastering','ai2-watermark'])
  assert.equal(categories[id],'prepare',id);
 assert.deepEqual([...new Set(visibleToolModules.map(module=>module.category))].sort(),['analyze','create','prepare']);
 assert.equal(visibleToolModules.filter(module=>module.id==='ai2-musicai').length,1);
 assert.equal(visibleToolModules.filter(module=>module.id==='ai2-extraction').length,1);
 for(const removed of ['reverse','stem-splitter','stems','noise-remover'])assert.equal(visibleToolModules.some(module=>module.id===removed),false,removed);
});

test('the five producer modules mount their expected controls',()=>{
 const old=globalThis.document;
 const {document}=parseHTML('<html><body><div id="host"></div></body></html>');
 globalThis.document=document;
 try{
  const host=document.getElementById('host');
  const expected={
   'release-preflight':['[data-pw-run]','[data-pw-metrics]','[data-pw-consent]'],
   'vocal-session-mapper':['[data-pw-mode="transcribe"]','[data-pw-mode="align"]','[data-pw-mode="translate"]','[data-pw-script]'],
   'smart-sample-finder':['[data-pw-count]','[data-pw-highlights]'],
   'sample-pack-lab':['[data-pw-files]','[data-pw-silence]','[data-pw-loudness]','[data-pw-convert]','[data-pw-ranges]'],
   'stem-delivery-studio':['[data-pw-stems]','[data-pw-rate]','[data-pw-depth]']
  };
  for(const module of producerModules){
   const cleanup=module.mount({host});
   for(const selector of expected[module.id])assert.ok(host.querySelector(selector),module.id+' '+selector);
   if(module.id!=='stem-delivery-studio')assert.match(host.textContent,/Audo/,'Cloud consent must name the provider');
   cleanup?.();host.replaceChildren();
  }
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('ZIP writer creates a valid store-only archive with local and central directory records',async()=>{
 const zip=createZip([{name:'one.txt',data:new TextEncoder().encode('PULSE')},{name:'folder/two.txt',data:new TextEncoder().encode('STUDIO')}]);
 const bytes=new Uint8Array(await zip.arrayBuffer()),view=new DataView(bytes.buffer);
 assert.equal(zip.type,'application/zip');
 assert.equal(view.getUint32(0,true),0x04034b50);
 const end=bytes.length-22,centralOffset=view.getUint32(end+16,true);
 assert.equal(view.getUint32(centralOffset,true),0x02014b50);
 assert.equal(view.getUint16(end+10,true),2);
});

test('Audio Editor no longer exposes Reverse as an operation',()=>{
 const source=readFileSync(new URL('../source/modules/focused-tools.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/data-edit-view="reverse"|data-edit-mode="reverse"|reverseBuffer/);
});
