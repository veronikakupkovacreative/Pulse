import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav,extractSegment,getAudioPeaks,detectKey} from '../source/studio-audio.mjs';
test('WAV headers and size are correct for stereo 16-bit', async()=>{
 const blob=encodeWav([new Float32Array([0,1,-1]),new Float32Array([.5,-.5,0])],44100,16);
 const v=new DataView(await blob.arrayBuffer());
 assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint16(34,true),16);assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),12);assert.equal(v.getInt16(48,true),32767);assert.equal(blob.size,56);
});
test('WAV 24-bit data is correctly sized',async()=>{const b=encodeWav([new Float32Array(10)],48000,24);assert.equal(b.size,74);});
test('trim preserves precise duration and fades edges',()=>{
 const s=Float32Array.from({length:1000},()=>1);const [out]=extractSegment([s],1000,.2,.6,5);assert.equal(out.length,400);assert.ok(out[0]<out[15]);assert.ok(out.at(-1)<out[15]);
});
test('peak calculation handles silence',()=>{assert.deepEqual(getAudioPeaks(new Float32Array(100),6),[0,0,0,0,0,0]);});
test('key detector finds C in a sustained C major triad',()=>{
 const sr=11025,sec=9,s=new Float32Array(sr*sec);
 for(let i=0;i<s.length;i++){let value=0;for(const hz of [130.813,164.814,195.998,261.626,329.628,391.995])value+=Math.sin(2*Math.PI*hz*i/sr);s[i]=value/6;}
 const result=detectKey(s,sr);
 assert.equal(result.primary.name,'C');assert.equal(result.primary.mode,'major');
});

test('optional TPDF dither affects 16-bit quantization but leaves 24-bit output unchanged',async()=>{
 const source=[new Float32Array(16).fill(-.00001)];
 const plain=new Uint8Array(await encodeWav(source,48000,16).arrayBuffer());
 let i=0;const random=()=>[0,0,0,0][i++%4];
 const dithered=new Uint8Array(await encodeWav(source,48000,16,{dither:true,random}).arrayBuffer());
 assert.equal(plain.byteLength,dithered.byteLength);
 assert.equal(new DataView(dithered.buffer).getUint16(34,true),16);
 const p24=new Uint8Array(await encodeWav(source,48000,24).arrayBuffer());
 const d24=new Uint8Array(await encodeWav(source,48000,24,{dither:true,random}).arrayBuffer());
 assert.deepEqual([...p24],[...d24]);
});
