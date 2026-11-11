import test from 'node:test';
import assert from 'node:assert/strict';
import {resampleLinear, stretchWsola, transformPitchTime} from '../source/modules/pitch-v2-dsp.mjs';
const sine = (sampleRate=8000, length=8000, hz=440) => Float32Array.from({length}, (_,i)=>.25*Math.sin(2*Math.PI*hz*i/sampleRate));
test('Pitch & Time preserves input and changes duration at requested tempo', () => {
  const input = sine(), original = input.slice();
  const out = transformPitchTime([input],{tempo:1.25,semitones:0});
  assert.equal(out[0].length,6400);
  assert.deepEqual(input,original);
  assert.ok(out[0].every(Number.isFinite));
});
test('Pitch processing does not extend duration', () => {
  const out=transformPitchTime([sine()],{tempo:1,semitones:2});
  assert.equal(out[0].length,8000);
  assert.ok(Math.max(...out[0]) < 1.001);
});
test('stereo alignment and silence are stable', () => {
  const a=new Float32Array(1600); a[400]=.8;
  const b=new Float32Array(a);
  const result=stretchWsola([a,b],1.1);
  assert.equal(result.length,2);
  assert.deepEqual(result[0],result[1]);
  assert.ok(result[0].every(Number.isFinite));
});
test('invalid pitch options are rejected',()=>{
  assert.throws(()=>transformPitchTime([sine()],{tempo:0,semitones:0}));
  assert.throws(()=>transformPitchTime([sine()],{tempo:1,semitones:12}));
  assert.equal(resampleLinear([sine()],2)[0].length,4000);
});
import {renderMultitrack,suggestGainDb} from '../source/modules/mix-v2-dsp.mjs';
const fakeBuffer=(samples,rate=8000)=>({numberOfChannels:1,sampleRate:rate,length:samples.length,duration:samples.length/rate,getChannelData:()=>samples});
test('Local mix sums tracks without clipping and produces stereo output',()=>{
 const a=fakeBuffer(Float32Array.from({length:8000},()=>.8));
 const b=fakeBuffer(Float32Array.from({length:8000},()=>.8));
 const result=renderMultitrack([{buffer:a,gainDb:0,pan:0},{buffer:b,gainDb:0,pan:0}]);
 assert.equal(result.buffer.numberOfChannels,2);
 assert.equal(result.buffer.length,8000);
 assert.ok(result.buffer.getChannelData(0).every(x=>x<=.991));
 assert.ok(result.attenuationDb<0);
 assert.ok(Number.isFinite(suggestGainDb(a)));
});
