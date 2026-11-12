import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {fromChannels} from '../source/modules/dsp.mjs';
import {analyzeStereo,renderStereoLab,renderVocalDoubler} from '../source/modules/stereo-lab-dsp.mjs';
import {mountStereoLab,mountVocalDoubler} from '../source/modules/stereo-lab-ui.mjs';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';

const rate=24000,duration=1.2,frames=Math.round(rate*duration);
function track(mono=false){
 const l=new Float32Array(frames),r=new Float32Array(frames);
 for(let i=0;i<frames;i++){
  const t=i/rate;
  l[i]=.24*Math.sin(2*Math.PI*70*t)+.12*Math.sin(2*Math.PI*420*t);
  r[i]=mono?l[i]:.21*Math.sin(2*Math.PI*70*t+.12)+.12*Math.sin(2*Math.PI*420*t+.6);
 }
 return fromChannels(mono?[l]:[l,r],rate);
}
test('Stereo Lab works locally, preserves input and returns bounded measured audio',()=>{
 const source=track(),left=source.getChannelData(0).slice(),before=analyzeStereo(source);
 const output=renderStereoLab(source,{width:135,bassMonoHz:140,pan:0,outputGainDb:1.5});
 assert.equal(output.buffer.length,source.length);
 assert.equal(output.buffer.sampleRate,source.sampleRate);
 assert.equal(output.buffer.numberOfChannels,2);
 assert.ok(output.after.peakDb<=0,'Stereo output should not clip');
 assert.ok(Number.isFinite(output.after.correlation));
 assert.ok(Number.isFinite(before.sideToMidDb));
 assert.deepEqual(source.getChannelData(0),left,'No mutation of source');
 const narrowed=renderStereoLab(source,{width:0,bassMonoHz:120});
 assert.ok(narrowed.after.correlation>.98,'Zero stereo width yields near-mono');
});
test('Vocal Doubler creates stereo modulation from mono vocal, with no model',()=>{
 const source=track(true),before=source.getChannelData(0).slice();
 const result=renderVocalDoubler(source,{delayMs:25,depthMs:1.8,modulationHz:.6,width:140,mix:50});
 assert.equal(result.buffer.numberOfChannels,2);
 assert.equal(result.buffer.length,source.length);
 assert.ok(result.after.peakDb<=0);
 assert.ok(result.buffer.getChannelData(0).some((x,i)=>Math.abs(x-result.buffer.getChannelData(1)[i])>.0001));
 assert.deepEqual(source.getChannelData(0),before);
});
test('Stereo Lab metrics handle silent and mono recordings',()=>{
 const mono=track(true),stats=analyzeStereo(mono);
 assert.equal(stats.channels,1);
 assert.ok(stats.correlation>.99);
 const silent=fromChannels([new Float32Array(25000),new Float32Array(25000)],24000);
 assert.equal(analyzeStereo(silent).correlation,null);
 assert.equal(renderStereoLab(silent).buffer.length,silent.length);
 assert.throws(()=>analyzeStereo(null),/Load a mono or stereo/);
});
test('Stereo Lab and Vocal Doubler controls mount and remain local',()=>{
 const {document}=parseHTML('<html><body><main id="root"></main></body></html>');
 const original=globalThis.document;globalThis.document=document;
 try{
  const root=document.getElementById('root');
  const clean=mountStereoLab({host:root});
  assert.ok(root.querySelector('[data-stereo-param="bassMonoHz"]'));
  assert.ok(root.querySelector('[data-stereo-preset="mono-bass"]'));
  assert.ok(root.querySelector('[data-stereo-action="render"]'));
  assert.ok(!root.textConelevent.includes('Stem Separator'));
  clean();
  root.replaceChildren();
  const close=mountVocalDoubler({host:root});
  assert.ok(root.querySelector('[data-stereo-param="delayMs"]'));
  assert.ok(root.querySelector('[data-stereo-param="mix"]'));
  close();
  const v=document.createElement('div');
  const vocals=aiV2Modules.find(m=>m.id==='ai2-vocals');
  const dispose=vocals.mount({host:v});
  assert.ok(v.textConelevent.includes('VOCAL DOUBLER'));
  assert.ok(!v.textConelevent.includes('NEURAL VOICE ISOLATOR'));
  dispose();
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
test('visible AI Studio contains eleven modules and no active neural isolation/stems',()=>{
 assert.equal(aiV2Modules.length,11);
 assert.ok(aiV2Modules.some(m=>m.id==='ai2-stereo'));
 assert.ok(!aiV2Modules.some(m=>m.id==='ai2-stems'));
 const code=readFileSync(new URL('../source/modules/ai-v2.mjs',import.meta.url),'utf8');
 const copy=readFileSync(new URL('../source/modules/ai-v2-copy.mjs',import.meta.url),'utf8');
 assert.ok(code.includes('mountVocalDoubler'));
 assert.doesNotMatch(code,/NEURAL VOICE ISOLATOR|mountStems|\/api\/pulse-stems/);
 assert.doesNotMatch(copy,/protected ElevenLabs neural voice isolation|Neural Demucs/);
});
