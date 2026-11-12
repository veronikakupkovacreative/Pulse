import test from 'node:test';
import assert from 'node:assert/strict';
import {fromChannels} from '../source/modules/dsp.mjs';
import {MASTER_PRESETS,masteringSettings,recommendMasteringSettings,renderMasteringAudio,measureMasteringAudio} from '../source/modules/mastering-engine.mjs';
import {readFileSync} from 'node:fs';

function music(duration=1,rate=32000,level=.14,stereo=true) {
 const n=Math.floor(duration*rate);
 const left=new Float32Array(n),right=new Float32Array(n);
 for(let i=0;i<n;i++){
  const t=i/rate;
  left[i]=level*(.65*Math.sin(2*Math.PI*65*t)+.3*Math.sin(2*Math.PI*440*t)+.14*Math.sin(2*Math.PI*3900*t));
  right[i]=level*(.65*Math.sin(2*Math.PI*65*t+.015)+.3*Math.sin(2*Math.PI*440*t+.025)+.14*Math.sin(2*Math.PI*3900*t+.04));
 }
 return fromChannels(stereo?[left,right]:[left],rate);
}
test('mastering contains requested genre presets and streaming',()=>{
 for(const id of ['trap','hiphop','edm','pop','streaming']){
  assert.ok(MASTER_PRESETS[id],id);
  const s=masteringSettings(MASTER_PRESETS[id]);
  assert.ok(s.target>=-20&&s.target<=-8);
 }
});
test('automatic recommendations inspect signal and return bounded, finite controls',()=>{
 const source=music(1),before=source.getChannelData(0).slice();
 const first=recommendMasteringSettings(source,'trap'),second=recommendMasteringSettings(source,'streaming');
 for(const result of [first,second]){
  assert.ok(Number.isFinite(result.before.integratedLufs));
  assert.ok(Number.isFinite(result.analysis.crestDb));
  assert.ok(result.settings.bassEq>=-3&&result.settings.bassEq<=3);
  assert.ok(result.settings.trebleEq>=-3&&result.settings.trebleEq<=3);
  assert.ok(result.settings.width>=.65&&result.settings.width<=1.35);
 }
 assert.notEqual(first.settings.target,second.settings.target);
 assert.deepEqual(source.getChannelData(0),before);
});
test('auto mastering respects duration and conservative approximate peak ceiling',()=>{
 const source=music(1,32000,.14),params=recommendMasteringSettings(source,'hiphop').settings;
 const output=renderMasteringAudio(source,params);
 assert.equal(output.buffer.length,source.length);
 assert.equal(output.buffer.numberOfChannels,2);
 assert.ok(output.after.truePeakEstimateDb<=params.ceiling+.04);
 assert.ok(Number.isFinite(output.after.integratedLufs));
 assert.ok(output.processing.maxLimiterDb>=0);
 assert.ok(output.processing.maxCompressionDb>=0);
});
test('mono material stays mono and silent audio is rejected',()=>{
 const output=renderMasteringAudio(music(.6,32000,.1,false),recommendMasteringSettings(music(.6,32000,.1,false),'pop').settings);
 assert.equal(output.buffer.numberOfChannels,1);
 assert.throws(()=>recommendMasteringSettings(fromChannels([new Float32Array(32000)],32000),'trap'),/silent/);
});
test('mastering uses worker, supports level-matched A/B and manual controls',()=>{
 const ui=readFileSync(new URL('../source/modules/mastering-ui.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../source/modules/mastering-worker.mjs',import.meta.url),'utf8');
 assert.match(ui,/data-master-auto/);
 assert.match(ui,/data-master-match/);
 assert.match(ui,/Math.pow\(10,\(quieter-level\)\/20\)/);
 assert.match(ui,/runMasteringWorker\('render'/);
 assert.match(worker,/renderMasteringAudio\(audio,settings\)/);
});
