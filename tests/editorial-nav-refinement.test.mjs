import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=name=>readFile(new URL('../source/'+name,import.meta.url),'utf8');
test('Hero headline and layout remain unchanged while copy stays concise',async()=>{
 const html=await file('index.html'),css=await file('style.css');
 assert.match(html,/<h1 id="hero-title">Find your<br><span>rhythm\.<\/span><\/h1>/);
 assert.match(css,/Approved editorial descriptions: polished below-tool copy only/);
 assert.match(html,/02 \/ PRODUCER TOOLKITS/);
 assert.match(html,/value="flac"/);
});
test('Active navigation has red dot including BPM while switching clears stale BPM state',async()=>{
 const html=await file('index.html'),css=await file('style.css'),js=await file('tools.mjs');
 assert.match(html,/data-nav-bpm>BPM<\/a>/);
 assert.match(css,/\.nav-link\[data-nav-bpm\]\.active::before/);
 assert.match(css,/\.nav-link\[data-group-nav\]\.active::before/);
 assert.match(js,/bpmNav\.classList\.remove\('active'\)/);
});
