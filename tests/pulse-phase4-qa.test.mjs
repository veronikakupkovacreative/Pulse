import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleToolModules} from '../source/modules/index.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const css=read('modules/studio-reference.css');
const registry=read('modules/index.mjs');
const html=read('index.html');
test('23 tools remain registered across the three real workflows',()=>{
 assert.equal(visibleToolModules.length,23);
 assert.deepEqual([...new Set(visibleToolModules.map(m=>m.category))].sort(),['analyze','create','prepare']);
 for(const id of ['song-analyzer','music-tagger','editor','wav','visualizer','release-preflight','audio-protection'])
  assert.ok(visibleToolModules.some(m=>m.id===id),id);
});
test('PULSE dark theme is the sole active canonical design',()=>{
 for(const token of ['--paper:#0e0e0f','--surface:#141416','--accent:#ff4d1c','--on-accent:#14130f'])
  assert.ok(css.includes(token),token);
 assert.ok(registry.includes('"studio-reference.css"'));
 assert.doesNotMatch(registry,/pulse-design-system\.css|theme\.css/);
 assert.match(html,/data-theme','dark'/);
});
test('shared audio engine and local/cloud status remain in the UI',()=>{
 const rt=read('modules/prototype-runtime.mjs');
 assert.match(rt,/workspace as w/);
 assert.match(rt,/w\.load\(file\)/);
 assert.match(rt,/w\.markers/);
 assert.match(html,/SOURCE AUDIO/);
 assert.match(html,/data-view="analyzer"/);
 assert.match(html,/data-view="editor"/);
 assert.match(rt,/initializePrototypeRuntime/);
});
test('editor and analysis maintain usable responsive, focus and low-motion states',()=>{
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/\[data-proto-editor-source\]/);
 assert.match(css,/\.focus-song-main/);
});
