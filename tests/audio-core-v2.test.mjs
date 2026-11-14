import test from 'node:test';
import assert from 'node:assert/strict';
import {HistoryStack,estimateAudioBytes,defaultHistoryBudget} from '../source/modules/history-stack.mjs';
import {analyzeHarmonyFrames} from '../source/modules/harmony-analysis.mjs';
import {getWaveformMarkerPixels} from '../source/modules/workspace.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';
const mockBuffer=(length,channels=2)=>({length,numberOfChannels:channels});
test('history stores references and supports undo and redo',()=>{
 const h=new HistoryStack({maxBytes:1024*1024,maxEntries:8}),a=mockBuffer(100),b=mockBuffer(120);
 assert.equal(h.push(a,b,'trim'),true);assert.equal(h.undo(b),a);assert.equal(h.canRedo,true);assert.equal(h.redo(a),b);assert.equal(h.canUndo,true);
});
test('history prunes snapshots over the memory budget',()=>{
 const h=new HistoryStack({maxBytes:1200,maxEntries:10}),a=mockBuffer(100),b=mockBuffer(100),c=mockBuffer(100),d=mockBuffer(100);
 h.push(a,b);h.push(b,c);h.push(c,d);assert.ok(h.retainedBytes<=1200);assert.ok(h.undoEntries.length<3);
});
test('history memory estimates are Float32 PCM and budget is bounded',()=>{
 assert.equal(estimateAudioBytes(mockBuffer(100)),800);assert.equal(defaultHistoryBudget(8),192*1024*1024);
});
test('harmonic worker rejects invalid frames and silence without inventing a key',()=>{
 const rate=22050,size=8192,times=new Float32Array([.5,1.5,2.5,3.5]),silence=new Float32Array(times.length*size);
 const result=analyzeHarmonyFrames(silence,rate,times,size);assert.equal(result.key,null);assert.deepEqual(result.chords,[]);
 assert.throws(()=>analyzeHarmonyFrames(silence,rate,new Float32Array([0]),size),/INVALID_HARMONY_FRAMES/);
});
test('waveform markers are bounded and avoid duplicate pixels',()=>{
 assert.deepEqual(getWaveformMarkerPixels([0,.001,.01,.1,1],1,100,6),[0,6,99]);
});
test('only current workspace tools are registered',()=>{
 const ids=visibleToolModules.map(x=>x.id);
 for(const id of ['song-analyzer','music-tagger','editor','wav','audio-protection','visualizer','ai2-mastering'])assert.ok(ids.includes(id),id);
 for(const id of ['rhythm','key','tap','equalizer','normalizer','ai-voice-cloning'])assert.ok(!ids.includes(id),id);
});
