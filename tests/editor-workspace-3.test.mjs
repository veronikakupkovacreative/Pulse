import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeEqBands,selectClosestBand} from '../source/dsp/eq-band-modes.mjs';
import {renderEqualizer,eqResponse} from '../source/dsp/parametric-eq.mjs';
import {trimWaveform,deleteWaveformRange,splitWaveform,removeQuietPauses,reduceNoiseGate} from '../source/dsp/waveform-edit.mjs';
import {mixStems,automationGainAt,generateDuckingAutomation} from '../source/dsp/multitrack-mix.mjs';

const rate=16000;
const sine=(seconds=2,amp=.3)=>Float32Array.from({length:Math.round(rate*seconds)},(_,i)=>amp*Math.sin(2*Math.PI*220*i/rate));
test('3/8/10/20 modes produce distinct and stable filter counts',()=>{
  for(const count of [3,8,10,20]){
    const bands=makeEqBands(count);
    assert.equal(bands.length,count);
    assert.ok(bands.every(b=>b.frequency>=20&&b.frequency<=20000));
    assert.ok(eqResponse(bands,rate).every(p=>Number.isFinite(p.db)));
    const input=sine(.2);
    const output=renderEqualizer([input],rate,bands);
    assert.equal(output[0].length,input.length);
    assert.ok(output[0].every(Number.isFinite));
  }
  assert.throws(()=>makeEqBands(9),/supports/);
  assert.equal(selectClosestBand(makeEqBands(3),1100),1);
});
test('waveform trim / delete / split preserve input and produce micro-fades',()=>{
  const input=sine(2),copy=input.slice();
  const trimmed=trimWaveform([input],rate,.3,1.4)[0];
  assert.equal(trimmed.length,Math.ceil(1.4*rate)-Math.floor(.3*rate));
  assert.ok(Math.abs(trimmed[0])<1e-12);
  assert.ok(Math.abs(trimmed.at(-1))<1e-12);
  const removed=deleteWaveformRange([input],rate,.5,.8)[0];
  assert.equal(removed.length,input.length-Math.ceil(.8*rate)+Math.floor(.5*rate));
  const around=Math.floor(.5*rate);
  assert.ok(Math.abs(removed[around-1])<.01);
  assert.ok(Math.abs(removed[around])<.01);
  const split=splitWaveform([input],rate,1);
  assert.equal(split.left[0].length+split.right[0].length,input.length);
  assert.deepEqual(input,copy);
});
test('long quiet pause removal reduces duration and preserves speech clips',()=>{
 const speech=sine(.3),silence=new Float32Array(rate);
 const input=new Float32Array(speech.length*2+silence.length);
 input.set(speech,0);input.set(speech,speech.length+silence.length);
 const output=removeQuietPauses([input],rate,{thresholdDb:-35,minPauseMs:400});
 assert.equal(output.removed,1);
 assert.ok(output.channels[0].length<input.length-rate*.6);
 assert.equal(output.channels[0][0],input[0]);
});
test('conservative noise gate attenuates low amplitude background hiss',()=>{
 const input=sine(1,.003);
 const output=reduceNoiseGate([input],rate,{thresholdDb:-35,maxReductionDb:18})[0];
 const mean=(arr,start)=>arr.subarray(start).reduce((sum,x)=>sum+x*x,0)/Math.max(1,arr.length-start);
 assert.ok(mean(output,rate*.75)<mean(input,rate*.75)*.1);
 assert.deepEqual(input,sine(1,.003));
});
test('multitrack volume automation and voice ducking attenuate selected stem',()=>{
 const voice=sine(2,.6),music=sine(2,.25);
 const stem=(ch,automation=[])=>({rate,channels:[ch],gainDb:0,pan:0,mute:false,solo:false,automation});
 const base=mixStems([stem(music),stem(new Float32Array(music.length))]);
 const lowered=mixStems([stem(music,[{time:0,gainDb:-9},{time:2,gainDb:-9}]),stem(new Float32Array(music.length))]);
 const energy=ch=>ch.reduce((a,x)=>a+x*x,0);
 assert.ok(energy(lowered.channels[0])<energy(base.channels[0])*.3);
 const keyframes=generateDuckingAutomation([voice],rate);
 assert.ok(keyframes.length>2);
 assert.ok(keyframes.some(x=>x.gainDb<-5));
 assert.ok(automationGainAt([{time:0,gainDb:0},{time:1,gainDb:-12}],.5)<1);
});
test('EQ and analysis UI use left waveform and preserve right settings',async()=>{
 const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
 const ts=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
 const ex=await readFile(new URL('../source/extra-tools.mjs',import.meta.url),'utf8');
 const left=html.indexOf('id="tool-loaded"'),stage=html.indexOf('id="eq-response-graph"'),right=html.indexOf('class="tool-settings"');
 assert.ok(left>=0&&stage>left&&stage<right);
 assert.ok(html.indexOf('id="eq-live-spectrum"')<right);
 assert.ok(html.indexOf('id="eq-band-count"')>right);
 for(const id of ['insights-mix','insights-master','wave-trim-range','wave-delete-range','wave-split','wave-denoise','wave-remove-pauses','mix-auto-duck'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(ts,/leftMaster\.append\(node\)/);
 assert.match(ts,/leftMix\.append\(node\)/);
 assert.match(ts,/Math\.min\(65536/);
 assert.match(ex,/makeEqBands\(count\)/);
 assert.match(ex,/generateDuckingAutomation/);
});
