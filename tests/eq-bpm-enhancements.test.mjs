import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEqBands} from '../source/dsp/eq-band-modes.mjs';
import {makeNamedEqPreset} from '../source/dsp/eq-presets.mjs';
import {AdvancedAudioEqualizer} from '../source/dsp/parametric-eq.mjs';
import {AIBPMDetector} from '../source/dsp/bpm-peak-detector.mjs';
import {analyzeTempo} from '../source/analyzer.mjs';

test('5-band layout keeps the exact supplied bands and Q',()=>{
  assert.deepEqual(makeEqBands(5).map(({id,type,frequency,q})=>[id,type,frequency,q]),[
    ['sub','lowshelf',60,1],['bass','peaking',230,1.2],['mid','peaking',1000,1.5],
    ['highMid','peaking',4000,1.2],['brilliance','highshelf',12000,1]]);
});
test('all new five-band presets preserve supplied gain values',()=>{
  for(const [name,gains] of Object.entries({
    warm_vocals:[-3,1,3,4,2],punchy_drums:[5,3,-2,2,4],
    electronic_master:[4,2,-1,3,5],podcast_voice:[-6,2,2,3,1]})){
    assert.deepEqual(makeNamedEqPreset(name,5).map(b=>b.gain),gains);
    assert.equal(makeNamedEqPreset(name,20).length,20);
  }
});
test('live five-band chain connects filters and applies gain safely',()=>{
  const nodes=[];
  const param=()=>({value:0,setValueAtTime(value){this.value=value;}});
  const node=()=>({connect(other){this.connected=other;},disconnect(){this.disconnected=true;}});
  const context={currentTime:0,sampleRate:48000,createGain:()=>({...node(),gain:param()}),
    createBiquadFilter:()=>{const filter={...node(),frequency:param(),gain:param(),Q:param(),type:'peaking'};nodes.push(filter);return filter;}};
  const eq=new AdvancedAudioEqualizer(context);
  assert.equal(nodes.length,5);
  assert.equal(eq.outputNode.gain.value,0);
  eq.applyMasteringPreset('punchy_drums');
  assert.deepEqual(nodes.map(n=>n.gain.value),[5,3,-2,2,4]);
  eq.setOutputVolume(.7);
  assert.equal(eq.outputNode.gain.value,.7);
  assert.throws(()=>eq.setBandGain('sub',20),/between/);
  eq.disconnect();
});
test('BPM peak detector handles silence and genres without inventing tempo',async()=>{
  const detector=new AIBPMDetector();
  assert.equal(detector.analyzePeaks(new Float32Array(44100),44100).bpm,null);
  await assert.rejects(detector.analyzeBPM({
    sampleRate:44100,getChannelData:()=>new Float32Array(44100)}),/NO_RHYTHM/);
  assert.match(detector.estimateGenre(128),/House/);
});
test('precision BPM analysis retains established output plus diagnostic',()=>{
  const rate=22050,bpm=120,seconds=12,signal=new Float32Array(seconds*rate);
  for(let n=0;n<seconds*2;n++){const pos=Math.round(n*rate*.5);for(let j=0;j<300;j++)signal[pos+j]=.7*Math.exp(-j/60);}
  const result=analyzeTempo(signal,rate);
  assert.ok(Math.abs(result.bpm-bpm)<1);
  assert.ok(result.peakConsistency>=0&&result.peakConsistency<=100);
  assert.equal(typeof result.genreHint,'string');
});
