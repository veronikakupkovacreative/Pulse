import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('Song Analyzer screen uses real result slots and no hard-coded demo metrics',()=>{
 const {document}=parseHTML(read('index.html')),view=document.querySelector('#pulse-proto-root [data-view="analyzer"]');
 assert.ok(view);
 for(const selector of ['[data-proto-bpm]','[data-proto-key]','[data-proto-camelot]','[data-proto-confidence]','#proto-beat-count','#proto-chords'])assert.ok(view.querySelector(selector),selector);
 assert.doesNotMatch(view.textContent,/124 BPM|A minor|96% confidence|night-drive_demo/i);
});
test('Song Analyzer uses shared SOURCE AUDIO with rhythm and harmony workers',()=>{
 const ui=read('modules/focused-tools.mjs'),rhythm=read('modules/rhythm-client.mjs'),harmony=read('modules/harmony-client.mjs');
 assert.match(ui,/analyzeRhythmInWorker/);assert.match(ui,/analyzeHarmonyInWorker/);
 assert.match(ui,/w\.ensureAudio\(\)/);assert.match(ui,/w\.setMarkers\(beats\)/);
 assert.match(rhythm,/Worker/);assert.match(harmony,/Worker/);
 assert.doesNotMatch(ui,/type="file"|data-analyzer-upload/);
});
test('prototype runtime mirrors actual analyzer results into the visible screen',()=>{
 const studio=read('modules/studio-redesign.mjs');
 for(const token of ['data-proto-bpm','data-proto-key','data-proto-camelot','data-proto-confidence','data-proto-chords'])assert.ok(runtime.includes(token),token);
 assert.match(studio,/pulse:tool-mounted/);
});
