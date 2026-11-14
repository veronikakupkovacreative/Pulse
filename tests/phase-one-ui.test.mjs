import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const html=read('index.html'),css=read('modules/phase-one-reference.css'),runtime=read('modules/phase-one-runtime.mjs'),app=read('app.mjs');
test('phase one includes approved dark visual identity',()=>{
 for(const token of ['#0e0e0f','#141416','#ff4d1c','#f4f2ee'])assert.ok(css.includes(token),token);
 for(const font of ['Space Grotesk','JetBrains Mono','Inter'])assert.ok(css.includes(font),font);
 assert.match(css,/@scope \(#pulse-phase-one\)/);
 assert.match(html,/id="pulse-phase-one"/);
 assert.match(html,/id="toolkit-cards"/);
});
test('phase one keeps exactly one existing live toolkit and audio source',()=>{
 for(const id of ['toolkit','tool-panel','tool-tabs','blank-panel'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.doesNotMatch(html,/id="pulse-legacy-host"/);
 assert.match(runtime,/w\.load\(file\)/);
 assert.match(runtime,/getElementById\('audio-file'\)/);
 assert.match(app,/definition\.mount/);
 assert.doesNotMatch(runtime,/setInterval|pretend|demo track loaded/);
});
test('navigation routes to existing real tool mounts',()=>{
 for(const id of ['song-analyzer','music-tagger','editor','wav','visualizer'])assert.match(html,new RegExp('data-open-tool="'+id+'"'));
 assert.match(html,/data-phase-category="create"/);
 assert.doesNotMatch(runtime,/location\.hash\s*=/);
});

test('homepage displays only reference UI and its single footer',()=>{
 assert.equal(html.split('<footer ').length-1,1);
 assert.ok(html.includes('<footer class="footer" id="pulse-phase-footer">'));
 assert.ok(!html.includes('<footer class="pulse-footer"'));
 assert.ok(html.includes('id="pulse-legacy-workspace" hidden'));
 assert.ok(html.indexOf('id="pulse-phase-footer"')<html.indexOf('id="pulse-legacy-workspace"'));
 assert.ok(css.includes('#pulse-legacy-workspace[hidden]{display:none!important}'));
 assert.ok(css.includes('#pulse-phase-one[data-view="tool"] > main{display:none!important}'));
 assert.ok(runtime.includes("root.dataset.view='home'"));
 assert.ok(runtime.includes("root.dataset.view='tool'"));
});
