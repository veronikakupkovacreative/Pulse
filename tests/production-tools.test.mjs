import test from 'node:test';
import assert from 'node:assert/strict';
import {processPitchTime,stretchWsola,detectFundamental,frequencyNote,detectTransients,sliceAudio} from '../source/dsp/production-tools.mjs';
import {createStoredZip,crc32} from '../source/dsp/zip-store.mjs';
import {encodeWav} from '../source/studio-audio.mjs';
const fs=12000,seconds=2;
const tone=(hz=55,sec=seconds)=>Float32Array.from({length:fs*sec},(_,i)=>.65*Math.sin(2*Math.PI*hz*i/fs));
const near=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b} exceeds ${tolerance}`);
test('808 tuner detects A1 in 55 Hz sustained bass and exposes note/cents/confidence',()=>{
  const result=detectFundamental([tone()],fs);
  near(result.hz,55,.7);assert.equal(result.note.note,'A1');assert.ok(result.confidence>.75);
  const flat=frequencyNote(440);assert.equal(flat.note,'A4');near(flat.cents,0,.001);
});
test('808 tuner handles silence and short files with explicit uncertainty',()=>{
  const s=detectFundamental([new Float32Array(fs)],fs);assert.equal(s.hz,null);assert.equal(s.confidence,0);
  assert.throws(()=>detectFundamental([new Float32Array(30)],fs),/130 ms/);
  assert.throws(()=>detectFundamental([tone()],fs,{minHz:400,maxHz:200}),/rozsah/);
});
test('Pitch & Time: preserve pitch at 120->140 BPM while changing duration',()=>{
  const source=tone(),processed=processPitchTime([source],fs,{originalBpm:120,targetBpm:140});
  near(processed[0].length/fs,2*120/140,.001);
  near(detectFundamental(processed,fs).hz,55,1.5);
  assert.equal(source.length,fs*2); // original unchanged
});
test('Pitch shift +12 semitones keeps duration and raises bass by octave',()=>{
  const processed=processPitchTime([tone()],fs,{semitones:12});
  near(processed[0].length/fs,2,.001);
  near(detectFundamental(processed,fs).hz,110,2);
});
test('Disabling preserve pitch means tempo changes pitch',()=>{
  const processed=processPitchTime([tone()],fs,{originalBpm:120,targetBpm:140,preservePitch:false});
  near(detectFundamental(processed,fs).hz,55*140/120,2);
});
test('WSOLA preserves channel count and produces bounded finite PCM values',()=>{
  const a=tone(),b=Float32Array.from(a,v=>v*.5);const channels=stretchWsola([a,b],Math.floor(a.length*1.25),fs);
  assert.equal(channels.length,2);assert.equal(channels[0].length,fs*2.5);
  assert.ok(channels.every(ch=>ch.every(Number.isFinite)));
  assert.ok(channels[0][100]!==channels[1][100]);
  assert.throws(()=>stretchWsola([a],Math.floor(a.length*9),fs),/rozsah/);
});
test('Onset detection identifies 5 transient impulses and rejects sustained sine',()=>{
  const hit=new Float32Array(fs*3);for(const p of [.5,1,1.5,2,2.5])for(let j=0;j<300;j++)hit[Math.round(p*fs)+j]=(1-j/300)*.95;
  const markers=detectTransients([hit],fs,{sensitivity:.55});
  assert.equal(markers[0],0);assert.equal(markers.at(-1),3);
  assert.equal(markers.length,7);
  for(let i=1;i<=5;i++)near(markers[i],i*.5,.035);
  assert.deepEqual(detectTransients([tone()],fs),[0,2]);
});
test('Slicer preserves source, sample counts and WAV metadata for stereo',async()=>{
  const a=tone(),b=Float32Array.from(a,v=>v/2),markers=[0,.5,1.25,2];
  const [outL,outR]=sliceAudio([a,b],fs,markers,1);
  assert.equal(outL.length,fs*.75);assert.equal(outR.length,outL.length);
  near(outL[120],a[fs*.5+120],1e-8);
  const wav=encodeWav([outL,outR],fs,24);
  const buffer=await wav.arrayBuffer(),view=new DataView(buffer);
  assert.equal(view.getUint32(24,true),fs);assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint16(34,true),24);
});
test('ZIP stores valid local and central directory headers and CRC',async()=>{
  const wav=encodeWav([tone(110,.3)],fs,16),bytes=new Uint8Array(await wav.arrayBuffer());
  const zip=await createStoredZip([{name:'slice_001.wav',data:wav},{name:'slice_002.wav',data:wav}]);
  const archive=new DataView(await zip.arrayBuffer());
  assert.equal(archive.getUint32(0,true),0x04034b50);
  assert.equal(archive.getUint32(14,true),crc32(bytes));
  assert.equal(archive.getUint32(zip.size-22,true),0x06054b50);
  assert.equal(archive.getUint16(zip.size-22+10,true),2);
  assert.equal(archive.getUint16(6,true),0x0800);
});
