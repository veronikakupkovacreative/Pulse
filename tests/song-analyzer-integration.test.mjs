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
test('Song Analyzer retains tempo analysis',()=>{
  const result=analyzeSong(beat(128),22050);
  assert.ok(Math.abs(result.bpm-128)<1.1);
  assert.equal(result.waveform.length,220);
});
test('Song Analyzer supplies key and Camelot even when rhythm is missing',()=>{
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
test('Song Analyzer rejects silence',()=>{
  assert.throws(()=>analyzeSong(new Float32Array(22050*8),22050),/SILENCE/);
});
test('Song Analyzer rejects too short audio',()=>{
  assert.throws(()=>analyzeSong(new Float32Array(22050*2),22050),/TOO_SHORT/);
});

import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
test('Song Analyzer occupies section 01 and all existing category panels are retained',()=>{
 const h=read('index.html');
 const start=h.indexOf('<section id="analyzer"');
 const tools=h.indexOf('<section class="toolkit"');
 assert.ok(start>0&&tools>start);
 const upper=h.slice(start,tools),lower=h.slice(tools);
 assert.match(upper,/01 \/ SONG ANALYZER/);
 assert.doesNotMatch(upper,/01 \/ RHYTHM ENGINE/);
 for(const id of ['song-key','song-camelot','song-tuning','song-key-confidence','song-export-json','analyze-selection','analyze-full','try-demo','play-track'])assert.ok(upper.includes('id="'+id+'"'),id);
 for(const category of ['analyze','edit','export','ai','visuals'])assert.ok(lower.includes('data-category="'+category+'"'),category);
 assert.match(lower,/class="tool-board"/);
 assert.match(h,/id="pulse-theme-toggle"/);
 assert.match(h,/src="\/song\/song-ui.mjs"/);
 assert.doesNotMatch(h,/src="\/reference-ui.mjs"/);
});
test('Song Analyzer analysis stays in Worker and shares the toolkit AudioSession',()=>{
 const ui=read('song/song-ui.mjs');
 const worker=read('song/analysis-worker.mjs');
 const logic=read('song/song-analyzer.mjs');
 assert.match(ui,/import \{workspace\} from '\.\.\/modules\/workspace.mjs'/);
 assert.match(ui,/await workspace.load\(file\)/);
 assert.match(ui,/workspace.subscribe/);
 assert.match(ui,/workspace.setMarkers\(markers\)/);
 assert.match(ui,/new CustomEvent\('pulse:tempo'/);
 assert.match(ui,/source\/song\/analysis-worker|new URL\('\.\/analysis-worker.mjs'/);
 assert.match(worker,/import \{analyzeSong\}/);
 assert.match(logic,/estimateTuning/);
});
test('Song Analyzer styling is scoped and does not override toolkit styles',()=>{
 const c=read('song/song-analyzer.css');
 assert.match(c,/#analyzer.pulse-song-analyzer .result-panel:has\(\.song-results:not\(\[hidden\]\)\)/);
 assert.match(c,/#analyzer.pulse-song-analyzer .selection-tools/);
 assert.match(c,/html\[data-theme="dark"\] #analyzer.pulse-song-analyzer/);
 assert.doesNotMatch(c,/^\.tool-settings\{/m);
});

test('Vercel build publishes the Song Analyzer ESM, worker and stylesheet',()=>{
 const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(build,/await cp\(join\(source,'song'\),join\(output,'song'\),\{recursive:true\}\)/);
});
