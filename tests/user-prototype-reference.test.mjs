import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('exact user design is retained separately from the functional app',()=>{
 const reference=read('design/reference/pulse-studio-ui-v2.html');
 const real=read('source/index.html');
 assert.match(reference,/PULSE Studio — clickable prototype/);
 assert.match(reference,/Nothing is processed/);
 assert.match(real,/PULSE Studio — Audio Workspace/);
 assert.doesNotMatch(real,/night-drive_demo|prototype: loads a pretend file/i);
});
test('the home waveform reflects source audio and matches 90-bar design',()=>{
 const runtime=read('source/modules/prototype-runtime.mjs');
 assert.match(runtime,/function renderHeroWave\(/);
 assert.match(runtime,/barCount=90/);
 assert.match(runtime,/audio\.getChannelData\(channel\)/);
 assert.match(runtime,/host\.replaceChildren\(fragment\)/);
 assert.match(runtime,/initHub\(\);renderHeroWave\(\);/);
});
test('editor's waveform ruler uses eight dynamic timeline labels',()=>{
 const source=read('source/modules/source-ui.mjs');
 assert.match(source,/for\(let i=0;i<=7;i\+\+\)/);
 assert.match(source,/view\+span\*i\/7/);
});
test('source audio remains shared and the original engine stays active',()=>{
 const runtime=read('source/modules/prototype-runtime.mjs');
 const app=read('source/app.mjs');
 assert.match(runtime,/workspace as w/);
 assert.match(runtime,/w\.load\(file\)/);
 assert.match(app,/initializePrototypeRuntime/);
});
