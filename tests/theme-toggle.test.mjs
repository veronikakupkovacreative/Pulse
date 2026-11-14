import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('PULSE shell is dark-only regardless of OS preferences or saved light theme',()=>{
 const html=read('index.html'),css=read('modules/studio-reference.css');
 assert.match(html,/document.documentElement.setAttribute\('data-theme','dark'\)/);
 assert.match(css,/color-scheme:dark/);
 assert.match(css,/--ps-page:#0e0e0f/);
 assert.match(css,/--ps-red:#ff4d1c/);
 assert.doesNotMatch(html,/id="pulse-theme-toggle"/);
});
test('accessible production shell retains all original modules with active navigation',()=>{
 const html=read('index.html'),app=read('app.mjs'),styles=read('modules/index.mjs');
 for(const id of ['toolkit','tool-panel','tool-tabs','pulse-hero-drop','pulse-editor-properties','pulse-tool-directory','pulse-editor-export'])
   assert.ok(html.includes(id),'missing '+id);
 assert.match(html,/data-open-tool="editor"/);
 assert.match(app,/pulse:tool-mounted/);
 assert.match(styles,/studio-reference.css/);
});
test('local editor controls use shared DSP and have reachable keyboard actions',()=>{
 const js=read('modules/studio-redesign.mjs'),css=read('modules/studio-reference.css');
 for(const pattern of ['w.commit','w.undo','w.redo','renderWithNodes','convertBuffer','downloadConversion','w.setSelection'])assert.ok(js.includes(pattern),pattern);
 assert.match(css,/:focus-visible/);
 assert.match(css,/44px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
