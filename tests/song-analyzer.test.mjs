import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSong} from '../source/song-analyzer.mjs';
import {estimateTuning} from '../source/studio-audio.mjs';

function triad(cents=0,seconds=10,sampleRate=22050){
  const notes=[130.813,164.814,195.998,261.626,329.628,391.995].map(hz=>hz*2**(cents/1200));
  const samples=new Float32Array(sampleRate*seconds);
  for(let i=0;i<samples.length;i++)for(const hz of notes)samples[i]+=Math.sin(2*Math.PI*hz*i/sampleRate)/notes.length;
  return samples;
}
function beat(bpm=120,seconds=12,sampleRate=22050){
  const samples=new Float32Array(sampleRate*seconds);
  for(let n=0;n<bpm/60*seconds;n++){
    const start=Math.round(n*60/bpm*sampleRate);
    for(let i=0;i<sampleRate*.1&&start+i<samples.length;i++)samples[start+i]+=.8*Math.sin(2*Math.PI*90*i/sampleRate)*Math.exp(-i/(sampleRate*.018));
  }
  return samples;
}
test('Song Analyzer retains tempo analysis',()=>{
  const result=analyzeSong(beat(128),22050);
  assert.ok(Math.abs(result.bpm-128)<1.1);
  assert.equal(result.waveform.length,220);
});
test('Song Analyzer supplies key and Camelot even when rhythm is missing',()=>{
  const result=analyzeSong(triad(),22050);
  assert.equal(result.bpm,null);
  assert.equal(result.key.primary.name,'C');
  assert.equal(result.key.primary.mode,'major');
  assert.equal(result.key.primary.camelot,'8B');
});
test('Tuning estimator approximates a known tuned chord',()=>{
  const result=estimateTuning(triad(-20),22050);
  assert.ok(result);
  assert.ok(Math.abs(result.cents+20)<3);
});
test('Song Analyzer rejects silence',()=>{
  assert.throws(()=>analyzeSong(new Float32Array(22050*8),22050),/SILENCE/);
});
test('Song Analyzer rejects too short audio',()=>{
  assert.throws(()=>analyzeSong(new Float32Array(22050*2),22050),/TOO_SHORT/);
});
