import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
function luminance(hex){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
const contrast=(a,b)=>{const v=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (v[0]+.05)/(v[1]+.05)};
test('the exact prototype screens are the visible app; the hidden host contains only engine nodes',()=>{
 const html=read('index.html'),{document}=parseHTML(html),root=document.querySelector('#pulse-proto-root'),legacy=document.querySelector('#pulse-legacy-host');
 assert.ok(root&&legacy&&legacy.hidden);
 for(const view of ['home','analyzer','tagger','editor','converter','ai','ai-tool','visualizer'])assert.ok(root.querySelector('[data-view="'+view+'"]'),view);
 for(const id of ['toolkit','tool-tabs','tool-panel','blank-panel','pulse-editor-controls','pulse-editor-transport','pulse-editor-properties','pulse-editor-history','pulse-editor-export'])assert.ok(legacy.querySelector('#'+id),id);
 assert.ok(legacy.querySelector('.tool-empty'));
 assert.equal(legacy.querySelectorAll('.hero,.pulse-tool-directory,.pulse-footer').length,0);
 assert.doesNotMatch(legacy.innerHTML,/pulse-bitrate-guide|pulse-hero-drop|night-drive_demo\.wav|Load demo track/);
 assert.ok(root.querySelector('#drop[data-open-audio]'));
});
test('dark-only prototype tokens retain readable contrast and accessible controls',()=>{
 const css=read('modules/studio-reference.css'),html=read('index.html'),app=read('app.mjs');
 assert.match(html,/setAttribute\('data-theme','dark'\)/);
 assert.match(css,/--paper:\s*#0e0e0f/);assert.match(css,/--surface:\s*#141416/);
 assert.match(css,/--ink:\s*#f4f2ee/);assert.match(css,/--ink-2:\s*#bdbab1/);
 assert.match(css,/--ink-3:\s*#8f8c82/);assert.match(css,/--accent:\s*#ff4d1c/);
 assert.ok(contrast('#f4f2ee','#0e0e0f')>=7);
 assert.ok(contrast('#bdbab1','#141416')>=4.5);
 assert.ok(contrast('#8f8c82','#141416')>=4.5);
 assert.ok(contrast('#14130f','#ff4d1c')>=4.5);
 assert.ok(contrast('#f4f2ee','#ff4d1c')<4.5);
 assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion:\s*reduce/);
 assert.doesNotMatch(html,/modules\/theme\.css|pulse-theme-toggle/);
 assert.doesNotMatch(app,/theme-toggle|initializeThemeToggle|pulse-bitrate-guide/);
});
test('the runtime loads only current registries and no retired catalogue or install scripts',()=>{
 const registry=read('modules/index.mjs'),build=read('../scripts/build.mjs'),pkg=JSON.parse(read('../package.json'));
 assert.match(registry,/converter-tool\.mjs/);assert.match(registry,/visualizer\.mjs/);
 assert.doesNotMatch(registry,/features\.mjs|pulse-ai-master|pulse-design-system\.css/);
 assert.doesNotMatch(build,/reference-ui\.mjs|source,'song'/);
 assert.equal(pkg.scripts.build,'node scripts/build.mjs');
});
