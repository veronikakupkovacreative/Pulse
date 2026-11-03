import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {removeNoiseChannels,validateNoiseSettings} from '../source/modules/noise-dsp.mjs';

const rate=24000;
const seconds=1.5;
const length=rate*seconds;
const createTestSignal=(seed=17)=>{
 let state=seed>>>0;
 const data=new Float32Array(length);
 for(let i=0;i<length;i++){
  state=(1664525*state+1013904223)>>>0;
  const noise=((state/4294967296)*2-1)*.07;
  const tone=i>=rate*.42?.37*Math.sin(2*Math.PI*420*i/rate):0;
  data[i]=tone+noise;
 }
 return data;
};
const rms=(buffer,start=0,end=buffer.length)=>{
 let sum=0;for(let i=start;i<end;i++)sum+=buffer[i]*buffer[i];
 return Math.sqrt(sum/(end-start));
};
const project=(signal,frequency,start,end)=>{
 let cos=0,sin=0;
 for(let i=start;i<end;i++){
  const phase=2*Math.PI*frequency*i/rate;
  cos+=signal[i]*Math.cos(phase);sin+=signal[i]*Math.sin(phase);
 }
 return Math.hypot(cos,sin)*2/(end-start);
};

test('validates settings while respecting low sample-rate Nyquist',()=>{
 const s=validateNoiseSettings({highpass:70,lowpass:18000,intensity:.7},rate);
 assert.ok(s.lowpass<=rate*.455);
 assert.throws(()=>validateNoiseSettings({highpass:-3},rate),/High-pass/);
 assert.throws(()=>validateNoiseSettings({intensity:1.4},rate),/Intensity/);
 assert.throws(()=>validateNoiseSettings({lowpass:NaN},rate),/Low-pass/);
});

test('real stationary-noise suppression improves quiet region and keeps main tone',()=>{
 const signal=createTestSignal();const copy=signal.slice();
 const r=removeNoiseChannels([signal],rate,{highpass:20,lowpass:20000,intensity:.85,noiseRange:{start:0,end:.35}});
 assert.equal(r.channels.length,1);assert.equal(r.channels[0].length,length);
 assert.equal(r.info.profile,'selected');
 assert.deepEqual(signal,copy,'Noise reduction must not mutate the source audio');
 const oldNoise=rms(signal,rate*.1,rate*.3),newNoise=rms(r.channels[0],rate*.1,rate*.3);
 assert.ok(newNoise<oldNoise*.83,`Expected noise reduction: ${newNoise} < ${oldNoise*.83}`);
 const originalTone=project(signal,420,rate*.7,rate*1.3);
 const cleanedTone=project(r.channels[0],420,rate*.7,rate*1.3);
 assert.ok(cleanedTone>originalTone*.68,`Preserve main tone: ${cleanedTone}/${originalTone}`);
});

test('mono and stereo render at the same sample rate with finite samples',()=>{
 const one=createTestSignal(4),two=createTestSignal(8);
 const original=two.slice();
 let lastProgress=0;
 const r=removeNoiseChannels([one,two],rate,{highpass:90,lowpass:11000,intensity:.6},{onProgress:p=>lastProgress=p});
 assert.equal(r.channels.length,2);assert.equal(r.channels[0].length,one.length);
 assert.equal(r.channels[1].length,two.length);
 assert.equal(lastProgress,1);
 assert.ok(r.channels.every(channel=>channel.every(Number.isFinite)));
 assert.deepEqual(two,original);
});

test('auto noise profile works and returns analyzed frame count',()=>{
 const r=removeNoiseChannels([createTestSignal()],rate,{highpass:60,lowpass:14000,intensity:.5});
 assert.equal(r.info.profile,'automatic');
 assert.ok(r.info.analyzedFrames>0);
 assert.ok(Number.isFinite(r.channels[0][rate]));
});

test('rejects impossible selections, NaN audio, and empty channels',()=>{
 const src=createTestSignal();
 assert.throws(()=>removeNoiseChannels([],rate),/mono or stereo/);
 assert.throws(()=>removeNoiseChannels([src],rate,{noiseRange:{start:1,end:.2}}),/Invalid noise-only selection/);
 const bad=src.slice();bad[100]=NaN;
 assert.throws(()=>removeNoiseChannels([bad],rate),/invalid samples/);
});

test('automatic noise analysis protects sustained tonal fundamentals',()=>{
 const signal=new Float32Array(rate*2);
 for(let i=0;i<signal.length;i++)signal[i]=.35*Math.sin(2*Math.PI*440*i/rate);
 const cleaned=removeNoiseChannels([signal],rate,{highpass:20,lowpass:20000,intensity:.7}).channels[0];
 const original=project(signal,440,rate*.5,rate*1.5);
 const result=project(cleaned,440,rate*.5,rate*1.5);
 assert.ok(result/original>.82,`Unexpected tone reduction: ${result/original}`);
});

test('silent audio stays silent and produces finite samples',()=>{
 const zeros=new Float32Array(4096);
 const out=removeNoiseChannels([zeros],rate,{highpass:100,lowpass:8000,intensity:1});
 assert.ok(out.channels[0].every(v=>v===0));
});

test('worker bridge sends a real processed result, not a fake timeout',async()=>{
 const messages=[];
 const prior=globalThis.self;
 globalThis.self={postMessage:(message,transfers)=>messages.push({message,transfers})};
 try{
  await import('../source/modules/noise-worker.mjs');
  globalThis.self.onmessage({data:{channels:[createTestSignal()],sampleRate:rate,settings:{highpass:60,lowpass:14000,intensity:.55}}});
  assert.ok(messages.some(v=>v.message.type==='progress'));
  const result=messages.find(v=>v.message.type==='result');
  assert.ok(result);
  assert.equal(result.message.channels[0].length,length);
  assert.equal(result.transfers.length,1);
 }finally{if(prior===undefined)delete globalThis.self;else globalThis.self=prior;}
});

test('tool export retains a unique ID and registers under AI STUDIO',()=>{
 const source=readFileSync(new URL('../source/modules/noise-tool.mjs',import.meta.url),'utf8');
 assert.match(source,/export const noiseRemoverModule=Object.freeze\(\{id:'noise-remover',category:'ai',label:'AI Noise Remover'/);
 assert.match(source,/new Worker\(new URL\('\.\/noise-worker\.mjs',import\.meta\.url\)/);
 assert.match(source,/w\.commit\(prepared/);
});
