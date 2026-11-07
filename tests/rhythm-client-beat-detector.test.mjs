import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRhythmInWorker} from '../source/modules/rhythm-client.mjs';

function mockAudio(duration=12){
 const sampleRate=22050,length=Math.floor(duration*sampleRate),l=new Float32Array(length),r=new Float32Array(length);
 return {duration,sampleRate,length,numberOfChannels:2,getChannelData:i=>i? r:l};
}
class FakeOnsetWorker{
 onmessage=null;onerror=null;terminated=false;
 postMessage(data){
  if(data.type==='start'){this.id=data.id;this.received=0;return;}
  if(data.type==='chunk'){this.received+=data.targetCount;return;}
  if(data.type==='finish')queueMicrotask(()=>this.onmessage?.({data:{id:data.id,type:'done',result:{bpm:120,confidence:'medium',duration:12,beatTimes:[.1,.6,1.1,1.6,2.1]}}}));
 }
 terminate(){this.terminated=true}
}

test('rhythm-client uses independent detector and legacy worker output for beat markers',async()=>{
 globalThis.Worker=FakeOnsetWorker;
 globalThis.webAudioBeatDetector={analyze:async()=>120.14,guess:async()=>({bpm:120,tempo:120.14,offset:.1})};
 const progress=[];
 const r=await analyzeRhythmInWorker(mockAudio(),{onProgress:value=>progress.push(value)});
 assert.equal(r.bpm,120.14);
 assert.equal(r.method,'web-audio-beat-detector');
 assert.equal(r.beatTimes.length,5);
 assert.equal(progress.at(-1),100);
 delete globalThis.Worker;
 delete globalThis.webAudioBeatDetector;
});

test('rhythm client retains onset fallback when external library is unavailable',async()=>{
 globalThis.Worker=FakeOnsetWorker;
 const r=await analyzeRhythmInWorker(mockAudio());
 assert.equal(r.bpm,120);
 assert.equal(r.method,'rhythm-worker');
 delete globalThis.Worker;
});

test('rhythm client honors AbortSignal before allocating workers',async()=>{
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(analyzeRhythmInWorker(mockAudio(),{signal:ctrl.signal}),{name:'AbortError'});
});
