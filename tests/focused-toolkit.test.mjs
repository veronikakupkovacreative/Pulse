import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleToolModules} from '../source/modules/index.mjs';
import {mergePreparedAudio} from '../source/modules/focused-tools.mjs';
import {fromChannels} from '../source/modules/dsp.mjs';

test('focused toolkit exposes one tool per core area and eight AI Studio tools',()=>{
 const names=visibleToolModules.map(m=>m.id);
 assert.deepEqual(names,[
  'song-analyzer','music-tagger','editor','wav','video-to-audio',
  'ai2-mastering','ai2-stereo','ai2-vocals','ai2-beat',
  'ai2-mix','ai2-repair','ai2-pitch','ai2-fx','visualizer'
 ]);
 assert.deepEqual([...new Set(visibleToolModules.map(m=>m.category))],
  ['analyze','edit','export','ai','visuals']);
 assert.equal(visibleToolModules.filter(m=>m.category==='ai').length,8);
 for(const tool of visibleToolModules)assert.equal(typeof tool.mount,'function',tool.id);
});

test('focused directory and footer link exclusively to registered tools',()=>{
 const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/data-open-tool="([^"]+)"/g)].map(m=>m[1]);
 const allowed=new Set(visibleToolModules.map(m=>m.id));
 assert.ok(ids.length>=12);
 for(const id of ids)assert.ok(allowed.has(id),'Unknown or obsolete link: '+id);
 assert.equal((html.match(/data-category="/g)||[]).length,5);
 assert.ok(html.includes('ANALYSIS'));
 assert.ok(html.includes('AI Mastering'));
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
