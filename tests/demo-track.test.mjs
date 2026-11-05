import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoTrack} from '../source/modules/demo-track.mjs';

test('demo generates an original valid stereo PCM WAV without a network connection',async()=>{
 const file=await createDemoTrack({bars:1});
 assert.equal(file.type,'audio/wav');
 const array=await file.arrayBuffer(),view=new DataView(array);
 assert.equal(new TextDecoder().decode(array.slice(0,4)),'RIFF');
 assert.equal(new TextDecoder().decode(array.slice(8,12)),'WAVE');
 assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint16(34,true),16);
 assert.equal(view.getUint32(24,true),22050);assert.equal(view.getUint32(40,true),22050*2*4);
});
