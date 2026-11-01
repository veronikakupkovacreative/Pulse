import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioConverterTool} from '../source/studio-audio.mjs';

function fakeBuffer(channels,sampleRate=48000){
  return {numberOfChannels:channels.length,sampleRate,length:channels[0].length,
    duration:channels[0].length/sampleRate,getChannelData:i=>channels[i]};
}

test('converter writes valid 16-bit stereo WAV and preserves channel order',async()=>{
  const buffer=fakeBuffer([Float32Array.from([0,1,-1]),Float32Array.from([.5,-.5,0])]);
  const blob=await new AudioConverterTool().convertToWavBlob(buffer);
  const view=new DataView(await blob.arrayBuffer());
  assert.equal(blob.type,'audio/wav');
  assert.equal(view.getUint32(4,true),blob.size-8);
  assert.equal(view.getUint16(22,true),2);
  assert.equal(view.getUint32(24,true),48000);
  assert.equal(view.getUint16(34,true),16);
  assert.equal(view.getUint32(40,true),12);
  assert.equal(view.getInt16(46,true),16384);
  assert.equal(view.getInt16(48,true),32767);
  assert.equal(view.getInt16(50,true),-16384);
});

test('converter retains mono channel and supports 24-bit PCM / 32-bit float',async()=>{
  const buffer=fakeBuffer([Float32Array.from([.25,-.5])],44100);
  const tool=new AudioConverterTool();
  const pcm=await tool.convertToWavBlob(buffer,null,{bitDepth:24});
  const floating=await tool.convertToWavBlob(buffer,null,{bitDepth:32});
  assert.equal(pcm.size,50);
  assert.equal(floating.size,64);
  const view=new DataView(await floating.arrayBuffer());
  assert.equal(view.getUint16(20,true),3);
  assert.equal(view.getFloat32(56,true),.25);
  assert.equal(view.getFloat32(60,true),-.5);
});

test('converter resamples using offline rendering without changing source',async()=>{
  let target=null;
  class Offline {
    constructor(channels,length,sampleRate){target={channels,length,sampleRate};this.destination={};}
    createBufferSource(){return {connect:()=>{},start:()=>{},set buffer(value){target.input=value;}};}
    async startRendering(){return fakeBuffer([new Float32Array(target.length)],target.sampleRate);}
  }
  const source=fakeBuffer([new Float32Array(480)],48000);
  const tool=new AudioConverterTool(null,{OfflineContext:Offline});
  const rendered=await tool.resampleBuffer(source,44100);
  assert.equal(rendered.sampleRate,44100);
  assert.equal(rendered.length,441);
  assert.equal(target.channels,1);
  assert.equal(target.input,source);
  assert.equal(source.sampleRate,48000);
});

test('converter reads file and delegates decoding to AudioContext',async()=>{
  const bytes=new ArrayBuffer(12),expected=fakeBuffer([new Float32Array(4)]);
  const tool=new AudioConverterTool({decodeAudioData:async value=>{assert.equal(value,bytes);return expected;}});
  assert.equal(await tool.loadAudioFile({arrayBuffer:async()=>bytes}),expected);
});

test('converter validates rate, bit depth, channels and oversized audio',async()=>{
  const tool=new AudioConverterTool();
  const source=fakeBuffer([new Float32Array(5)],48000);
  await assert.rejects(tool.convertToWavBlob(source,0),/sample rate/i);
  await assert.rejects(tool.convertToWavBlob(source,null,{bitDepth:8}),/16, 24 or 32/);
  await assert.rejects(tool.convertToWavBlob(fakeBuffer([new Float32Array(1),new Float32Array(1),new Float32Array(1)])),/mono and stereo/);
  await assert.rejects(tool.convertToWavBlob({...source,length:160_000_000}),/300 MB/);
});
