import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleToolModules} from '../source/modules/index.mjs';

const read=(path)=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const css=read('modules/pulse-design-system.css');
const index=read('modules/index.mjs');
const html=read('index.html');
const fg='#191919',red='#ff2b20',white='#ffffff';
function luminance(hex){
 const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const linear=channels.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrast(a,b){
 const ls=[luminance(a),luminance(b)].sort((a,b)=>b-a);
 return (ls[0]+.05)/(ls[1]+.05);
}
test('canonical tokens are shared and readable at body-text contrast',()=>{
 assert.match(css,/--pulse-red:#ff2b20;/);
 assert.match(css,/--pulse-ink:#191919;/);
 assert.match(css,/--pulse-white:#fff;/);
 assert.ok(contrast(fg,red)>=4.5,'black text must be legible on red');
 assert.ok(contrast(fg,white)>=7,'white-on-black CTA must be AAA');
});
test('unified stylesheet is appended after all legacy module CSS',()=>{
 assert.match(index,/designStyle\.href='\/modules\/pulse-design-system\.css'/);
 const ai=index.indexOf("aiV2Style.href='/modules/ai-v2.css'");
 const design=index.indexOf("designStyle.href='/modules/pulse-design-system.css'");
 assert.ok(ai>=0&&design>ai);
});
test('red tool surface includes AI, mastering, editor, and focused song analyzer',()=>{
 for(const needle of [
  'html[data-theme="dark"] .tool-settings',
  '.focus-song-v3,.focus-editor,.pulse-workspace-actions',
  '.ai2-panel,.pulse-master-work,.focus-module',
  '.focus-song-main,.focus-song-tonality>div',
  '.ai2-metrics>div,.focus-analysis-metrics>div',
  '.pulse-master-reports>div',
  '.pulse-workspace-actions-buttons button[data-workspace-export]'
 ])assert.ok(css.includes(needle),needle);
 assert.match(css,/--pulse-tool-bg:var\(--pulse-red\)/);
 assert.match(css,/background:var\(--pulse-red\);/);
 assert.match(css,/background:var\(--pulse-ink\);/);
 assert.match(css,/color:var\(--pulse-white\);/);
});
test('only Producer Toolkits Song Analyzer renders and uses shared RED design scope',()=>{
 assert.doesNotMatch(css,/#analyzer\s*[.{]/);
 assert.ok(html.includes('id="analyzer"')); // retained fragment alias for old links
 assert.ok(html.includes('id="toolkit"'));
 assert.doesNotMatch(html,/class="pulse-song-analyzer"/);
 assert.doesNotMatch(html,/src="\/song\/song-ui.mjs"/);
 assert.match(css,/\.focus-song-v3/);
});
test('five categories and all eight AI Studio tools remain registered unchanged',()=>{
 assert.deepEqual([...new Set(visibleToolModules.map(x=>x.category))],['analyze','edit','export','ai','visuals']);
 assert.equal(visibleToolModules.filter(x=>x.category==='ai').length,8);
 assert.deepEqual(visibleToolModules.slice(4,12).map(x=>x.id),[
  'ai2-mastering','ai2-stereo','ai2-vocals','ai2-beat',
  'ai2-mix','ai2-repair','ai2-pitch','ai2-fx'
 ]);
});
test('system specifies consistent casing, focus and responsive states',()=>{
 assert.match(css,/text-transform:uppercase;/);
 assert.match(css,/text-transform:none;/);
 assert.match(css,/:focus-visible\{/);
 assert.match(css,/@media\(max-width:440px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
