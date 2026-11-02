import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('hero content matches exact approved reference',()=>{
 const h=read('index.html');
 assert.match(h,/Pulse Studio brings common audio edits into one focused workspace/);
 assert.match(h,/class="pulse-format-tags" aria-label="Export formats"><span>MP3<\/span><span>WAV<\/span><span>M4A<\/span><span>FLAC<\/span>/);
});
test('reference red BPM section stays isolated from DSP',()=>{
 const c=read('style.css');assert.match(c,/Exact source: 10997574ca69082c15aa3f87fbe41009634bf09b/);
 assert.match(c,/#analyzer\.pulse-bpm-section \.bpm-result-panel\s*\{[^}]*background:#ff2b20/s);
});
test('all legacy and web inspectors have PULSE styles',()=>{
 const a=read('modules/legacy-tools.mjs'),b=read('modules/web-tools.mjs'),c=read('modules/ui.css');
 assert.match(a,/tool-view module-work pulse-legacy/);
 assert.equal((b.match(/tool-view module-work pulse-web-tool/g)||[]).length,4);
 for(const p of ['.pulse-legacy-presets button','.pulse-legacy-fields input','.pulse-web-tool .pulse-fx-field select','.pulse-web-tool .pulse-fx-file-label input[type="file"]'])assert.ok(c.includes(p),p);
 assert.match(c,/\.pulse-legacy-fields input\s*\{[^}]*background:transparent/s);
 assert.match(c,/\.pulse-web-tool \.pulse-fx-field select\s*\{[^}]*background:transparent/s);
});
