import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fromChannels} from '../source/modules/dsp.mjs';
import {MASTER_PRESETS} from '../source/modules/mastering-engine.mjs';
import {MASTER_ASSISTANT_EXAMPLES,interpretMasteringRequest,planReferenceMastering,spectrumForBuffer} from '../source/modules/mastering-advanced.mjs';

function audio(rate=16000,seconds=.7,level=.08){
 const length=Math.round(rate*seconds);
 const a=new Float32Array(length),b=new Float32Array(length);
 for(let i=0;i<length;i++){
  const t=i/rate;
  a[i]=level*(Math.sin(t*2*Math.PI*110)*.7+Math.sin(t*2*Math.PI*440)*.25);
  b[i]=level*(Math.sin(t*2*Math.PI*110+.01)*.7+Math.sin(t*2*Math.PI*440+.02)*.25);
 }
 return fromChannels([a,b],rate);
}
test('mastering intent parser produces real, bounded DSP control changes',()=>{
 const source=MASTER_PRESETS.streaming;
 const punch=interpretMasteringRequest('More punch',source);
 assert.ok(punch.settings.attack>source.attack);
 assert.ok(punch.settings.threshold>source.threshold);
 const bass=interpretMasteringRequest('Warmer bass',source);
 assert.ok(bass.settings.bassEq>0);
 const highs=interpretMasteringRequest('Less harsh highs',source);
 assert.ok(highs.settings.trebleEq<0);
 const stereo=interpretMasteringRequest('Wider stereo',source);
 assert.ok(stereo.settings.width>1);
 const stream=interpretMasteringRequest('Streaming -14 LUFS',MASTER_PRESETS.trap);
 assert.equal(stream.settings.target,-14);
 assert.equal(stream.settings.ceiling,-1);
 assert.throws(()=>interpretMasteringRequest('unknown made-up instruction',source),/Could not map/);
 assert.equal(MASTER_ASSISTANT_EXAMPLES.length,5);
});
test('reference mastering safely compares spectrum, LUFS, dynamics and channels',()=>{
 const input=audio(16000,.75,.05),reference=audio(16000,.75,.18),copy=input.getChannelData(0).slice();
 const plan=planReferenceMastering(input,reference,MASTER_PRESETS.streaming);
 assert.ok(Number.isFinite(plan.reference.integratedLufs));
 assert.ok(Number.isFinite(plan.before.integratedLufs));
 assert.ok(plan.settings.target>=-18&&plan.settings.target<=-9);
 assert.equal(plan.corrections.length,8);
 assert.equal(plan.spectrum.bands.length,8);
 assert.equal(plan.spectrum.input.length,8);
 assert.equal(plan.spectrum.reference.length,8);
 assert.equal(spectrumForBuffer(input).length,8);
 assert.deepEqual(input.getChannelData(0),copy);
 assert.equal(plan.spectrum.master,null);
});
test('reference mastering rejects silent reference',()=>{
 const input=audio(16000,.75,.07),silent=fromChannels([new Float32Array(16000),new Float32Array(16000)],16000);
 assert.throws(()=>planReferenceMastering(input,silent,MASTER_PRESETS.streaming),/measurable/);
});
test('mastering UI includes reference, assistant, dashboard, A/B and MusicGPT cloud controller',()=>{
 const ui=readFileSync(new URL('../source/modules/mastering-ui.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../source/modules/mastering-worker.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../source/modules/ui.css',import.meta.url),'utf8');
 assert.match(ui,/data-master-engine="cloud"/);
 assert.match(ui,/mountMusicGPTMasteringCloud/);
 assert.match(ui,/data-master-reference/);
 assert.match(ui,/data-master-suggest/);
 assert.match(ui,/data-master-action="match"/);
 assert.match(ui,/data-master-ab="c"/);
 assert.match(ui,/data-master-table=/);
 assert.match(ui,/data-master-spectrum/);
 assert.match(ui,/runMasteringWorker\('reference'/);
 assert.match(worker,/planReferenceMastering/);
 assert.match(css,/\.pulse-master-dashboard/);
 assert.match(css,/\.pulse-master-band/);
 assert.match(css,/\.tool-settings \.pulse-master-analysis\{background:transparent/);
 const focusedCss=readFileSync(new URL('../source/modules/focused-tools.css',import.meta.url),'utf8');
 assert.match(focusedCss,/\.tool-settings \.focus-song-v3\{background:#111/);
 assert.doesNotMatch(focusedCss,/\.focus-song-tonality\{[^}]*#f5f4f0/);
});
