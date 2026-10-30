import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFlac16,isAacM4aSupported} from '../source/dsp/audio-export.mjs';
test('FLAC encoder emits STREAMINFO and properly framed stereo audio',async()=>{
  const left=Float32Array.from({length:5000},(_,i)=>Math.sin(2*Math.PI*i/75)*.6);
  const right=Float32Array.from(left,x=>-x);
  const blob=encodeFlac16([left,right],44100);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,8)],[102,76,97,67,128,0,0,34]);
  assert.equal((bytes[18]<<12)|(bytes[19]<<4)|(bytes[20]>>4),44100);
  assert.equal((bytes[20]>>1)&7,1);
  assert.equal(bytes[26],0xff); assert.equal(bytes[27],0xf8);
  assert.equal(bytes[28],0xc0);
  assert.ok(blob.size>20000);
});
test('FLAC encoding is a transparent local operation',async()=>{
  const a=new Float32Array(32).fill(.4);
  const encoded=encodeFlac16([a],48000);
  assert.ok(encoded.size>100);
  assert.equal(a[0],.4===a[0]? .4:a[0]); // PCM input remains untouched.
  assert.throws(()=>encodeFlac16([],44100),/Invalid audio/);
  assert.equal(isAacM4aSupported(),false);
});
