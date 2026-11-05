import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const html=read('index.html'),css=read('modules/studio-spa.css');
test('DAW SPA has a persistent header, sidebar, central workspace and inspector',()=>{
 for(const selector of ['class="studio-app"','class="studio-topbar"','class="studio-sidebar"','class="studio-main"','class="studio-inspector"','id="toolkit"','class="tool-empty"','id="tool-panel"','id="tool-tabs"'])assert.ok(html.includes(selector),selector);
 assert.ok(!html.includes('class="hero"'));assert.ok(!html.includes('id="analyzer"'));assert.ok(!html.includes('class="pulse-directory"'));
 assert.match(css,/height:100dvh/);
});
test('all existing toolkit categories and AI Studio remain reachable',()=>{
 for(const name of ['analyze','edit','export','ai','visuals'])assert.ok(html.includes('data-category="'+name+'"'));
 assert.ok(html.includes('AI STUDIO'));
});
test('editorial and benefit target IDs remain mounted inside inspector',()=>{
 for(const id of ['toolkit-title','pulse-tool-summary','pulse-tool-steps','pulse-benefits-grid','category-number','blank-panel'])assert.ok(html.includes('id="'+id+'"'));
});
test('Load Demo Track, import and 24-bit WAV export are wired to the real workspace',()=>{
 const shell=read('modules/studio-shell.mjs');
 for(const id of ['studio-load-demo','studio-import','studio-export'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(shell,/createDemoTrack\(/);assert.match(shell,/await workspace\.load\(file\)/);assert.match(shell,/workspace\.save\(24,false\)/);
});

test('Rhythm analysis updates the shared tempo grid, while zoom and pan use real viewport state',()=>{
 const feature=read('modules/features.mjs'),source=read('modules/source-ui.mjs'),workspace=read('modules/workspace.mjs');
 assert.match(feature,/new CustomEvent\('pulse:tempo'/);
 assert.match(source,/w\.zoomAt\(v\)/);
 assert.match(source,/w\.panWave\(1\)/);
 assert.match(workspace,/setViewport\(zoom=1,start=0\)/);
});
