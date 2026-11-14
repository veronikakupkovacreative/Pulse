import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleToolModules} from '../source/modules/index.mjs';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';
import {mergePreparedAudio} from '../source/modules/focused-tools.mjs';
import {fromChannels} from '../source/modules/dsp.mjs';

test('PULSE registers all existing AI modules once, plus five producer workflows',()=>{
 const ids=visibleToolModules.map(m=>m.id);
 assert.equal(ids.length,23);
 assert.equal(new Set(ids).size,ids.length);
 for(const item of aiV2Modules)assert.equal(ids.filter(id=>id===item.id).length,1,item.id);
 for(const id of ['release-preflight','vocal-session-mapper','smart-sample-finder','sample-pack-lab','stem-delivery-studio'])assert.ok(ids.includes(id),id);
 assert.deepEqual([...new Set(visibleToolModules.map(m=>m.category))].sort(),['analyze','create','prepare']);
 for(const tool of visibleToolModules)assert.equal(typeof tool.mount,'function',tool.id);
});

test('directory and footer link only to registered modules',()=>{
 const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/data-open-tool="([^"]+)"/g)].map(m=>m[1]);
 const allowed=new Set(visibleToolModules.map(m=>m.id));
 assert.ok(ids.length>=15);
 for(const id of ids)assert.ok(allowed.has(id),'Unknown or obsolete link: '+id);
 assert.equal((html.match(/data-category="/g)||[]).length,3);
 assert.ok(html.includes('ANALYZE')&&html.includes('CREATE')&&html.includes('PREPARE'));
 assert.ok(!html.includes('data-open-tool="rhythm"'));
});

test('editor merges audio without changing the input buffers',()=>{
 const rate=1000,a=fromChannels([new Float32Array(100).fill(.5)],rate),b=fromChannels([new Float32Array(100).fill(.25)],rate);
 const merged=mergePreparedAudio([a,b]);
 assert.equal(merged.length,200);
 assert.equal(merged.sampleRate,rate);
 assert.equal(a.length,100);
 assert.equal(a.getChannelData(0)[0],.5);
 assert.equal(b.getChannelData(0)[0],.25);
 assert.equal(merged.numberOfChannels,1);
 assert.throws(()=>mergePreparedAudio([a,fromChannels([new Float32Array(10)],44100)]),/matching/);
});
