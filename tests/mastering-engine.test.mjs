import test from 'node:test';
import assert from 'node:assert/strict';
import {fromChannels} from '../source/modules/dsp.mjs';
import {renderMasteringAudio,measureMasteringAudio,MASTER_PRESETS,masteringSettings} from '../source/modules/mastering-engine.mjs';
const sine=(duration=.5,rate=48000,level=.2,channels=2)=>{
 const count=Math.ceil(duration*rate);
 return fromChannels(Array.from({length:channels},(_,channel)=>Float32Array.from({length:count},(_,i)=>level*Math.sin(2*Math.PI*440*i/rate+channel*.2))),rate);
};
test('silence and invalid numeric parameters are rejected safely',()=>{
 assert.throws(()=>renderMasteringAudio(fromChannels([new Float32Array(48000)],48000)),/silent/);
 assert.throws(()=>masteringSettings({target:NaN}),/Invalid/);
 assert.throws(()=>masteringSettings({ratio:20}),/Invalid/);
});
test('stereo master preserves length, source, and linked phase',()=>{
 const input=sine(1,44100,.65),beforeL=input.getChannelData(0).slice();
 const result=renderMasteringAudio(input,MASTER_PRESETS.streaming);
 assert.equal(result.buffer.length,input.length);
 assert.equal(result.buffer.numberOfChannels,input.numberOfChannels);
 assert.deepEqual(input.getChannelData(0),beforeL);
 assert.ok(result.after.truePeakEstimateDb<=-.95,'ceiling enforced');
 assert.ok(result.after.integratedLufs>-Infinity);
 assert.ok(result.after.stereoCorrelation>0.5);
});
test('mono stays mono and targets practical loudness',()=>{
 const input=sine(.8,48000,.09,1),output=renderMasteringAudio(input,MASTER_PRESETS.balanced);
 assert.equal(output.buffer.numberOfChannels,1);
 assert.equal(output.after.stereoCorrelation,null);
 assert.ok(output.after.truePeakEstimateDb<=-.95);
 assert.ok(Number.isFinite(output.after.integratedLufs));
});
test('target and ceiling differ meaningfully across profiles',()=>{
 const input=sine(1,48000,.08),loud=renderMasteringAudio(input,MASTER_PRESETS.punch),gentle=renderMasteringAudio(input,MASTER_PRESETS.glue);
 assert.ok(loud.after.integratedLufs>gentle.after.integratedLufs+2);
 assert.ok(loud.after.truePeakEstimateDb<=-.85);
 assert.ok(gentle.after.truePeakEstimateDb<=-1.15);
});
test('stereo correlation and inter-sample measurements report honest values',()=>{
 const input=sine(.4,48000,.2),m=measureMasteringAudio(input);
 assert.ok(m.stereoCorrelation<1&&m.stereoCorrelation>.9);
 assert.ok(m.truePeakEstimateDb>=m.samplePeakDb-.001);
 assert.equal(m.channels,2);
});
