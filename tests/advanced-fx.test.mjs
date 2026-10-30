import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestScaleNote,detectMonophonicPitch,transientProcess,deEssProcess,peakNormalize} from '../source/advanced-fx.mjs';
test('scale quantization distinguishes major and minor',()=>{
 assert.equal(nearestScaleNote(440,0,'major'),69);
 assert.equal(nearestScaleNote(440,0,'minor'),68);
});
test('pitch detector resolves a steady A440 note',()=>{
 const rate=44100,samples=Float32Array.from({length:8192},(_,i)=>.7*Math.sin(2*Math.PI*440*i/rate));
 const note=detectMonophonicPitch(samples,rate,0);
 assert.ok(note&&Math.abs(note.frequency-440)<8,JSON.stringify(note));
});
test('processors preserve length and input samples',()=>{
 const rate=44100,source=Float32Array.from({length:rate},(_,i)=>.25*Math.sin(2*Math.PI*430*i/rate));
 const before=source.slice();
 for(const output of [
   transientProcess([source],rate,{attack:40,sustain:-20}),
   deEssProcess([source],rate,{frequency:5500,threshold:-30,amount:.8}),
   peakNormalize([source],-1)]){
   assert.equal(output.length,1);
   assert.equal(output[0].length,source.length);
   assert.ok(output[0].every(Number.isFinite));
 }
 assert.deepEqual(source,before);
});
