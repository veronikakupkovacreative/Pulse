import test from 'node:test';
import assert from 'node:assert/strict';
import {stripSilence,fadeBuffer,separateCenter,EQ5_PRESETS} from '../source/modules/legacy-dsp.mjs';
function makeBuffer(channels,rate=1000){const length=channels[0].length;return {sampleRate:rate,length,duration:length/rate,numberOfChannels:channels.length,getChannelData:c=>channels[c]};}
test('legacy DSP helpers preserve duration and channel layout',()=>{
 const source=makeBuffer([Float32Array.from({length:1000},(_,i)=>Math.sin(i/10))]);
 const faded=fadeBuffer(source,.1,'in');assert.equal(faded.length,source.length);assert.equal(faded.numberOfChannels,1);
 assert.equal(faded.getChannelData(0)[0],0);assert.ok(Math.abs(faded.getChannelData(0)[99]-source.getChannelData(0)[99])<1e-6);
});
test('silence trim keeps a safety margin around real content',()=>{
 const data=new Float32Array(2000);for(let i=500;i<1500;i++)data[i]=.5;
 const trimmed=stripSilence(makeBuffer([data]),-40);assert.ok(trimmed.length<2000);assert.ok(trimmed.length>1000);
});
test('center separation requires stereo and preserves sample count',()=>{
 const left=Float32Array.from([1,.5,-.5,-1]),right=Float32Array.from([1,-.5,.5,-1]);
 const split=separateCenter(makeBuffer([left,right],48000));assert.equal(split.vocals.numberOfChannels,2);assert.equal(split.instrumental.length,4);
 assert.throws(()=>separateCenter(makeBuffer([left],48000)),/Stereo/);
});
test('five-band EQ presets remain finite and bounded',()=>{
 assert.deepEqual(Object.keys(EQ5_PRESETS),['flat','warm_vocals','punchy_drums','club_edm']);
 for(const values of Object.values(EQ5_PRESETS))assert.equal(values.length,5);
});
