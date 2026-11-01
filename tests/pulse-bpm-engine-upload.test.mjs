import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ThePulseStudioEngine} from '../source/pulse-engine.mjs';
import {analyzeTempo} from '../source/analyzer.mjs';
const app=readFileSync(new URL('../source/app.mjs',import.meta.url),'utf8');
test('BPM upload uses engine decode and worker-backed engine analysis',()=>{
  assert.match(app,/studio\.loadAudioFile\(file\)/);
  assert.match(app,/studio\.analyzeBPM\(buffer,/);
  assert.match(app,/workerFactory:/);
  assert.match(app,/confidenceLevel/);
});
test('BPM engine returns numeric rhythmic strength and same tempo as precision analyzer',async()=>{
  const rate=22050,seconds=12,samples=new Float32Array(rate*seconds);
  for(let k=0;k<seconds*2;k++){const start=Math.round(k*rate*.5);for(let j=0;j<300;j++)samples[start+j]=.8*Math.exp(-j/55);}
  const buffer={numberOfChannels:1,length:samples.length,sampleRate:rate,duration:seconds,getChannelData:()=>samples};
  const output=await new ThePulseStudioEngine().analyzeBPM(buffer);
  assert.ok(Math.abs(output.bpm-120)<1);
  assert.equal(typeof output.confidence,'number');
  assert.ok(output.confidence>=0&&output.confidence<=100);
  assert.ok(['high','medium','low'].includes(output.confidenceLevel));
  assert.equal(output.bpm,analyzeTempo(samples,rate).bpm);
});
test('worker errors and canceled analysis are propagated',async()=>{
  const samples=new Float32Array(22050*8);
  const buffer={numberOfChannels:1,length:samples.length,sampleRate:22050,duration:8,getChannelData:()=>samples};
  const abort=new AbortController();abort.abort();
  await assert.rejects(new ThePulseStudioEngine().analyzeBPM(buffer,{signal:abort.signal}),/CANCELLED/);
  let terminated=false;
  const workerFactory=()=>({postMessage(){queueMicrotask(()=>this.onmessage({data:{error:'NO_RHYTHM'}}));},terminate(){terminated=true;}});
  await assert.rejects(new ThePulseStudioEngine().analyzeBPM(buffer,{workerFactory}),/NO_RHYTHM/);
  assert.equal(terminated,true);
});
