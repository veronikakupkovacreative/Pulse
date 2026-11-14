import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/features.mjs';
import {TOOL_BENEFITS} from '../source/modules/tool-benefits.mjs';
import {MASTER_PRESETS,masteringSettings} from '../source/modules/mastering-engine.mjs';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
test('all registered tools have three individual and truthful benefits',()=>{
 const descriptions=new Set();
 for(const tool of toolModules){
  const items=TOOL_BENEFITS[tool.id];assert.ok(items,tool.id);
  assert.equal(items.length,3,tool.id);
  for(const [title,copy] of items){
   assert.ok(title.length>=5&&copy.length>=30,tool.id);
   assert.ok(!descriptions.has(copy),'Duplicate benefit: '+copy);
   descriptions.add(copy);
  }
 }
 // Legacy catalog plus Song Analyzer, Music Tagger, Visualizer Lyrics Generator and MusicAI.
 assert.equal(Object.keys(TOOL_BENEFITS).length,toolModules.length+11);
 assert.equal(TOOL_BENEFITS['ai2-lyrics'].length,3);
 assert.equal(TOOL_BENEFITS['song-analyzer'].length,3);
});
test('tool descriptions are concise and optional help replaces the duplicate benefits wall',()=>{
 const html=read('index.html'),app=read('app.mjs');
 assert.match(html,/class="pulse-howto"/);
 assert.match(html,/<details class="pulse-howto">/);
 assert.doesNotMatch(html,/class="pulse-benefits"/);
 assert.doesNotMatch(app,/renderToolBenefits/);
 assert.match(app,/toolSummaries/);
 assert.match(app,/removeAttribute\('open'\)/);
});
test('existing AI mix and smart master tools use one local engine UI',()=>{
 assert.ok(toolModules.some(t=>t.id==='mix-master'));
 assert.ok(toolModules.some(t=>t.id==='master'));
 assert.match(read('modules/advanced-features.mjs'),/mountMasteringTool\(\{host:args.host,mode:'mix'\}\)/);
 assert.match(read('modules/features.mjs'),/mountMasteringTool\(\{host,mode:'smart'\}\)/);
 assert.equal(MASTER_PRESETS.streaming.target,-14);
 assert.throws(()=>masteringSettings({ceiling:1}));
});
