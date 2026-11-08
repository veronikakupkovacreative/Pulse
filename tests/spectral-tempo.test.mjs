import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSpectralTempo} from '../source/song/spectral-tempo.mjs';

function syntheticPulse(bpm, seconds=20, rate=11025) {
  const samples=new Float32Array(rate*seconds);
  let seed=123456789;
  for(let n=0;n<seconds*bpm/60;n++) {
    const start=Math.round(n*60*rate/bpm);
    for(let j=0;j<120&&start+j<samples.length;j++) {
      seed=(1664525*seed+1013904223)>>>0;
      samples[start+j]=Math.exp(-j/20)*(seed/0xffffffff-.5);
    }
  }
  return samples;
}
for(const bpm of [70,90,104,120,140,156,175]){
  test('spectral pulse candidate includes '+bpm+' BPM',()=>{
    const result=estimateSpectralTempo(syntheticPulse(bpm),11025);
    assert.ok(result?.score>0.2);
    const options=[result.bpm,...result.alternatives.map(a=>a.bpm)];
    assert.ok(options.some(x=>Math.abs(x-bpm)<2),
      'Missing true '+bpm+' BPM from '+options.join(', '));
  });
}
test('non rhythmic silence does not invent a tempo',()=>{
  assert.equal(estimateSpectralTempo(new Float32Array(11025*8),11025),null);
});
