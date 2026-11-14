import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('homepage uses the approved visual prototype, original logo and real file picker',()=>{
 const h=read('index.html');
 assert.match(h,/Find your <em>rhythm\.<\/em>/);
 assert.match(h,/class="brand-dot"/);
 assert.match(h,/class="brand-period"/);
 assert.match(h,/id="drop"/);
 assert.match(h,/data-open-audio/);
 assert.doesNotMatch(h,/load a demo track|night-drive_demo\.wav/i);
});
test('the current analyzer is connected to the shared audio source without demo results',()=>{
 const rt=read('modules/prototype-runtime.mjs');
 assert.match(rt,/w\.buffer/);
 assert.match(rt,/w\.markers/);
 assert.match(rt,/updateAnalyzer/);
 const h=read('index.html');
 assert.match(h,/data-proto-bpm/);
 assert.doesNotMatch(h,/Confidence 96%/);
});
test('legacy audio controls remain styled until their UI components are migrated',()=>{
 const old=read('modules/ui.css'),css=read('modules/studio-reference.css');
 assert.match(old,/\.audio-source-area/);
 assert.match(css,/\.tool-module-host/);
 assert.match(css,/data-proto-editor-source/);
});
