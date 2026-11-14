import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../source/modules/'+path, import.meta.url),'utf8');
test('protection uses shared workspace and adds no independent audio upload', () => {
 const wrapper=read('audio-protection-tool.mjs');
 const ui=read('protection-ui.mjs');
 assert.match(wrapper,/buffer:\s*w\.buffer/);
 assert.match(wrapper,/w\.subscribe/);
 assert.doesNotMatch(ui, /type="file"|type="url"|ap-check-file|ap-choose-source|ap-voice-file/);
 assert.match(ui,/id="ap-process"/);
 assert.match(ui,/id="ap-check"/);
});
test('protection UI keeps the dark PULSE orange and 24-bit export',()=>{
 const css=read('protection.css');
 assert.match(css, /--ap-red:#ff4d1c/);
 assert.match(css, /color:#14130f/);
 assert.match(read('protection-ui.mjs'),/encodeWav24/);
});
