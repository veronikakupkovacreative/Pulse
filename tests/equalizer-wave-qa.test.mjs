import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const load=path=>readFile(new URL(path,root),'utf8');

test('EQ keeps original PULSE layout with waveform and overview before yellow response',async()=>{
 const html=await load('source/index.html');
 const a=html.indexOf('class="tool-source"'),b=html.indexOf('id="tool-waveform"'),
   c=html.indexOf('id="eq-overview-canvas"'),d=html.indexOf('id="eq-response-graph"'),
   e=html.indexOf('class="tool-settings"');
 assert.ok(a>=0&&a<b&&b<c&&c<d&&d<e);
 assert.match(html,/id="eq-split-channels"/);
 assert.match(html,/id="eq-fit-track"/);
 assert.match(html,/id="eq-ab-toggle"/);
 assert.match(html,/id="eq-peak-info"/);
});
test('EQ toolbar has only concise primary actions, advanced tools are collapsed',async()=>{
 const html=await load('source/index.html'),start=html.indexOf('id="eq-wave-editor"');
 const chunk=html.slice(start,html.indexOf('class="waveform-toolbar"',start));
 assert.match(chunk,/class="wave-edit-details"/);
 assert.match(chunk,/<details/);
 assert.ok(!chunk.includes('WAVEFORM EDITOR</strong>'));
 assert.ok(chunk.includes('SELECT RANGE')&&chunk.includes('PLAY SELECTION'));
});
test('live EQ bypass maintains all filters and restores original gain',async()=>{
 const extra=await load('source/extra-tools.mjs');
 assert.match(extra,/eqBands:readEq\(\)\.map\(/);
 assert.match(extra,/bypass\?1:10\*\*\(eqState\.gainDb\/20\)/);
 assert.match(extra,/eq-ab-toggle/);
 assert.match(extra,/syncAB\(/);
});
test('overview navigation and selectable L/R drawing exist and keep waveform zoom',async()=>{
 const tools=await load('source/tools.mjs');
 assert.match(tools,/function drawEqOverview\(/);
 assert.match(tools,/function updateEqOverviewPosition\(/);
 assert.match(tools,/function seekOverview\(/);
 assert.match(tools,/eq-split-channels/);
 assert.match(tools,/drawEqOverview\(\)/);
 assert.match(tools,/function setZoom\(/);
});
