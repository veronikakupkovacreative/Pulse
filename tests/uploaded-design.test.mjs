import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('uploaded design typography is loaded on real application screens',()=>{
 const html=read('index.html'),css=read('modules/studio-reference.css');
 for(const font of ['Space+Grotesk','JetBrains+Mono','Inter:wght'])assert.ok(html.includes(font),'missing '+font);
 assert.match(css,/--accent:#ff4d1c/);
 assert.match(html,/data-view="editor"/);
 assert.match(html,/data-view="analyzer"/);
 assert.match(html,/data-view="converter"/);
 assert.match(html,/id="pulse-proto-root"/);
});
test('user-uploaded demo does not override real audio/AI workflows',()=>{
 const html=read('index.html'),app=read('app.mjs'),ui=read('modules/prototype-runtime.mjs');
 assert.doesNotMatch(html,/Clickable prototype|nothing is processed or uploaded|night-drive_demo\.wav/);
 assert.match(html,/id="pulse-legacy-host" hidden/);
 assert.match(ui,/import \{workspace as w\} from '\.\/workspace\.mjs'/);
 assert.match(app,/initializePrototypeRuntime/);
 for(const id of ['audio-protection','song-analyzer','editor','wav'])assert.ok(html.includes('data-open-tool="'+id+'"'));
});
