import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('DAW SPA replaces the previous landing hero with a persistent local workspace',()=>{
 const h=read('index.html'),c=read('modules/studio-spa.css');
 assert.match(h,/class="studio-spa"/);
 assert.match(h,/class="studio-sidebar"/);
 assert.match(h,/class="studio-inspector"/);
 assert.match(h,/id="studio-load-demo"/);
 assert.doesNotMatch(h,/class="hero"/);
 assert.match(c,/height:100dvh/);
});
test('brand preserves Arial, PULSE red and square edges in the DAW shell',()=>{
 const c=read('modules/studio-spa.css');
 assert.match(c,/#ff2b20/);
 assert.match(c,/Arial/);
 assert.match(c,/border-radius:0/);
});
test('all legacy and web inspectors have PULSE styles',()=>{
 const a=read('modules/legacy-tools.mjs'),b=read('modules/web-tools.mjs'),c=read('modules/ui.css');
 assert.match(a,/tool-view module-work pulse-legacy/);
 assert.equal((b.match(/tool-view module-work pulse-web-tool/g)||[]).length,4);
 for(const p of ['.pulse-legacy-presets button','.pulse-legacy-fields input','.pulse-web-tool .pulse-fx-field select','.pulse-web-tool .pulse-fx-file-label input[type="file"]'])assert.ok(c.includes(p),p);
 assert.match(c,/\.pulse-legacy-fields input\s*\{[^}]*background:transparent/s);
 assert.match(c,/\.pulse-web-tool \.pulse-fx-field select\s*\{[^}]*background:transparent/s);
});
