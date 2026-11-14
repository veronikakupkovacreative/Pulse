import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
test('editor refresh traverses NodeLists rather than a single element',()=>{
 const js=read('modules/studio-redesign.mjs');
 assert.match(js,/\$\$\('\[data-editor-action\]'\)\.forEach/);
 assert.match(js,/\$\$\('\[data-editor-mode\]'\)\.forEach/);
 assert.doesNotMatch(js,/(?<!\$)\$\('\[data-editor-(?:action|mode)\]'\)\.forEach/);
});
test('protection appears as a PREPARE module reachable from homepage and footer',()=>{
 const modules=read('modules/index.mjs'),page=read('index.html');
 const app=read('modules/studio-redesign.mjs');
 assert.match(modules,/audioProtectionModule/);
 assert.match(page,/data-open-tool="audio-protection"/);
 assert.match(app,/'audio-protection':'#\/protection'/);
});
