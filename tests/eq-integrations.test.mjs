import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/features.mjs';
import {TOOL_EDITORIAL} from '../source/modules/tool-editorial.mjs';
import {EQ_GENRE_PRESETS} from '../source/modules/eq-engine.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('AI Equalizer and Advanced Audio Equalizer preserve existing IDs',()=>{
 const eq3=toolModules.find(m=>m.id==='equalizer'),eq5=toolModules.find(m=>m.id==='eq5');
 assert.equal(eq3.label,'AI Equalizer');assert.equal(eq5.label,'Advanced Audio Equalizer');
 assert.equal(toolModules.filter(m=>m.id==='eq5').length,1);
 assert.equal(eq3.category,'edit');assert.equal(eq5.category,'edit');
});
test('3-band genre presets are wired to gain inputs',()=>{
 const source=read('modules/features.mjs');
 for(const key of ['edm','vocals','hiphop','acoustic']) {
  assert.match(source,new RegExp("'"+key+"'"));
  assert.ok(EQ_GENRE_PRESETS[key]);
 }
 assert.match(source,/EQ3_PRESETS\[button\.dataset\.preset\]/);
 assert.match(source,/bandOptions:\[3,10,20\]/);
 assert.match(source,/renderWithNodes\(b,filters\)/);
 assert.match(source,/mountEqResponse\(/);
});
test('advanced EQ supports actual 3/10/20-band DSP and interactive graph',()=>{
 const source=read('modules/eq-advanced.mjs'),graph=read('modules/eq-response.mjs');
 assert.match(source,/count===5\?await equalize5\(audio,typed\):await renderWithNodes\(audio,specs\)/);
 assert.match(source,/bandOptions:\[3,10,20\]/);
 assert.match(graph,/bandOptions = \[3,10,20\]/);
 assert.match(graph,/getFrequencyResponse/);
 assert.match(graph,/key==='ArrowUp'/);
});
test('both equalizers have individual editorial copy',()=>{
 assert.match(TOOL_EDITORIAL.equalizer.summary,/EDM, Vocals, Hip-Hop or Acoustic/);
 assert.match(TOOL_EDITORIAL.eq5.summary,/three, ten or twenty/);
});
test('EQ UI includes a black branded band switcher and no white inputs',()=>{
 const css=read('modules/eq-ui.css');
 assert.match(css,/background:#101010/);
 assert.doesNotMatch(css,/#f7e592|#f1da55/);
 assert.match(css,/\.eq-advanced-fields input\{background:transparent/);
});
