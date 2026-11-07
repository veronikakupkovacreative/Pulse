import test from 'node:test';
import assert from 'node:assert/strict';
import {
 BEAT_DETECTOR_VERSION,BEAT_DETECTOR_URL,selectBeatWindow,
 measureBeatDetector,mergeRhythmResults,buildBeatGrid,getBeatDetector,waitForAnalysis
} from '../source/modules/beat-detector.mjs';

test('pinned local beat detector, no runtime CDN',()=>{
 assert.equal(BEAT_DETECTOR_VERSION,'8.2.39');
 assert.equal(BEAT_DETECTOR_URL,'/vendor/beat-detector/bundle.js');
});
test('selects middle sixty seconds without decoding a second track',()=>{
 assert.deepEqual(selectBeatWindow({duration:180}),{offset:60,duration:60});
 assert.deepEqual(selectBeatWindow({duration:24}),{offset:0,duration:24});
 assert.throws(()=>selectBeatWindow({duration:0}),/INVALID_AUDIO/);
});
test('web-audio-beat-detector guess() provides measured tempo and global beat offset',async()=>{
 let args;
 globalThis.webAudioBeatDetector={guess:async(...params)=>{args=params;return{tempo:127.876,bpm:128,offset:.125}},analyze:async()=>127.876};
 const buffer={duration:130};
 const result=await measureBeatDetector(buffer);
 assert.equal(result.tempo,127.876);
 assert.equal(result.offset,35.125);
 assert.equal(args[0],buffer);
 assert.deepEqual(args.slice(1,3),[35,60]);
 assert.deepEqual(args[3],{minTempo:45,maxTempo:220});
 delete globalThis.webAudioBeatDetector;
});
test('merged result preserves precision and snapped onsets for matching tempo',()=>{
 const onset={bpm:128,confidence:'high',beatTimes:[0,.46875,.9375,1.40625],duration:3};
 const result=mergeRhythmResults({tempo:127.876,offset:0},onset,3);
 assert.equal(result.bpm,127.88);assert.equal(result.method,'web-audio-beat-detector');
 assert.deepEqual(result.beatTimes,onset.beatTimes);
 assert.deepEqual(result.interpretations,{half:63.94,main:127.88,double:255.75});
});
test('strong onset evidence rejects major 2x ambiguity from independent detector',()=>{
 const onset={bpm:128,confidence:'high',beatTimes:[.25,.71875,1.1875],duration:2};
 const result=mergeRhythmResults({tempo:64,offset:.25},onset,2);
 assert.equal(result.bpm,128);assert.equal(result.method,'rhythm-worker');
 assert.equal(result.confidence,'low');
});
test('low-confidence conflict favors web-audio measurement and aligns beat grid',()=>{
 const result=mergeRhythmResults({tempo:136.25,offset:.15},{bpm:90,confidence:'low',beatTimes:[0,.66,1.33]},3);
 assert.equal(result.bpm,136.25);assert.equal(result.method,'web-audio-beat-detector');
 assert.ok(result.beatTimes.length>=6);
 const period=result.beatTimes[1]-result.beatTimes[0];
 assert.ok(Math.abs(period-60/136.25)<.00001);
});
test('falls back to worker rhythm when library fails or is offline',()=>{
 const onset={bpm:120,confidence:'medium',beatTimes:[.1,.6,1.1],duration:3};
 const result=mergeRhythmResults(null,onset,3);
 assert.equal(result.bpm,120);assert.equal(result.method,'rhythm-worker');
 assert.equal(result.confidence,'medium');
});
test('never invents beats from silence or invalid measurements',()=>{
 assert.throws(()=>mergeRhythmResults(null,null,10),/NO_RHYTHM/);
 assert.deepEqual(buildBeatGrid(NaN,0,10),[]);
 assert.deepEqual(buildBeatGrid(120,NaN,10),[]);
});
test('aborts library operations cleanly',async()=>{
 const ac=new AbortController();const pending=new Promise(()=>{});
 const task=waitForAnalysis(pending,{signal:ac.signal,timeoutMs:1000});ac.abort();
 await assert.rejects(task,{name:'AbortError'});
});
