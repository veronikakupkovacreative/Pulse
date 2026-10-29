import test from 'node:test';
import assert from 'node:assert/strict';
import {reverseAudio,bpmDurations,detectSilenceBounds,trimAudio,normalizeAudio,integratedLoudness,peakDb} from '../source/dsp/quick-tools.mjs';
import {createAudioWorkspace} from '../source/core/audio-workspace.mjs';
import {encodeWav} from '../source/studio-audio.mjs';
const sr=48000;
const sine=(seconds=2,hz=440,amplitude=.25)=>Float32Array.from({length:Math.round(seconds*sr)},(_,i)=>Math.sin(i*2*Math.PI*hz/sr)*amplitude);
test('reverse is sample-exact for mono and stereo and does not mutate the source',()=>{
  const a=Float32Array.from([0,.5,-1]),b=Float32Array.from([.3,.2,.1]);
  const [x,y]=reverseAudio([a,b],sr);assert.deepEqual([...x],[-1,.5,0]);assert.ok([...y].every((x,i)=>Math.abs(x-[.1,.2,.3][i])<1e-7));assert.deepEqual([...a],[0,.5,-1]);
});
test('bpm calculator returns accurate triplet/dotted values',()=>{
  const rows=bpmDurations(120);assert.equal(rows[2].straight,500);assert.equal(rows[2].dotted,750);assert.ok(Math.abs(rows[2].triplet-333.333)<.001);assert.equal(rows[4].straight,125);assert.throws(()=>bpmDurations(0));
});
test('trimmer detects 5 ms blocks and padding and rejects silence',()=>{
  const a=new Float32Array(sr);a.fill(.3,Math.round(.2*sr),Math.round(.8*sr));
  const bounds=detectSilenceBounds([a],sr,-45,10);assert.ok(Math.abs(bounds.startSeconds-.19)<.002);assert.ok(Math.abs(bounds.endSeconds-.81)<.002);
  const [out]=trimAudio([a],bounds);assert.equal(out.length,bounds.end-bounds.start);assert.throws(()=>detectSilenceBounds([new Float32Array(sr)],sr,-80,0));
});
test('peak normalization honors ceiling, amplitude and true output WAV structure',async()=>{
  const original=sine();const result=normalizeAudio([original],sr,{mode:'peak',targetPeak:-1,ceiling:-2});
  assert.equal(result.limited,true);assert.ok(Math.abs(result.outputPeakDb+2)<.0001);
  assert.ok(Math.abs(original[100] - result.channels[0][100]/result.gain)<1e-6);
  const file=encodeWav(result.channels,sr,24);const v=new DataView(await file.arrayBuffer());assert.equal(v.getUint16(34,true),24);assert.equal(v.getUint32(24,true),sr);
});
test('LUFS is gated, near gain invariant and capped below requested loudness',()=>{
  const original=sine(3);const measured=integratedLoudness([original],sr);assert.ok(Number.isFinite(measured),String(measured));
  const louder=Float32Array.from(original,x=>x*1.5);const louderMeasure=integratedLoudness([louder],sr);
  assert.ok(Math.abs((louderMeasure-measured)-20*Math.log10(1.5))<.02);
  const normalized=normalizeAudio([original],sr,{mode:'lufs',targetLufs:-3,ceiling:-1});
  assert.ok(normalized.outputPeakDb<=-0.999);assert.ok(normalized.outputLufs<=-3.1);
  assert.throws(()=>normalizeAudio([new Float32Array(sr)],sr,{mode:'peak'}));
});
test('workspace keeps original, undo/redo, reset and clears revisions',()=>{
  const w=createAudioWorkspace({maxUndo:2}),a={numberOfChannels:1,length:8},b={length:8},c={length:8};
  w.load(a,{name:'test.wav'});w.apply(b);w.apply(c);assert.equal(w.snapshot().original,a);assert.equal(w.snapshot().working,c);
  assert.equal(w.undo(),true);assert.equal(w.snapshot().working,b);assert.equal(w.redo(),true);assert.equal(w.snapshot().working,c);
  w.reset();assert.equal(w.snapshot().working,a);assert.equal(w.snapshot().hasChanges,false);w.clear();assert.equal(w.snapshot().working,null);
});
