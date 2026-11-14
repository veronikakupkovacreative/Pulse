import test from 'node:test';
import assert from 'node:assert/strict';
import {advancedEqualizerModule} from '../source/modules/eq-advanced.mjs';
import {EQ_GENRE_PRESETS,bandLayout,eqFilters} from '../source/modules/eq-engine.mjs';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('advanced equalizer is embedded in the Audio Editor, not a standalone catalogue tool',()=>{
 assert.equal(advancedEqualizerModule.id,'eq5');
 assert.match(read('modules/focused-tools.mjs'),/advancedEqualizerModule\.mount/);
 assert.doesNotMatch(read('modules/index.mjs'),/features\.mjs|legacy-tools|creative-tools/);
});
test('EQ presets and layouts support three, five, ten and twenty bands',()=>{
 for(const key of ['edm','vocals','hiphop','acoustic'])assert.ok(EQ_GENRE_PRESETS[key]);
 for(const count of [3,5,10,20]){assert.equal(bandLayout(count).length,count);assert.equal(eqFilters(count,Array(count).fill(0)).length,count);}
});
test('advanced EQ graph retains real DSP and keyboard support',()=>{
 const source=read('modules/eq-advanced.mjs'),graph=read('modules/eq-response.mjs');
 assert.match(source,/renderWithNodes/);assert.match(source,/bandOptions:\[3,10,20\]/);
 assert.match(graph,/getFrequencyResponse/);assert.match(graph,/key==='ArrowUp'/);
});
