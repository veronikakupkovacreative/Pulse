import test from 'node:test';
import assert from 'node:assert/strict';
import {createPulseProject} from '../source/core/project-session.mjs';
import {wavMetadata,analysisMono,decodedAudioBytes} from '../source/core/media-loader.mjs';
import {encodeWav} from '../source/studio-audio.mjs';

const buffer=(rate=48000,seconds=2)=>{
  const length=rate*seconds;
  const channels=[Float32Array.from({length},(_,i)=>Math.sin(i*2*Math.PI*440/rate)*.35),Float32Array.from({length},(_,i)=>Math.sin(i*2*Math.PI*660/rate)*.18)];
  return {length,duration:seconds,sampleRate:rate,numberOfChannels:2,getChannelData:c=>channels[c],channels};
};
test('BPM analysis preserves native-rate stereo input without mutating source',()=>{
 const src=buffer(),copy=src.channels[0].slice(),result=analysisMono(src);
 assert.equal(src.sampleRate,48000);
 assert.equal(src.numberOfChannels,2);
 assert.ok(result.sampleRate<=22050);
 assert.ok(result.samples.length<src.length);
 assert.deepEqual(src.channels[0],copy);
 assert.equal(decodedAudioBytes(src),src.length*8);
});
test('48 kHz stereo WAV roundtrip retains rate, channels and sample values',async()=>{
 const src=buffer(48000,.02),blob=encodeWav(src.channels,src.sampleRate,24),bytes=await blob.arrayBuffer(),meta=wavMetadata(bytes);
 assert.equal(meta.sampleRate,48000);assert.equal(meta.channels,2);assert.equal(meta.bitDepth,24);
 const view=new DataView(bytes);
 assert.equal(view.getUint32(40,true),src.length*2*3);
 for(let i=0;i<src.length;i+=13)for(let ch=0;ch<2;ch++){
   const at=44+i*6+ch*3,raw=view.getUint8(at)|(view.getUint8(at+1)<<8)|(view.getUint8(at+2)<<16);
   const signed=raw&0x800000?raw-0x1000000:raw;
   assert.ok(Math.abs(signed/8388608-src.channels[ch][i])<2/8388608);
 }
});
test('shared project reuses original AudioBuffer and preserves independent edits and tempo',()=>{
 const src=buffer(),file={name:'demo.wav'};
 const p=createPulseProject(),seen=[];p.subscribe(e=>seen.push(e.type));
 p.load(src,file,'bpm');
 p.setTempo(140,{beatOffset:.125,confirmed:true,origin:'bpm'});
 assert.equal(p.snapshot().original,src);
 assert.equal(p.snapshot().working,src);
 assert.equal(p.snapshot().bpm,140);
 assert.equal(p.snapshot().beatOffset,.125);
 p.workspace.apply({length:10});
 assert.equal(p.snapshot().original,src);
 assert.equal(p.workspace.undo(),true);
 assert.equal(p.snapshot().working,src);
 assert.deepEqual(seen,['load','tempo']);
 p.clear();
 assert.equal(p.snapshot().working,null);
});
