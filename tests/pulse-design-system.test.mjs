import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleToolModules} from '../source/modules/index.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const css=read('modules/studio-reference.css'),index=read('modules/index.mjs'),html=read('index.html');
function luminance(hex){
 const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
 return v[0]*.2126+v[1]*.7152+v[2]*.0722;
}
function contrast(a,b){const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(x+.05)/(y+.05)}
test('one dark visual system provides accessible foreground and action contrast',()=>{
 for(const name of ['--paper:#0e0e0f','--surface:#141416','--ink:#f4f2ee','--ink-2:#bdbab1','--accent:#ff4d1c','--on-accent:#14130f'])
  assert.ok(css.includes(name),'missing '+name);
 assert.ok(contrast('#f4f2ee','#141416')>=4.5);
 assert.ok(contrast('#bdbab1','#141416')>=4.5);
 assert.ok(contrast('#14130f','#ff4d1c')>=4.5);
 assert.ok(contrast('#ff4d1c','#141416')>=4.5);
});
test('only the active prototype style is the final stylesheet',()=>{
 const pos=index.indexOf(""studio-reference.css"");
 assert.ok(pos>index.indexOf(""ui.css""));
 assert.doesNotMatch(index,/pulse-design-system\.css|studio-redesign\.css|theme\.css/);
 assert.doesNotMatch(html,/href="\/modules\/theme\.css"/);
});
test('actual UI is prototype-driven, with separate analyzer and editor screens',()=>{
 for(const view of ['home','analyzer','tagger','editor','converter','ai','ai-tool','visualizer'])
  assert.ok(html.includes('data-view="'+view+'"'),'missing '+view);
 assert.match(html,/id="pulse-proto-root"/);
 assert.match(html,/id="pulse-legacy-host" hidden/);
 assert.doesNotMatch(html,/src="\/song\/song-ui\.mjs"/);
});
test('all registered production tools retain unique IDs and valid categories',()=>{
 assert.equal(visibleToolModules.length,23);
 assert.equal(new Set(visibleToolModules.map(x=>x.id)).size,visibleToolModules.length);
 assert.deepEqual([...new Set(visibleToolModules.map(x=>x.category))].sort(),['analyze','create','prepare']);
 const ids=['ai2-mastering','ai2-stereo','ai2-vocals','ai2-beat','ai2-mix','ai2-repair','ai2-pitch','ai2-fx','ai2-lyrics','ai2-musicai','ai2-watermark','ai2-extraction'];
 ids.forEach(id=>assert.ok(visibleToolModules.some(x=>x.id===id),id));
});
test('responsive and keyboard accessibility stay in the active stylesheet',()=>{
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/min-height:44px/);
});
