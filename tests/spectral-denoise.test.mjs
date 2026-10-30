import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spectralFft,captureSpectralProfile,renderSpectralDenoise} from '../source/dsp/spectral-denoise.mjs';

test('spectral FFT and inverse reconstruct input',()=>{
 const re=Float64Array.from({length:2048},(_,i)=>Math.cos(i*.17)+.25*Math.sin(i*.041));
 const original=re.slice(),imag=new Float64Array(re.length);
 spectralFft(re,imag);spectralFft(re,imag,true);
 let error=0;for(let i=0;i<re.length;i++)error=Math.max(error,Math.abs(re[i]-original[i]));
 assert.ok(error<1e-9);
});
test('noise fingerprint has correct bins and finite values',()=>{
 const rate=48000,noise=Float32Array.from({length:rate},(_,i)=>.02*Math.sin(2*Math.PI*820*i/rate));
 const profile=captureSpectralProfile([noise],rate,0,.45);
 assert.equal(profile.length,1025);
 assert.ok(profile.every(Number.isFinite));
 assert.throws(()=>captureSpectralProfile([noise],rate,0,.02),/Select at least/);
});
test('0 percent reduction is bit-identical and non-destructive',()=>{
 const rate=48000,a=Float32Array.from({length:rate},(_,i)=>.2*Math.sin(2*Math.PI*440*i/rate));
 const profile=captureSpectralProfile([a],rate,0,.25),copy=a.slice();
 const result=renderSpectralDenoise(a,profile,{amount:0});
 assert.deepEqual(result,a);assert.deepEqual(a,copy);
});
test('spectral reduction lowers steady-state noise and keeps waveform finite',()=>{
 const rate=48000,noise=Float32Array.from({length:rate},(_,i)=>.03*Math.sin(2*Math.PI*620*i/rate));
 const profile=captureSpectralProfile([noise],rate,0,.2);
 const cleaned=renderSpectralDenoise(noise,profile,{amount:85,smoothing:60,floor:8});
 assert.equal(cleaned.length,noise.length);assert.ok(cleaned.every(Number.isFinite));
 const rms=x=>Math.sqrt(x.reduce((n,v)=>n+v*v,0)/x.length);
 assert.ok(rms(cleaned)<rms(noise)*.7);
});
test('spectral UI and realtime worklet are bundled',async()=>{
 const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
 const built=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const worklet=await readFile(new URL('../public/vendor/pulse-spectral-worklet.js',import.meta.url),'utf8');
 for(const id of ['tab-denoise','panel-denoise','denoise-learn','denoise-process','denoise-live','denoise-export'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(built,/createSpectralWorker/);
 assert.match(worklet,/registerProcessor\('pulse-spectral-denoiser'/);
});
