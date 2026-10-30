import test from 'node:test';
import assert from 'node:assert/strict';
import {CLASSIC_EQ_MODES,classicEqBands} from '../source/dsp/classic-eq.mjs';
import {eqResponse,renderEqualizer} from '../source/dsp/parametric-eq.mjs';
import {readFile} from 'node:fs/promises';

test('four distinct Classic EQ modes map to valid 8-band curves',()=>{
 const modes=Object.keys(CLASSIC_EQ_MODES);
 assert.equal(modes.length,4);
 const curves=[];
 for(const mode of modes){
   const bands=classicEqBands(mode);
   assert.equal(bands.length,8,mode);
   assert.ok(bands.every(b=>b.frequency>=20&&b.frequency<=20000&&b.gain>=-12&&b.gain<=12));
   const curve=eqResponse(bands,48000,64);
   assert.ok(curve.every(p=>Number.isFinite(p.db)));
   curves.push(curve.map(p=>p.db.toFixed(2)).join(','));
 }
 assert.equal(new Set(curves).size,4);
 assert.throws(()=>classicEqBands('unknown'),/Unknown/);
});
test('Classic EQ actually changes audio, without mutating the source',()=>{
 const original=Float32Array.from({length:48000},(_,i)=>.2*Math.sin(2*Math.PI*110*i/48000));
 const copy=original.slice();
 const out=renderEqualizer([original],48000,classicEqBands('classic-warm'))[0];
 assert.deepEqual(original,copy);
 let diff=0;for(let i=0;i<out.length;i++)diff+=Math.abs(out[i]-original[i]);
 assert.ok(diff>1);
});
test('EQ FFT analyzer, Fix in Mix and Mix-to-Master actions are wired',async()=>{
 const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
 const src=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
 const extra=await readFile(new URL('../source/extra-tools.mjs',import.meta.url),'utf8');
 for(const id of ['eq-live-spectrum','eq-spectrum','mix-quick-auto','master-fix-in-mix','mix-fix-advice'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(src,/createAnalyser\(/);
 assert.match(extra,/getFloatFrequencyData\(/);
 assert.match(extra,/if\(autoRender\)el\('master-render'\)\.click\(\)/);
 assert.match(src,/extraApi\?\.showFixAdvice/);
});

test('Demucs model is opt-in, bounded, and retains actual four-stem result validation',async()=>{
  const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
  const source=await readFile(new URL('../source/extra-tools.mjs',import.meta.url),'utf8');
  const worker=await readFile(new URL('../source/vendor/demucs-worker.js',import.meta.url),'utf8');
  for(const id of ['mix-separate','mix-cancel-separation','mix-separation-status'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(source,/new Worker\('\/vendor\/demucs-worker\.js'\)/);
  assert.match(source,/data\.tracks\.length!==4/);
  assert.match(source,/window\.OfflineAudioContext/);
  assert.match(worker,/loadDemucsModel\(/);
  assert.match(worker,/separateStems\(/);
  assert.match(worker,/44100\*45/);
});
