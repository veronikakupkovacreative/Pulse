import test from 'node:test';
import assert from 'node:assert/strict';
import WebAudio from 'web-audio-engine';
import {sidechainEnvelope,splitClip,normalizeExport,validatePlugin,renderClips,validatePcm} from '../source/dsp/clip-engine.mjs';
import {pitchCorrect,detectMonophonicPitch,deEssProcess,transientProcess,renderModulation} from '../source/advanced-fx.mjs';
import {processPitchTime} from '../source/dsp/production-tools.mjs';
import {truePeakDb} from '../source/dsp/true-peak.mjs';
globalThis.OfflineAudioContext=WebAudio.OfflineAudioContext;
const rate=44100;
const tone=(hz=440,seconds=1,amplitude=.25)=>Float32Array.from({length:Math.round(rate*seconds)},(_,i)=>amplitude*Math.sin(2*Math.PI*hz*i/rate));
const rms=signal=>Math.sqrt(signal.reduce((sum,x)=>sum+x*x,0)/signal.length);
function clip(id,samples,start=0){const ctx=new WebAudio.OfflineAudioContext(2,samples.length,rate),buffer=ctx.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);return {id,name:id,buffer,start,offset:0,duration:samples.length/rate,gainDb:0,pan:0,mute:false,solo:false};}

test('split retains original sample ranges and independent gain/pan',()=>{
 const c=clip('vocal',tone(220,2),1);c.gainDb=-6;c.pan=.3;
 const [left,right]=splitClip(c,1.75,'right');
 assert.equal(left.duration,.75);assert.equal(right.offset,.75);assert.equal(right.duration,1.25);assert.equal(right.start,1.75);assert.equal(right.gainDb,-6);assert.equal(c.duration,2);
 assert.throws(()=>splitClip(c,1.001,'short'));
});
test('sidechain attenuates the target under a second signal and releases afterwards',()=>{
 const trigger=new Float32Array(rate);trigger.fill(.8,rate/5,rate/2);
 const envelope=sidechainEnvelope([trigger],rate,{threshold:-24,ratio:4,attack:3,release:90});
 assert.equal(envelope[1000],1);assert.ok(envelope[rate*.4]<.2);assert.ok(envelope[rate-1]>.98);
 assert.throws(()=>sidechainEnvelope([trigger],rate,{ratio:NaN}));
});
test('timeline render respects start, pan, mute and stereo output',async()=>{
 const c=clip('left',tone(),.25);c.pan=-1;c.gainDb=-6;
 const b=await renderClips([c]);assert.equal(b.numberOfChannels,2);assert.equal(b.length,Math.ceil(1.25*rate));
 assert.equal(rms(b.getChannelData(0).subarray(0,rate/5)),0);assert.ok(rms(b.getChannelData(0))>.05);assert.ok(rms(b.getChannelData(1))<1e-7);
 const muted=await renderClips([{...c,mute:true}]);assert.equal(rms(muted.getChannelData(0)),0);
});
test('routed muted detector still compresses the audible target',async()=>{
 const source=clip('kick',new Float32Array(rate).fill(.8));source.mute=true;
 const target=clip('bass',tone(110));
 const dry=await renderClips([source,target]);
 const wet=await renderClips([source,target],{sidechain:{enabled:true,source:'kick',target:'bass',threshold:-24,ratio:4,attack:3,release:100}});
 assert.ok(rms(wet.getChannelData(0))<rms(dry.getChannelData(0))*.25);
 await assert.rejects(()=>renderClips([source,target],{sidechain:{enabled:true,source:'kick',target:'kick'}}));
});
test('pitch correction actually moves a detuned tone to scale with unchanged duration',()=>{
 const source=tone(455,1.5),before=source.slice(),out=pitchCorrect([source],rate,{key:0,scale:'major',strength:1,hard:true})[0];
 const pitch=detectMonophonicPitch(out,rate,rate/2);assert.ok(Math.abs(pitch.frequency-440)<1,pitch.frequency+' Hz');assert.equal(out.length,source.length);assert.deepEqual(source,before);assert.ok(rms(out)>rms(source)*.6);
 assert.deepEqual(pitchCorrect([source],rate,{strength:0})[0],source);
 assert.throws(()=>pitchCorrect([new Float32Array(rate)],rate));
});
test('time stretching changes duration while preserving tone pitch and stereo relationship',()=>{
 const source=tone(220,2),right=Float32Array.from(source,x=>-x);
 const out=processPitchTime([source,right],rate,{originalBpm:120,targetBpm:90,preservePitch:true});
 assert.equal(out[0].length,Math.round(source.length*120/90));const pitch=detectMonophonicPitch(out[0],rate,rate/2);assert.ok(Math.abs(pitch.frequency-220)<1);
 for(let i=1000;i<out[0].length;i+=100)assert.ok(Math.abs(out[0][i]+out[1][i])<1e-6);
});
test('de-esser attenuates high-frequency content more than low-frequency content',()=>{
 const low=tone(180),high=tone(8500);const options={frequency:5000,threshold:-35,amount:1};
 const lowGain=rms(deEssProcess([low],rate,options)[0])/rms(low),highGain=rms(deEssProcess([high],rate,options)[0])/rms(high);
 assert.ok(highGain<lowGain*.7,{lowGain,highGain});
});
test('transient attack increases a drum onset and neutral settings are transparent',()=>{
 const drum=Float32Array.from({length:rate},(_,i)=>.2*Math.sin(i*2*Math.PI*120/rate)*Math.exp(-i/(rate*.06)));
 const out=transientProcess([drum],rate,{attack:80,sustain:0})[0];assert.ok(rms(out.subarray(0,2205))>rms(drum.subarray(0,2205))*1.2);assert.deepEqual(transientProcess([drum],rate,{}),[drum]);
});
for(const type of ['chorus','phaser','flanger'])test(type+' produces bounded finite audio and dry mix is transparent',async()=>{
 const source=clip('test',tone()).buffer;
 const dry=await renderModulation(source,type,{mix:0});assert.ok(Math.abs(rms(dry.getChannelData(0))-rms(source.getChannelData(0)))<1e-6);
 const wet=await renderModulation(source,type,{mix:.5,depth:.7,rate:1.2});const data=wet.getChannelData(0);validatePcm([data],rate);assert.ok(rms(data)>.01);assert.ok(rms(Float32Array.from(data,(x,i)=>x-source.getChannelData(0)[i]))>.001);
});
test('normalization measures LUFS, protects reconstructed true peak, preserves input',()=>{
 const source=tone(1000,2,.1),copy=source.slice();const result=normalizeExport([source],rate,{mode:'lufs',targetLufs:-20});assert.ok(Math.abs(result.lufs+20)<.1);assert.ok(truePeakDb(result.channels)<=-1);assert.deepEqual(source,copy);
 const dynamic=tone(1000,1,.05);dynamic[2000]=.9;const limited=normalizeExport([dynamic],rate,{mode:'lufs',targetLufs:-5,ceiling:-2});assert.ok(limited.constrained);assert.ok(truePeakDb(limited.channels)<=-2+.002);
 assert.throws(()=>normalizeExport([new Float32Array(rate)],rate,{mode:'peak'}));assert.throws(()=>normalizeExport([tone(440,.1)],rate,{mode:'lufs'}));
});
test('JSON plugins run in sequence and reject script or invalid parameter nodes',async()=>{
 const a={version:1,name:'Gain',nodes:[{type:'gain',gainDb:-6}]};const b={version:1,name:'Pan',nodes:[{type:'pan',pan:1}]};
 const out=await renderClips([clip('tone',tone())],{plugins:[a,b]});assert.ok(rms(out.getChannelData(0))<1e-7);assert.ok(rms(out.getChannelData(1))>.05);
 assert.throws(()=>validatePlugin({version:1,name:'JS',nodes:[{type:'script',url:'https://example.com'}]}));assert.throws(()=>validatePlugin({version:1,name:'bad',nodes:[{type:'gain',gainDb:Infinity}]}));
});
