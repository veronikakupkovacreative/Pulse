import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {
 ESSENTIA_VERSION,camelotCode,bpmCandidates,cleanMeasuredBeats,
 rhythmResultFromWasm,mergeBeatChordEvents,
 analyzeEssentiaRhythm,analyzeEssentiaHarmony
} from '../source/modules/essentia-algorithms.mjs';
import {pickEssentiaWindow} from '../source/modules/essentia-client.mjs';
import {buildAnalyzerBeatGrid} from '../source/modules/beat-detector.mjs';
const require=createRequire(import.meta.url);
const {EssentiaWASM,Essentia}=require('essentia.js');
const essentia=new Essentia(EssentiaWASM);
const sampleRate=44100;
function clicks(bpm,seconds=20){
 const samples=new Float32Array(Math.floor(seconds*sampleRate));
 for(let beat=0;beat<seconds*bpm/60;beat++){
  const start=Math.floor((beat*60/bpm+.19)*sampleRate);
  for(let i=0;i<200&&start+i<samples.length;i++){
   if(start+i>=0)samples[start+i]+=.6*Math.exp(-i/35)*(Math.sin(2*Math.PI*100*i/sampleRate)+.15);
  }
 }
 return samples;
}
function chord(rootHz,seconds=12){
 const samples=new Float32Array(Math.floor(seconds*sampleRate));
 const notes=[rootHz,rootHz*1.25992105,rootHz*1.4983071];
 for(let i=0;i<samples.length;i++){
  const t=i/sampleRate;
  for(const hz of notes)samples[i]+=.07*Math.sin(2*Math.PI*hz*t);
 }
 return samples;
}
test('Essentia pinned package has AGPL license and required production algorithms',()=>{
 assert.equal(ESSENTIA_VERSION,'0.1.3');
 assert.equal(require('essentia.js/package.json').license,'AGPL-3.0');
 assert.equal(typeof essentia.RhythmExtractor2013,'function');
 assert.equal(typeof essentia.KeyExtractor,'function');
 assert.equal(typeof essentia.HPCP,'function');
 assert.equal(typeof essentia.ChordsDetectionBeats,'function');
 const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(build,/essentia-wasm.web.wasm/);
 assert.match(build,/essentia.js-core.umd.js/);
 assert.match(build,/LICENSE\.txt/);
});
for(const target of [70,140,80,160]){
 test('real Essentia WASM identifies '+target+' BPM and returns measured beat ticks',()=>{
  const result=analyzeEssentiaRhythm(essentia,[clicks(target)],sampleRate,8);
  assert.ok(Math.abs(result.bpm-target)<3,String(target)+' -> '+String(result.bpm)+' BPM');
  assert.equal(result.method,'Essentia.js RhythmExtractor2013 / WASM');
  assert.equal(result.measuredBeatTimes,true);
  assert.ok(result.beatTimes.length>10);
  assert.ok(result.beatTimes[0]>=8,'Ticks shifted into the shared waveform');
  assert.ok(result.beatTimes.every((time,i,array)=>i===0||time>array[i-1]));
  assert.ok(['low','medium','high'].includes(result.confidence));
  assert.ok(result.tempoStability>=0&&result.tempoStability<=100);
 });
}
test('literal measured tick arrays are reused, and half/double are tick-relative',()=>{
 const result=rhythmResultFromWasm({bpm:140,confidence:3.3,
  ticks:[.17,.6,1.03,1.48,1.91],estimates:[139,140,141]},{offset:20,duration:5});
 assert.deepEqual(buildAnalyzerBeatGrid(result,140,30),result.beatTimes);
 const half=buildAnalyzerBeatGrid(result,70,30);
 assert.deepEqual(half,result.beatTimes.filter((_,i)=>i%2===0));
 const double=buildAnalyzerBeatGrid(result,280,30);
 assert.equal(double.length,result.beatTimes.length*2-1);
 assert.ok(double.some(v=>!result.beatTimes.includes(v)),'Doubled subdivisions must be labeled interpolated');
 assert.deepEqual(buildAnalyzerBeatGrid(result,127,30),[],'Never invent a uniform Essentia beat grid');
 assert.equal(camelotCode('C','major'),'8B');
 assert.equal(camelotCode('A','minor'),'8A');
 assert.equal(camelotCode('Db','major'),'3B');
 assert.equal(camelotCode('bogus','minor'),null);
});
test('real KeyExtractor estimates C major and maps Camelot / alternative tonal profiles',()=>{
 const times=[.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11];
 const result=analyzeEssentiaHarmony(essentia,EssentiaWASM,[chord(261.6256)],sampleRate,times,0);
 assert.equal(result.key?.name,'C major');
 assert.equal(result.key?.camelot,'8B');
 assert.ok(['high','medium','low'].includes(result.key.confidence));
 assert.ok(result.sampledFrames>25);
 assert.ok(result.chords.length>0);
 assert.ok(result.chords.some(x=>x.label==='C maj'));
 assert.ok(result.chords.every(x=>x.time>=0&&x.end>x.time&&x.confidence>=0&&x.confidence<=100));
 assert.match(result.method,/HPCP \+ ChordsDetectionBeats/);
});
test('true chords are aligned to measured beat boundaries, and weak frames remain hidden',()=>{
 const frames=mergeBeatChordEvents(
  ['C','C','C','Am','Am','G','G'],[.82,.74,.68,.86,.88,.11,.9],
  [0,.5,1,1.5,2,2.5,3,3.5],10);
 assert.equal(frames[0].label,'C maj');
 assert.equal(frames[0].time,10);
 assert.equal(frames[0].end,11.5);
 assert.equal(frames[1].label,'A min');
 assert.equal(frames[1].time,11.5);
 assert.ok(!frames.some(x=>x.time===12.5&&x.label==='G maj'),'Weak single beat skipped');
 const estimates=bpmCandidates(160,[159,160,159.8,80,80.3,80.1,80,161]);
 assert.ok(estimates.some(x=>x.bpm>=79&&x.bpm<=81));
 assert.deepEqual(cleanMeasuredBeats([-.5,.1,.1,.51,9.5],3),[.1,.51]);
});
test('window selection respects explicit 90 second cap and valid user selection',()=>{
 const audio={length:44100*240,sampleRate:44100,duration:240,numberOfChannels:2};
 const win=pickEssentiaWindow(audio);
 assert.equal(win.offset,75);
 assert.equal(win.duration,90);
 assert.equal(win.selected,false);
 const chosen=pickEssentiaWindow(audio,{selection:{start:21,end:44}});
 assert.equal(chosen.offset,21);
 assert.equal(chosen.duration,23);
 assert.equal(chosen.selected,true);
 assert.throws(()=>pickEssentiaWindow({...audio,length:44100*3,duration:3}),/at least 6 seconds/);
});
test('active Song Analyzer retains its design, offers two engines, and never uploads audio',()=>{
 const read=path=>readFileSync(new URL('../source/modules/'+path,import.meta.url),'utf8');
 const ui=read('focused-tools.mjs'),worker=read('essentia-worker.mjs'),client=read('essentia-client.mjs');
 assert.match(ui,/data-focus-engine="essentia"/);
 assert.match(ui,/data-focus-engine="legacy"/);
 assert.match(ui,/analyzeEssentiaInWorker/);
 assert.match(ui,/w\.setMarkers\(beats\)/);
 assert.match(worker,/analyzeEssentiaRhythm/);
 assert.match(worker,/importScripts\('\/vendor\/essentia/);
 assert.match(worker,/analyzeEssentiaHarmony/);
 assert.match(client,/new Worker\(new URL\('\.\/essentia-worker\.mjs'/);
 assert.doesNotMatch(client,/fetch\(|upload|\/api\/|https:/);
 assert.match(read('focused-tools.css'),/\.focus-song-engine/);
});
