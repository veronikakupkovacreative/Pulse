import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSong} from '../source/song/song-analyzer.mjs';
import {estimateTuning} from '../source/song/studio-audio.mjs';

function triad(cents=0,seconds=10,sampleRate=22050){
  const notes=[130.813,164.814,195.998,261.626,329.628,391.995].map(hz=>hz*2**(cents/1200));
  const samples=new Float32Array(sampleRate*seconds);
  for(let i=0;i<samples.length;i++)for(const hz of notes)samples[i]+=Math.sin(2*Math.PI*hz*i/sampleRate)/notes.length;
  return samples;
}
function beat(bpm=120,seconds=12,sampleRate=22050){
  const samples=new Float32Array(sampleRate*seconds);
  for(let n=0;n<bpm/60*seconds;n++){
    const start=Math.round(n*60/bpm*sampleRate);
    for(let i=0;i<sampleRate*.1&&start+i<samples.length;i++)samples[start+i]+=.8*Math.sin(2*Math.PI*90*i/sampleRate)*Math.exp(-i/(sampleRate*.018));
  }
  return samples;
}
test('Legacy reference analyzer retains tempo analysis',()=>{
  const result=analyzeSong(beat(128),22050);
  assert.ok(Math.abs(result.bpm-128)<1.1);
  assert.equal(result.waveform.length,220);
});
test('Legacy reference analyzer supplies key and Camelot even without rhythm',()=>{
  const result=analyzeSong(triad(),22050);
  assert.equal(result.bpm,null);
  assert.equal(result.key.primary.name,'C');
  assert.equal(result.key.primary.mode,'major');
  assert.equal(result.key.primary.camelot,'8B');
});
test('Tuning estimator approximates a known tuned chord',()=>{
  const result=estimateTuning(triad(-20),22050);
  assert.ok(result);
  assert.ok(Math.abs(result.cents+20)<3);
});
test('Legacy reference analyzer rejects silence',()=>{
  assert.throws(()=>analyzeSong(new Float32Array(22050*8),22050),/SILENCE/);
});
test('Legacy reference analyzer rejects too-short audio',()=>{
  assert.throws(()=>analyzeSong(new Float32Array(22050*2),22050),/TOO_SHORT/);
});

import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');

test('Producer Toolkits contains the sole active Song Analyzer',()=>{
 const html=read('index.html');
 assert.match(html,/id="toolkit"/);
 assert.match(html,/data-open-tool="song-analyzer"/);
 assert.match(html,/data-open-tool="song-analyzer">Song Analyzer/);
 assert.match(html,/<span id="analyzer" aria-hidden="true"><\/span>/);
 assert.doesNotMatch(html,/<section id="analyzer" class="pulse-song-analyzer"/);
 assert.doesNotMatch(html,/src="\/song\/song-ui.mjs"/);
 assert.doesNotMatch(html,/href="\/song\/song-analyzer.css"/);
 for(const category of ['analyze','create','prepare'])
  assert.ok(html.includes('data-category="'+category+'"'),category);
 assert.match(html,/class="tool-board editor__grid"/);
 assert.match(html,/id="pulse-hero-drop"/);
 assert.doesNotMatch(html,/id="pulse-theme-toggle"/);
});

test('active Song Analyzer shares Workspace and analyzes rhythm/harmony in workers',()=>{
 const code=read('modules/focused-tools.mjs');
 assert.match(code,/function mountSongAnalyzer/);
 assert.match(code,/analyzeRhythmInWorker/);
 assert.match(code,/analyzeHarmonyInWorker/);
 assert.match(code,/w\.ensureAudio\(\)/);
 assert.match(code,/w\.setMarkers\(beats\)/);
 assert.match(code,/w\.subscribe/);
 assert.match(code,/data-focus-action="copy"/);
 assert.doesNotMatch(code,/OPEN DETAILED ANALYZER/);
 assert.doesNotMatch(code,/getElementById\('analyzer'\)/);
});

test('toolkit red analyzer UI is defined by shared design system, not legacy standalone CSS',()=>{
 const css=read('modules/pulse-design-system.css');
 const html=read('index.html');
 assert.match(css,/\.focus-song-main/);
 assert.match(css,/\.focus-song-tonality/);
 assert.match(css,/\.tool-settings/);
 assert.doesNotMatch(html,/href="\/song\/song-analyzer.css"/);
 assert.doesNotMatch(html,/src="\/song\/song-ui.mjs"/);
});

test('build ships the active rhythm and harmony worker modules',()=>{
 const source=read('modules/focused-tools.mjs');
 const script=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(script,/readdir\(join\(source,'modules'\)\)/);
 assert.match(source,/rhythm-client\.mjs/);
 assert.match(source,/harmony-client\.mjs/);
 assert.match(read('modules/rhythm-worker.mjs'),/onmessage/);
 assert.match(read('modules/harmony-worker.mjs'),/onmessage/);
});
