import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analysisRange,midiLabel,tuningCorrection} from '../source/dsp/harmonic-workflow.mjs';
import {detectFundamental} from '../source/dsp/production-tools.mjs';

const close=(a,b,eps=1e-3)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('Key Finder: whole track, 12s cursor and enabled LOOP are deterministic',()=>{
  assert.deepEqual(analysisRange('full',60,24,0,0,false,12,2),{from:0,to:60,label:'Celý track'});
  assert.deepEqual(analysisRange('cursor',60,53,0,0,false,12,2),{from:48,to:60,label:'Od playheadu'});
  assert.deepEqual(analysisRange('loop',60,12,10,16,true,12,2),{from:10,to:16,label:'Aktivní LOOP'});
  assert.throws(()=>analysisRange('loop',60,12,10,16,false,12,2),/LOOP/);
  assert.throws(()=>analysisRange('loop',60,12,10,11,true,12,2),/LOOP/);
  assert.throws(()=>analysisRange('cursor',1.5,0,0,0,false,12,2),/příliš krátký/);
});
test('808 tuner range accepts short tails but rejects 60ms regions',()=>{
  close(analysisRange('cursor',1,0.8,0,0,false,2,.13).to,1);
  close(analysisRange('loop',5,1,.6,.9,true,2,.13).to,.9);
  assert.throws(()=>analysisRange('loop',5,1,.6,.68,true,2,.13),/LOOP/);
});
test('MIDI note labels, semitone and cent corrections reflect detected 808 pitch',()=>{
  assert.equal(midiLabel(33),'A1');assert.equal(midiLabel(36),'C2');
  assert.deepEqual(tuningCorrection(33,18.6,36),{semitones:3,cents:-19});
  assert.deepEqual(tuningCorrection(33,-26.4,33),{semitones:0,cents:26});
  assert.throws(()=>tuningCorrection(33,0,50),/12/);
});
test('808 detection supplies stability metrics for sustained A1, silence is uncertain',()=>{
  const fs=12000;
  const tone=Float32Array.from({length:fs*2},(_,i)=>.6*Math.sin(2*Math.PI*55*i/fs));
  const steady=detectFundamental([tone],fs);
  assert.equal(steady.note.note,'A1');assert.ok(steady.spreadCents<20);
  assert.ok(steady.stableFrames>0&&steady.stableFrames<=steady.frames);
  const silent=detectFundamental([new Float32Array(fs)],fs);
  assert.equal(silent.spreadCents,null);assert.equal(silent.stableFrames,0);
});
test('Standalone build contains new selectors and compiled helper, without changing category navigation',()=>{
  const built=readFileSync(new URL('../private/studio.html',import.meta.url),'utf8');
  const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
  for(const id of ['key-range','key-range-readout','tuner-range','tuner-attack','tuner-target','tuner-cents-adjust','tuner-stability']){
    assert.ok(html.includes(`id="${id}"`),`${id} missing from source`);
    assert.ok(built.includes(`id="${id}"`),`${id} missing from standalone`);
  }
  assert.ok(built.includes('function analysisRange('));
  assert.ok(built.includes('function tuningCorrection('));
  assert.match(built,/data-category="analyze"/);
  assert.match(built,/data-category="ai"/);
});
