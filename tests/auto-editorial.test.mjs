import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_EDITORIAL,renderToolEditorial} from '../source/modules/tool-editorial.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';
import {isAiV2} from '../source/modules/ai-v2-copy.mjs';
const regular=visibleToolModules.filter(tool=>!isAiV2(tool));
test('every registered non-AI module has one current editorial entry',()=>{
 const ids=regular.map(tool=>tool.id).sort();assert.deepEqual(Object.keys(TOOL_EDITORIAL).sort(),ids);
 for(const id of ids){const d=TOOL_EDITORIAL[id];assert.ok(d.title[0]&&d.title[1],id);assert.ok(d.summary.length>40,id);assert.equal(d.steps.length,3,id);}
 assert.equal(new Set(ids.map(id=>TOOL_EDITORIAL[id].summary)).size,ids.length);
});
test('editorial content updates the active tool title and usage steps',()=>{
 const elements=new Map(),node=name=>({name,textContent:'',children:[],classList:{toggle(){}},replaceChildren(...items){this.children=items}});
 for(const id of ['#toolkit-title','#pulse-tool-summary','#pulse-tool-steps'])elements.set(id,node(id));
 const doc={querySelector:id=>elements.get(id),createElement:name=>node(name)};
 renderToolEditorial({id:'wav',label:'Audio Converter'},doc);assert.match(elements.get('#pulse-tool-summary').textContent,/convert/i);
 assert.equal(elements.get('#pulse-tool-steps').children.length,3);
 renderToolEditorial({id:'audio-protection',label:'Audio Protection'},doc);assert.match(elements.get('#pulse-tool-summary').textContent,/watermark/i);
});
test('AI Studio uses its dedicated copy module for twelve modules',()=>{
 assert.equal(visibleToolModules.filter(isAiV2).length,12);assert.match(isAiV2.toString(),/Object\.hasOwn/);
});
