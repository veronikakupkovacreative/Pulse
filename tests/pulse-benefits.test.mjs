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
 assert.ok(toolModules.every(tool=>Object.hasOwn(TOOL_BENEFITS,tool.id)));
});
test('benefits appear between producer toolkit and directory, linked to active tab',()=>{
 const html=read('index.html'),app=read('app.mjs');
 assert.ok(html.indexOf('id="pulse-benefits-grid"')>html.indexOf('class="tool-board"'));
 assert.ok(html.indexOf('id="pulse-benefits-grid"')<html.indexOf('class="pulse-directory"'));
 assert.match(app,/renderToolBenefits\(definition\)/);
 assert.match(read('style.css'),/\.pulse-benefits\{background:#191919;color:#f5f4f0/);
});
test('existing AI mix and smart master tools use one local engine UI',()=>{
 assert.ok(toolModules.some(t=>t.id==='mix-master'));
 assert.ok(toolModules.some(t=>t.id==='master'));
 assert.match(read('modules/advanced-features.mjs'),/mountMasteringTool\(\{host:args.host,mode:'mix'\}\)/);
 assert.match(read('modules/features.mjs'),/mountMasteringTool\(\{host,mode:'smart'\}\)/);
 assert.equal(MASTER_PRESETS.streaming.target,-14);
 assert.throws(()=>masteringSettings({ceiling:1}));
});
