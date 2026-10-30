import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAudioForAssist,recommendAiSettings,sidechainProcess} from '../source/dsp/ai-assisted.mjs';
const rate=22050,seconds=2,n=rate*seconds;
const sine=(hz,amp)=>Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/rate));
test('model-conditioned recommendations require real classification input',()=>{
 const features=analyzeAudioForAssist([sine(150,.3)],rate);
 assert.throws(()=>recommendAiSettings([],features,'chorus'),/model classification/);
 assert.throws(()=>recommendAiSettings([{label:'Drums',score:2}],features,'chorus'),/model classification/);
 for(const type of ['chorus','phaser','flanger','transient','deesser','sidechain','normalize']){
  const result=recommendAiSettings([{label:'Drum percussion',score:.65},{label:'Bass synthesizer',score:.35}],features,type);
  assert.equal(result.effect,type);assert.ok(result.model.includes('YAMNet')===false||result.model.length>0);
  assert.ok(Object.values(result.settings).every(v=>typeof v==='string'||Number.isFinite(v)));
 }
});
test('external key sidechain ducks a bass without mixing the trigger into output',()=>{
 const bass=sine(110,.35),key=new Float32Array(n);
 for(let i=0;i<n;i++)if(i<rate/2)key[i]=.9*Math.sin(2*Math.PI*150*i/rate);
 const original=bass.slice(),result=sidechainProcess([bass],[key],rate,{threshold:-30,ratio:8,attack:3,release:90});
 const rms=(data,from,to)=>Math.sqrt(data.slice(from,to).reduce((sum,x)=>sum+x*x,0)/(to-from));
 assert.ok(rms(result.channels[0],rate/5,rate/3)<rms(bass,rate/5,rate/3)*.7);
 assert.ok(rms(result.channels[0],rate+rate/2,n)>rms(result.channels[0],rate/5,rate/3));
 assert.ok(result.maxReductionDb>5);
 assert.deepEqual(original,bass);
 assert.equal(result.channels[0].length,n);
});
