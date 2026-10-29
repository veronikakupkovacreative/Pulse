import test from 'node:test';
import assert from 'node:assert/strict';
import {wavSampleRate} from '../source/core/audio-import.mjs';
import {sharedAudioWorkspace,createAudioWorkspace} from '../source/core/audio-workspace.mjs';

function wavHeader(sampleRate=48000){
  const bytes=new ArrayBuffer(44),view=new DataView(bytes);
  const tag=(at,value)=>[...value].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
  tag(0,'RIFF');tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);
  return bytes;
}
const audio=(rate=48000)=>({numberOfChannels:2,length:48000,sampleRate:rate,duration:1});
test('WAV header reports actual native source rate',()=>{
  assert.equal(wavSampleRate(wavHeader(48000)),48000);
  assert.equal(wavSampleRate(wavHeader(44100)),44100);
  assert.equal(wavSampleRate(new ArrayBuffer(12)),null);
});
test('workspace retains immutable original, metadata, tempo and reversible working state',()=>{
  const project=createAudioWorkspace({maxUndo:2}),original=audio(),edited=audio();
  project.load(original,{name:'demo.wav'},{sampleRate:48000,channels:2});
  project.setTempo(128.5,0.31);project.apply(edited);
  assert.equal(project.snapshot().original,original);
  assert.equal(project.snapshot().working,edited);
  assert.equal(project.snapshot().metadata.sampleRate,48000);
  assert.equal(project.snapshot().bpm,128.5);
  assert.equal(project.snapshot().beatOffset,0.31);
  project.undo();assert.equal(project.snapshot().working,original);
  project.redo();assert.equal(project.snapshot().working,edited);
  project.reset();assert.equal(project.snapshot().working,original);
  project.clear();assert.equal(project.snapshot().bpm,0);
});
test('shared workspace is a singleton and rejects invalid tempo',()=>{
  assert.equal(typeof sharedAudioWorkspace.load,'function');
  assert.throws(()=>sharedAudioWorkspace.setTempo(0),/Invalid BPM/);
});
