import test from 'node:test';
import assert from 'node:assert/strict';
import {Web} from '../source/modules/web-engine.mjs';
import {fromChannels} from '../source/modules/dsp.mjs';
import {toolModules} from '../source/modules/features.mjs';
const mono=(values,rate=8000)=>fromChannels([Float32Array.from(values)],rate);
const stereo=(left,right,rate=8000)=>fromChannels([Float32Array.from(left),Float32Array.from(right)],rate);
test('Web API is exported and all new UI tools are registered',()=>{
 const api=new Web();
 for(const name of ['importAudio','extractAudioFromVideo','cutAudio','normalizeAudio','removeSilence','reverseAudio','mergeAudioFiles','bitrateConverter','fileSizeCalculator','exportWavBlob','adjustVolume','changeAudioSpeed','bassBooster','reduceBackgroundNoise','audioCompressor','audioFadeInOut','audioEqualizer','aiMixer','aiMaster','voiceCleaner','audioEnhancer','detectBPM','separateStems','createVisualizer'])
  assert.equal(typeof api[name],'function',name);
 for(const id of ['merge-files','speed-change','file-size','video-audio'])
  assert.ok(toolModules.some(tool=>tool.id===id&&typeof tool.mount==='function'),id);
});
test('normalization preserves original and targets safe ceiling',()=>{
 const input=mono([.1,-.4,.2,0]),api=new Web(),output=api.normalizeAudio(input,-6);
 assert.equal(input.getChannelData(0)[1],Math.fround(-.4));
 assert.ok(Math.abs(Math.max(...output.getChannelData(0).map(Math.abs))-10**(-6/20))<1e-5);
 assert.notEqual(input,output);
});
test('cut validates bounds and keeps selected audio',()=>{
 const api=new Web(),b=mono([1,2,3,4,5,6]);
 assert.deepEqual([...api.cutAudio(b,2/8000,5/8000).getChannelData(0)],[3,4,5]);
 assert.throws(()=>api.cutAudio(b,5/8000,1/8000),/non-empty/);
});
test('merge preserves channels and joins with protective fade',()=>{
 const api=new Web(),a=stereo(Array(100).fill(.6),Array(100).fill(-.6)),b=stereo(Array(100).fill(.2),Array(100).fill(-.2));
 const result=api.mergeAudioFiles([a,b]);assert.equal(result.length,200);assert.equal(result.numberOfChannels,2);
 assert.equal(result.getChannelData(0)[0],Math.fround(.6));assert.equal(result.getChannelData(1)[0],Math.fround(-.6));
 assert.ok(result.getChannelData(0)[100]===0);
 assert.throws(()=>api.mergeAudioFiles([a,mono([.2])]),/matching/);
});
test('size estimate uses decimal kilobits and reverse is non-mutating',()=>{
 const api=new Web(),b=mono(Array(8000).fill(.25));
 assert.equal(api.fileSizeCalculator(b,128).bytes,16000);
 const reversed=api.reverseAudio(mono([.1,.2,.3]));
 assert.equal(reversed.getChannelData(0)[0],Math.fround(.3));
 assert.throws(()=>api.fileSizeCalculator(b,-5),/Invalid/);
});
test('AI center extraction labels approximation and rejects mono',()=>{
 const api=new Web(),result=api.separateStems(stereo([.5,.1],[.5,-.1]));
 assert.match(result.method,/not AI/);assert.equal(result.vocals.numberOfChannels,2);
 assert.throws(()=>api.separateStems(mono([1,1])),/Stereo/);
});
test('audioEQ builds three and five bands using fake context',()=>{
 const fakeNode=()=>({gain:{value:0},Q:{value:0},frequency:{value:0},connect(){}});
 const context={createGain:fakeNode,createBiquadFilter:fakeNode};
 const api=new Web(context),eq=api.audioEqualizer(5);
 assert.deepEqual(Object.keys(eq.bands),['sub','bass','mid','highMid','brilliance']);
 eq.applyPreset('edm');assert.equal(eq.bands.sub.gain.value,4);
 assert.throws(()=>api.audioEqualizer(7),/3 or 5/);
});
