import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {normalizationPlan,applyPeakGain,exportNormalizedWav} from '../source/modules/normalizer-core.mjs';
const buffer=(samples,rate=44100)=>({numberOfChannels:samples.length,sampleRate:rate,length:samples[0].length,getChannelData:i=>Float32Array.from(samples[i])});
test('attenuates 0 dBFS peak to -1 dBFS',()=>{const p=normalizationPlan(buffer([[1,-1]]));assert.ok(Math.abs(p.outputDbfs+1)<1e-8);assert.ok(p.gain<1);});
test('caps boost at 200%',()=>{const p=normalizationPlan(buffer([[.1,-.1]]));assert.equal(p.gain,2);assert.equal(p.capped,true);});
test('keeps stereo proportions and original samples',()=>{const src=buffer([[.5,-.5],[.25,-.25]]);const p=normalizationPlan(src);const out=applyPeakGain(src,p.gain);assert.ok(Math.abs(out.getChannelData(0)[0]/out.getChannelData(1)[0]-2)<1e-6);assert.equal(src.getChannelData(0)[0],.5);});
test('silence produces finite unity gain',()=>{const p=normalizationPlan(buffer([[0,0]]));assert.equal(p.gain,1);assert.equal(p.silent,true);});
test('invalid target is rejected',()=>{assert.throws(()=>normalizationPlan(buffer([[1]]),-20));});
test('WAV 16/24 bit header, length and sample rate',async()=>{for(const bits of [16,24]){const b=buffer([[.5,-.5],[.25,-.25]],48000),wav=await exportNormalizedWav(b,1,bits),view=new DataView(await wav.arrayBuffer());assert.equal(view.getUint32(24,true),48000);assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint16(34,true),bits);assert.equal(wav.size,44+2*2*bits/8);}});

test('AI Normalizer uses the PULSE red settings panel',()=>{const css=readFileSync(new URL('../source/modules/normalizer.css',import.meta.url),'utf8');assert.match(css,/\.tool-settings:has\(\.pulse-normalizer\)\{background:#ff2b20;color:#191919\}/);assert.doesNotMatch(css,/\.tool-settings:has\(\.pulse-normalizer\)\{background:#eeede8/);});

test('AI Normalizer headline is bold and supporting UI is regular',()=>{
 const css=readFileSync(new URL('../source/modules/normalizer.css',import.meta.url),'utf8');
 assert.match(css,/\.pulse-normalizer h3\{font-weight:700/);
 assert.match(css,/\.pulse-normalizer \.pn-meters strong,[\s\S]*?font-weight:400/);
 assert.match(css,/\.pulse-normalizer \.tool-view-header,[\s\S]*?font-weight:400/);
});
