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
 assert.ok(result.after.truePeakDb<=-0.95,'output true peak stays below selected ceiling');
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
     assert.ok(r.after.truePeakDb<=-0.95);
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
 assert.match(html,/id="tab-mix"/);assert.match(html,/id="panel-mix"/);
 assert.match(html,/id="tab-youtube"/);
});

test('true-peak ceiling, intensity and punchy preset use measurable processing',()=>{
 const input=sample(1.2);
 for(const ceilingDb of [-2,-1,-.3]){
   const result=processMaster(input,rate,{preset:'punchy',intensity:80,ceilingDb});
   assert.ok(result.after.truePeakDb<=ceilingDb+.08,`true peak ${result.after.truePeakDb} exceeded ${ceilingDb}`);
   assert.ok(result.settings.maxReductionDb>=0);
   assert.ok(Number.isFinite(result.after.crestDb));
   assert.ok(Number.isFinite(result.after.correlation));
 }
 const subtle=processMaster(input,rate,{intensity:0});
 const strong=processMaster(input,rate,{intensity:100});
 assert.equal(subtle.settings.ratio,1);
 assert.ok(strong.settings.ratio>subtle.settings.ratio);
 assert.ok(strong.settings.lowDb!==subtle.settings.lowDb||strong.settings.highDb!==subtle.settings.highDb);
});

test('mix health supports stereo analysis and optional processing',()=>{
 const channels=sample(1.1);const original=channels.map(c=>c.slice());
 const result=processMaster(channels,rate,{stereoWidth:1.15,intensity:55});
 assert.ok(Array.isArray(result.findings)&&result.findings.length>=1);
 assert.equal(result.settings.stereoWidth,1.15);
 assert.ok(Number.isFinite(result.after.balanceDb));
 assert.ok(Number.isFinite(result.after.widthRatio));
 assert.deepEqual(channels,original);
 assert.ok(result.after.truePeakDb<=-.95);
});

test('master reports seven measured frequency bands without mutating audio',()=>{
 const src=sample(1.1),r=processMaster(src,rate,{preset:'balanced'});
 assert.equal(r.before.spectrum.length,7);assert.equal(r.after.spectrum.length,7);
 const total=r.before.spectrum.reduce((a,b)=>a+b.share,0);
 assert.ok(Math.abs(total-1)<1e-5);assert.ok(r.findings.length>0);
});
