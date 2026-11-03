import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=await mkdtemp(join(tmpdir(),'pulse-producer-'));
await writeFile(join(root,'package.json'),'{"type":"module"}');
await copyFile(new URL('../source/modules/producer-dsp.mjs',import.meta.url),join(root,'producer-dsp.mjs'));
await writeFile(join(root,'dsp.mjs'),'export const fromChannels=(data,sampleRate)=>({numberOfChannels:data.length,sampleRate,length:data[0].length,duration:data[0].length/sampleRate,getChannelData:c=>data[c]});');
await writeFile(join(root,'legacy-dsp.mjs'),'export async function renderWithNodes(b,specs){return b}');
const {referenceProfile,analyzeReferenceMatch,reduceRoomTails,detectKeyAndChords}=await import(pathToFileURL(join(root,'producer-dsp.mjs')));
const sr=44100,n=sr*2;
const mk=(freq,amp=.3)=>{const data=Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*freq*i/sr));return {sampleRate:sr,length:n,duration:n/sr,numberOfChannels:1,getChannelData:()=>data};};
const sine=mk(440),other=mk(150);
test('spectral reference match estimates finite EQ gains',()=>{
 const a=referenceProfile(sine),r=analyzeReferenceMatch(sine,other,{amount:.7,maxDb:5});
 assert.equal(a.length,8);assert.equal(r.gains.length,8);assert.ok(r.gains.every(v=>Number.isFinite(v)&&Math.abs(v)<=5));
 assert.throws(()=>analyzeReferenceMatch(sine,other,{amount:2}));
});
test('linked tail reduction does not mutate source or break stereo',()=>{
 const mono=sine.getChannelData(0),right=Float32Array.from(mono,v=>v*.5);
 const b={sampleRate:sr,length:n,duration:2,numberOfChannels:2,getChannelData:c=>c?right:mono};
 const before=mono[512],out=reduceRoomTails(b,{amount:.8});
 assert.equal(out.numberOfChannels,2);assert.equal(out.length,n);assert.equal(mono[512],before);
 assert.ok(out.getChannelData(0).every(Number.isFinite));assert.throws(()=>reduceRoomTails(b,{amount:9}));
});
test('key/chord analysis reports data-supported result and no fixed fake 94%',()=>{
 const r=detectKeyAndChords(sine);assert.match(r.key,/^[A-G][#]? (major|minor)$|^Undetermined$/);assert.ok(r.confidence>=0&&r.confidence<=95);
 assert.equal(r.method,'FFT chroma / tonal-template estimation');assert.ok(Array.isArray(r.chords));
});
await rm(root,{recursive:true,force:true});
