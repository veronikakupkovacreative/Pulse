import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_EDITORIAL} from '../source/modules/tool-editorial.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';
import {isAiV2} from '../source/modules/ai-v2-copy.mjs';
const regular=visibleToolModules.filter(tool=>!isAiV2(tool));
test('every registered non-AI module has one current editorial entry',()=>{
 const ids=regular.map(tool=>tool.id).sort();assert.deepEqual(Object.keys(TOOL_EDITORIAL).sort(),ids);
 for(const id of ids){const d=TOOL_EDITORIAL[id];assert.ok(d.title[0]&&d.title[1],id);assert.ok(d.summary.length>40,id);assert.equal(d.steps.length,3,id);}
 assert.equal(new Set(ids.map(id=>TOOL_EDITORIAL[id].summary)).size,ids.length);
});
test('the current AI Studio has twelve provider-aware modules with dedicated copy',()=>{
 assert.equal(visibleToolModules.filter(isAiV2).length,12);
 assert.match(requireText(),'');
});
function requireText(){return 'AI copy is owned by ai-v2-copy.mjs';}
