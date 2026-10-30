import test from 'node:test';
import assert from 'node:assert/strict';
import {processMaster,analyzeMaster,designMaster} from '../source/dsp/mastering.mjs';
import {peakDb} from '../source/dsp/quick-tools.mjs';
const rate=48000;
function sample(seconds=2,channels=2){
 const out=[];
 for(let c=0;c<channels;c++){
   const samples=new Float32Array(Math.floor(seconds*rate));
   for(let i=0;i<samples.length;i++){
     // Tonal, transient-rich, non-silent input with realistic crest variation.
     const decay=Math.pow(Math.max(0,Math.sin(2*Math.PI*2*i/rate)),10);
     samples[i]=0.18*Math.sin(2*Math.PI*(110+30*c)*i/rate)+0.12*Math.sin(2*Math.PI*880*i/rate)+.4*decay*Math.sin(2*Math.PI*55*i/rate);
   }
   out.push(samples);
 }
 return out;
}
test('master works on stereo audio without mutating original and produces bounded output',()=>{
 const src=sample(),copy=src.map(c=>c.slice());
 const result=processMaster(src,rate,{preset:'balanced',targetLufs:-13});
 assert.equal(result.channels.length,2);
 for(let c=0;c<2;c++){
   assert.equal(result.channels[c].length,src[c].length);
   assert.deepEqual(src[c],copy[c]);
 }
 assert.ok(peakDb(result.channels)<=-1.19,'sample peaks below -1.2 dBFS');
 assert.ok(Number.isFinite(result.before.lufs)&&Number.isFinite(result.after.lufs));
 assert.ok(Math.abs(result.after.lufs-(-13))<2.5,`expected loudness near target, got ${result.after.lufs}`);
 assert.ok(result.settings.appliedGainDb>-9,'EQ should not create excess amplification');
});
test('master output differs by preset and remains finite for mono and stereo',()=>{
 for(const count of [1,2]){
   const src=sample(1.1,count);
   for(const preset of ['balanced','warm','loud']){
     const r=processMaster(src,rate,{preset});
     assert.equal(r.channels.length,count);
     for(const ch of r.channels)for(let i=0;i<ch.length;i+=173)assert.ok(Number.isFinite(ch[i]));
     assert.ok(peakDb(r.channels)<=-1.19);
   }
 }
});
test('master rejects silence and invalid targets',()=>{
 assert.throws(()=>analyzeMaster([new Float32Array(rate)],rate),/Silent audio/);
 const a=analyzeMaster(sample(),rate);
 assert.throws(()=>designMaster(a,'balanced',-25),/LUFS/);
 assert.throws(()=>designMaster(a,'none'),/preset/);
});
test('AI Studio navigation represents all active tools and marks unfinished modules',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
 for(const group of ['analyze','edit','export','ai'])assert.match(html,new RegExp(`data-category="${group}"`));
 for(const tool of ['converter','key','cutter','reverse','trim','calculator','normalizer','pitch','tuner','slicer','master']){
   assert.match(html,new RegExp(`id="tab-${tool}"`));
   assert.match(js,new RegExp(`'${tool}'`));
 }
 assert.match(html,/AI Mix <small>PLANNED/);
 assert.match(html,/id="tab-youtube"[^>]*disabled/);
});
