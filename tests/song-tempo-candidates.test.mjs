import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTempo} from '../source/song/analyzer.mjs';

function makeClicks(bpm, seconds=18, sampleRate=8000) {
  const samples=new Float32Array(Math.round(seconds*sampleRate));
  const period=60*sampleRate/bpm;
  for(let beat=0;beat<seconds*bpm/60;beat++){
    const at=Math.round((beat+0.1)*period);
    for(let i=0;i<Math.min(80,samples.length-at);i++){
      if(at+i>=0) samples[at+i]+=Math.exp(-i/12)*0.7;
    }
  }
  return samples;
}

for(const bpm of [70,104,120,140,156,175]){
  test('pulse at '+bpm+' BPM yields a plausible tempo family',()=>{
    const result=analyzeTempo(makeClicks(bpm),8000);
    assert.ok(result.bpm>0);
    assert.ok(['high','medium','low'].includes(result.confidence));
    const family=[bpm,bpm/2,bpm*2];
    assert.ok(family.some(value=>Math.abs(result.bpm-value)<2),
      'Expected '+bpm+' (or half/double), got '+result.bpm);
    assert.ok(Array.isArray(result.alternatives));
    assert.ok(result.tempoStability>=0&&result.tempoStability<=100);
  });
}

test('silence is rejected',()=>{
  assert.throws(()=>analyzeTempo(new Float32Array(8000*8),8000),/SILENCE/);
});
