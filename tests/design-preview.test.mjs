import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL('../source/design-preview/'+name,import.meta.url),'utf8');
test('uploaded design is available as a separate, clearly labeled static reference',()=>{
 const html=read('index.html');
 assert.match(html,/DESIGN REFERENCE/);
 assert.match(html,/data-view="home"/);
 for(const route of ['analyzer','editor','converter','tagger','ai','visualizer'])
   assert.ok(html.includes('data-view="'+route+'"'),route);
 assert.match(html,/src="\.\/preview\.mjs"/);
 assert.doesNotMatch(html,/src="source\/app\.mjs"/);
 assert.doesNotMatch(html,/src="\/app\.mjs"/);
});
test('reference preview never claims real upload or DSP processing',()=>{
 const js=read('preview.mjs');
 assert.match(js,/Demonstrative interactions only/);
 assert.match(js,/no audio engine/);
 assert.doesNotMatch(js,/fetch\(|\\.arrayBuffer\(|AudioContext|\\.decodeAudioData\(/);
});
test('uploaded brand rules and functional app remain separate',()=>{
 const css=read('style.css');
 const working=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(css,/--accent:\s*#ff4d1c/);
 assert.match(css,/--paper:\s*#0e0e0f/);
 assert.match(working,/id="pulse-proto-root"/);
 assert.match(working,/id="pulse-legacy-host"/);
 assert.match(build,/cp\(join\(source,'design-preview'\),join\(output,'design-preview'\),\{recursive:true\}\)/);
});
