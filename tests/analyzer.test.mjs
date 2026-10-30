import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTempo} from '../source/analyzer.mjs';
function beat(bpm, seconds=18, swing=false) {
  const sr=22050, data=new Float32Array(sr*seconds);
  for(let n=0;n<bpm/60*seconds;n++) {
    const start=Math.round(n*60/bpm*sr);
    for(let j=0;j<sr*.1&&start+j<data.length;j++) data[start+j]+=0.8*Math.sin(2*Math.PI*90*j/sr)*Math.exp(-j/(sr*.018));
    if(swing) {
      const hi=start+Math.round(60/bpm*sr*.5);
      for(let j=0;j<sr*.025&&hi+j<data.length;j++) data[hi+j]+=.06*Math.sin(j*1.7)*Math.exp(-j/(sr*.005));
    }
  }
  return data;
}
for(const bpm of [60,72,85,100,120,128,140,174,200]) test(`detects ${bpm} BPM pulse`,()=>{
  const result=analyzeTempo(beat(bpm),22050);
  assert.ok(Math.abs(result.bpm-bpm)<1.1,`expected ${bpm}, got ${result.bpm}`);
});
test('detects beat with subdivisions',()=>assert.ok(Math.abs(analyzeTempo(beat(128,30,true),22050).bpm-128)<1.1));
test('rejects silence',()=>assert.throws(()=>analyzeTempo(new Float32Array(22050*8),22050),/SILENCE/));
test('rejects short files',()=>assert.throws(()=>analyzeTempo(new Float32Array(22050*2),22050),/TOO_SHORT/));
test('rejects sustained tone',()=>{
  const tone=Float32Array.from({length:22050*12},(_,i)=>.3*Math.sin(i*2*Math.PI*440/22050));
  assert.throws(()=>analyzeTempo(tone,22050),/NO_RHYTHM/);
});
test('rejects unstructured noise',()=>{
  let seed=22;
  const noise=Float32Array.from({length:22050*20},()=>{seed=(seed*1664525+1013904223)>>>0;return (seed/4294967296*2-1)*.5;});
  assert.throws(()=>analyzeTempo(noise,22050),/NO_RHYTHM/);
});

test('returns a beat phase and alternative candidates without claiming a downbeat',()=>{
 const sr=22050,bpm=120,shift=.135;
 const raw=beat(bpm,18);
 const shifted=new Float32Array(raw.length);
 shifted.set(raw.subarray(0,raw.length-Math.round(sr*shift)),Math.round(sr*shift));
 const result=analyzeTempo(shifted,sr);
 assert.ok(Math.abs(result.bpm-bpm)<1.1);
 assert.ok(Number.isFinite(result.beatOffsetSeconds));
 assert.ok(result.beatOffsetSeconds>=0&&result.beatOffsetSeconds<60/result.bpm);
 const distance=Math.abs(result.beatOffsetSeconds-shift);
 assert.ok(Math.min(distance,Math.abs(distance-.5))<.075,`expected phase near ${shift}s, got ${result.beatOffsetSeconds}s`);
 assert.ok(Array.isArray(result.alternativeBpms));
});

test('returns a detailed bounded waveform for long tracks',()=>{
  const result=analyzeTempo(beat(128,90),22050);
  assert.ok(result.waveform.length>220);
  assert.ok(result.waveform.length<=16384);
  assert.ok(result.waveform.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});
test('returns tempo consistency metadata for independent sections',()=>{
  const result=analyzeTempo(beat(120,35),22050);
  assert.ok(['steady','mixed','variable'].includes(result.tempoStability));
  assert.equal(result.tempoWindows.length,result.analyzedWindows);
  assert.ok(result.tempoWindows.every(w=>w.endSeconds>w.startSeconds&&Number.isFinite(w.bpm)));
});
