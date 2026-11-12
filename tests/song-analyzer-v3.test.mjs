import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeHarmonyFrames} from '../source/modules/harmony-analysis.mjs';
import {analyzeTempo} from '../source/modules/original-bpm.mjs';

const read=path=>readFileSync(new URL('../source/modules/'+path,import.meta.url),'utf8');
test('harmony worker rejects invalid frames and does not invent tonal confidence from silence',()=>{
 const rate=22050,size=8192,times=new Float32Array([.5,1.5,2.5,3.5]);
 const silence=new Float32Array(times.length*size);
 const output=analyzeHarmonyFrames(silence,rate,times,size);
 assert.equal(output.key,null);
 assert.deepEqual(output.chords,[]);
 assert.throws(()=>analyzeHarmonyFrames(silence,rate,new Float32Array([0]),size),/INVALID_HARMONY_FRAMES/);
});
test('harmonic snapshot of C major triad yields bounded possible key and chord timeline',()=>{
 const rate=22050,size=8192,frames=14,signal=new Float32Array(frames*size),times=new Float32Array(frames);
 for(let f=0;f<frames;f++){
  times[f]=f+.5;
  for(let i=0;i<size;i++){
   const t=i/rate,offset=f*size+i;
   signal[offset]=.22*Math.sin(2*Math.PI*261.6256*t)+.18*Math.sin(2*Math.PI*329.6276*t)+.19*Math.sin(2*Math.PI*391.9954*t);
  }
 }
 const result=analyzeHarmonyFrames(signal,rate,times,size);
 assert.equal(result.sampledFrames,frames);
 assert.equal(result.method.includes('FFT chroma'),true);
 assert.ok(result.chords.length<=36);
 for(const item of result.chords){assert.ok(item.time>=0);assert.ok(/(maj|min)$/.test(item.label));}
 if(result.key)assert.ok(['low','medium','high'].includes(result.key.confidence));
});
test('fast music tempo is not biased toward 115 BPM',()=>{
 const rate=8000,bpm=156,duration=12,audio=new Float32Array(duration*rate);
 const period=60/bpm;
 for(let b=0;b<duration/period;b++){
  const base=Math.round((b*period+.15)*rate);
  for(let j=0;j<160&&base+j<audio.length;j++)audio[base+j]+=Math.exp(-j/23)*(.8*Math.sin(2*Math.PI*112*j/rate)+.3);
 }
 const result=analyzeTempo(audio,rate);
 assert.ok(Number.isFinite(result.bpm));
 assert.ok(Array.isArray(result.alternatives));
 assert.ok(['high','medium','low'].includes(result.confidence));
 assert.ok(Math.abs(result.bpm-bpm)<6||result.alternatives.some(x=>Math.abs(x.bpm-bpm)<6),'156 BPM should be among primary or alternate candidates');
 assert.doesNotMatch(read('original-bpm.mjs'),/Math.log\(bpm \/ 115\)/);
});
test('focused Song Analyzer shares tempo and harmony worker, provides candidates and PULSE design',()=>{
 const ui=read('focused-tools.mjs'),css=read('focused-tools.css');
 assert.match(ui,/analyzeHarmonyInWorker/);
 assert.match(ui,/analyzeRhythmInWorker/);
 assert.match(ui,/buildBeatGrid/);
 assert.match(ui,/data-focus-candidates/);
 assert.match(ui,/data-focus-tempo="half"/);
 assert.match(ui,/data-focus-tempo="double"/);
 assert.match(css,/\.focus-song-summary/);
 assert.match(css,/\.focus-song-main/);
 assert.match(css,/#ff2b20/);
 assert.doesNotMatch(ui,/detectKeyAndChords\(source\)/);
});
