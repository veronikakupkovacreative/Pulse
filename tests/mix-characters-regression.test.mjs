import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {processMixCharacter} from '../source/dsp/mix-character.mjs';

const rate=48000;
const sine=Float32Array.from({length:rate},(_,i)=>.46*Math.sin(2*Math.PI*220*i/rate)+.18*Math.sin(2*Math.PI*1760*i/rate));
const rms=arr=>Math.sqrt(arr.reduce((s,x)=>s+x*x,0)/arr.length);
test('Four DSP characters are distinct, bounded, deterministic and never modify input',()=>{
 const original=sine.slice();
 const results=['tube','console','tape','crush'].map(type=>processMixCharacter([sine],rate,{type,drive:75,tone:15,blend:100})[0]);
 for(const audio of results){assert.equal(audio.length,sine.length);assert.ok(audio.every(Number.isFinite));assert.ok(Math.max(...audio.slice(0,2048))<=1);assert.ok(rms(audio)>.025);}
 for(let i=0;i<results.length;i++)for(let j=i+1;j<results.length;j++)assert.ok(rms(Float32Array.from(results[i],(v,k)=>v-results[j][k]))>.001,'Characters '+i+' '+j+' should differ');
 assert.deepEqual(sine,original);
});
test('Bypass and 0% mix or drive return exact unmodified samples',()=>{
 for(const setting of [{bypass:true},{drive:0},{blend:0}]){
  assert.deepEqual(processMixCharacter([sine],rate,{drive:80,blend:90,...setting})[0],sine);
 }
});
test('Drive, tone, wet and tape hiss influence output',()=>{
 const base={type:'tape',drive:65,blend:80};
 const x=processMixCharacter([sine],rate,{...base,tone:-60})[0];
 const y=processMixCharacter([sine],rate,{...base,tone:60})[0];
 const z=processMixCharacter([sine],rate,{...base,tone:-60,tapeNoise:true})[0];
 assert.ok(rms(Float32Array.from(x,(v,i)=>v-y[i]))>.0001);
 assert.ok(rms(Float32Array.from(x,(v,i)=>v-z[i]))>.00001);
 assert.throws(()=>processMixCharacter([sine],rate,{drive:101}),/Invalid/);
});
test('Main export and Mix UI expose supported codecs and A/B bypass',async()=>{
 const [html,src]=await Promise.all([readFile(new URL('../source/index.html',import.meta.url),'utf8'),readFile(new URL('../source/tools.mjs',import.meta.url),'utf8')]);
 for(const fragment of ['value="flac"','value="m4a"','value="64"','id="mix-bypass"','id="mix-quick-preview-a"'])assert.ok(html.includes(fragment),fragment);
 for(const fragment of ['encodeFlac16(data,rate)','encodeM4aWithMediaRecorder(out,192000','function syncOutput()'])assert.ok(src.includes(fragment),fragment);
});
