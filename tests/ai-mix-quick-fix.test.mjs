import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeStereoQuickFix,renderStereoQuickFix} from '../source/dsp/stereo-quick-fix.mjs';
const rate=48000;
const audio=()=>[Float32Array.from({length:48000},(_,i)=>.22*Math.sin(2*Math.PI*100*i/rate)),
Float32Array.from({length:48000},(_,i)=>.18*Math.sin(2*Math.PI*2300*i/rate))];
test('single stereo Quick Fix preserves untouched original and sample rate',()=>{
 const input=audio(),copy=input.map(x=>x.slice()),analysis=analyzeStereoQuickFix(input,rate);
 assert.equal(analysis.bands.length,7);
 const result=renderStereoQuickFix(input,rate,{character:'balanced',intensity:40});
 assert.equal(result.channels.length,2);
 assert.equal(result.channels[0].length,48000);
 assert.deepEqual(input,copy);
 assert.ok(result.changes.every(x=>Math.abs(x.gainDb)<=2));
});
test('zero intensity outputs identical decoded stereo data',()=>{
 const input=audio(),output=renderStereoQuickFix(input,rate,{intensity:0});
 assert.deepEqual(output.channels,input);
 assert.equal(output.changes.length,0);
 assert.notStrictEqual(output.channels[0],input[0]);
});
test('Quick Fix rejects unsupported mix character',()=>{
 assert.throws(()=>renderStereoQuickFix(audio(),rate,{character:'imaginary'}),/Invalid/);
});
