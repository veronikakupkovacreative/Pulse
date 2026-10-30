import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStemOverlap} from '../source/dsp/mix-advisor.mjs';
const rate=48000;
const samples=(hz)=>Float32Array.from({length:48000},(_,i)=>.1*Math.sin(2*Math.PI*hz*i/rate));
test('AI Mix identifies actual broad frequency overlap without claiming causal masking',()=>{
 const result=inspectStemOverlap([
  {name:'Kick',rate,channels:[samples(100)]},
  {name:'Bass',rate,channels:[samples(100)]}
 ]);
 assert.ok(result.findings.length>0);
 assert.equal(result.findings[0].band,'BASS');
 assert.match(result.findings[0].suggestion,/by ear/);
});
test('AI Mix reports fewer overlaps for distinct frequency profiles',()=>{
 const result=inspectStemOverlap([
  {name:'Sub',rate,channels:[samples(55)]},
  {name:'Presence',rate,channels:[samples(2800)]}
 ]);
 assert.ok(result.findings.length<2);
});
