import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const css=read('modules/studio-reference.css'),html=read('index.html');
function luminance(hex){
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
  .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function contrast(a,b){const x=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (x[0]+.05)/(x[1]+.05);}
test('prototype dark tokens retain AA legibility on all real surfaces',()=>{
 for(const token of ['--paper:#0e0e0f','--surface:#141416','--ink:#f4f2ee',
  '--ink-2:#bdbab1','--accent:#ff4d1c','--on-accent:#14130f'])assert.ok(css.includes(token),token);
 assert.ok(contrast('#ff4d1c','#0e0e0f')>=4.5);
 assert.ok(contrast('#14130f','#ff4d1c')>=4.5);
 assert.ok(contrast('#bdbab1','#141416')>=4.5);
 assert.ok(contrast('#a19e95','#141416')>=4.5);
 assert.ok(contrast('#f4f2ee','#ff4d1c')<4.5,'white on accent must never be primary CTA text');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
});
test('prototype homepage and editor use shared functional shell, not demo audio',()=>{
 const {document}=parseHTML(html);
 assert.ok(document.querySelector('#pulse-hero-drop[data-open-audio]'));
 assert.ok(document.querySelector('.pulse-header-inner .brand[data-go-home]'));
 assert.ok(document.querySelector('.pulse-mobile-nav[aria-label]'));
 assert.ok(document.querySelector('#toolkit .tool-board.editor__grid'));
 assert.ok(document.querySelector('#pulse-editor-controls .pulse-edit-toolbar'));
 assert.ok(document.querySelector('#pulse-editor-properties .pulse-eq-graph'));
 assert.ok(document.querySelector('#pulse-editor-export select#pulse-export-format'));
 assert.doesNotMatch(html,/nothing is processed or uploaded|load demo track|night-drive_demo\.wav/);
});
test('AI hub has four linked groups with twelve registered modules',()=>{
 const {document}=parseHTML(html);
 const groups=document.querySelectorAll('#pulse-ai-hub .pulse-ai-hub-group');
 const buttons=document.querySelectorAll('#pulse-ai-hub button[data-open-tool]');
 assert.equal(groups.length,4);assert.equal(buttons.length,12);
 assert.equal(new Set([...buttons].map(x=>x.dataset.openTool)).size,12);
 assert.ok(document.querySelector('.header-nav [data-go-ai-hub]'));
 assert.ok(document.querySelector('.pulse-tool-card [data-go-ai-hub]'));
 const routing=read('modules/studio-redesign.mjs');
 assert.match(routing,/function navigateAiHub/);
 assert.match(routing,/hash==='#\/ai'/);
 assert.match(routing,/body\.classList\.add\('pulse-workspace-view','pulse-ai-hub-view'\)/);
});
test('canonical reference CSS loads after the legacy and protection styles',()=>{
 const registry=read('modules/index.mjs');
 const last=registry.lastIndexOf("document.head.append(darkStyle)");
 const protection=registry.lastIndexOf("document.head.append(protectionStyle)");
 assert.ok(protection>0 && last>protection);
 assert.match(css,/\.pulse-tool-module-host|\.tool-module-host/);
 assert.match(css,/#module-wav/);
 assert.match(css,/\.focus-song-summary/);
});
