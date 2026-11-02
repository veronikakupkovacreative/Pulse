import test from 'node:test';
import assert from 'node:assert/strict';
import {bandLayout,eqPresetGains,eqFilters,interpolateEqGains,EQ_GENRE_PRESETS,EQ_LAYOUTS} from '../source/modules/eq-engine.mjs';
for(const n of [3,5,10,20]){
 test(`layout ${n} is frequency-ordered with no duplicate bands`,()=>{
  const bands=bandLayout(n);assert.equal(bands.length,n);
  assert.ok(bands.every((v,i)=>i===0||v.frequency>bands[i-1].frequency));
  assert.ok(bands.every(b=>b.frequency>=20&&b.frequency<=20000));
  assert.equal(eqFilters(n,Array(n).fill(0)).length,n);
 });
 test(`all genre presets yield finite independent ${n}-band settings`,()=>{
  for(const id of Object.keys(EQ_GENRE_PRESETS)){
   const values=eqPresetGains(n,id);assert.equal(values.length,n,id);
   assert.ok(values.every(x=>Number.isFinite(x)&&x>=-18&&x<=18),id);
  }
  for(const id of ['edm','vocals','hiphop','acoustic'])assert.ok(eqPresetGains(n,id).some(x=>x!==0));
 });
}
test('3-band existing filter frequencies and types are preserved',()=>{
 const layout=bandLayout(3);
 assert.deepEqual(layout.map(x=>x.frequency),[120,1200,8500]);
 assert.deepEqual(layout.map(x=>x.type),['lowshelf','peaking','highshelf']);
 assert.deepEqual(eqPresetGains(3,'bass'),[7,0,-1]);
});
test('5-band existing filter frequencies and types are preserved',()=>{
 const layout=bandLayout(5);
 assert.deepEqual(layout.map(x=>x.frequency),[60,230,1000,4000,12000]);
 assert.deepEqual(layout.map(x=>x.type),['lowshelf','peaking','peaking','peaking','highshelf']);
});
test('10 and 20 band filtering is actually distinct',()=>{
 const a=eqFilters(10,eqPresetGains(10,'edm'));
 const b=eqFilters(20,eqPresetGains(20,'edm'));
 assert.equal(a.length,10);assert.equal(b.length,20);
 assert.ok(a.some(s=>s.gain!==0));assert.ok(b.some(s=>s.gain!==0));
 assert.notDeepEqual(a.map(s=>s.frequency),b.map(s=>s.frequency));
});
test('manual edits can be interpolated when changing count',()=>{
 const fresh=interpolateEqGains(5,[3,1,-2,2,4],20);
 assert.equal(fresh.length,20);assert.ok(fresh.at(-1)>fresh[0]);
 assert.ok(fresh.every(x=>x>=-18&&x<=18));
});
test('invalid settings cannot reach DSP',()=>{
 assert.throws(()=>bandLayout(12));
 assert.throws(()=>eqFilters(5,[1,2]));
 assert.throws(()=>eqFilters(3,[1,Infinity,2]));
 assert.throws(()=>eqFilters(20,Array(20).fill(19)));
 assert.throws(()=>eqPresetGains(5,'dreamy-fictional'));
});