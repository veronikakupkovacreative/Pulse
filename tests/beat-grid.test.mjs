import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateBeatOffset,gridLines} from '../source/beat-grid.mjs';
import {analyzeSong} from '../source/song-analyzer.mjs';

function transientTrack(bpm=120, offset=.16, seconds=12, sampleRate=22050){
  const data=new Float32Array(Math.round(sampleRate*seconds));
  const step=60/bpm;
  for(let t=offset;t<seconds;t+=step){
    const start=Math.floor(t*sampleRate);
    for(let j=0;j<Math.floor(sampleRate*.06)&&start+j<data.length;j++){
      data[start+j]+=.8*Math.sin(2*Math.PI*100*j/sampleRate)*Math.exp(-j/(sampleRate*.012));
    }
  }
  return data;
}

test('Beat-grid phase follows first transient rather than assuming time zero',()=>{
  const samples=transientTrack(120,.16);
  const offset=estimateBeatOffset(samples,22050,120);
  assert.ok(offset!==null, 'must estimate a phase');
  assert.ok(Math.abs(offset-.16)<.04,'expected near 160ms; got '+offset);
  const grid=gridLines(12,120,offset);
  assert.ok(grid.length>20);
  assert.ok(Math.abs(grid[0]-.16)<.04);
});

test('Beat-grid safely rejects missing rhythm/invalid requests',()=>{
  assert.equal(estimateBeatOffset(new Float32Array(22050*10),22050,120),null);
  assert.deepEqual(gridLines(12,null,0),[]);
  assert.deepEqual(gridLines(0,120,0),[]);
});

test('Full Song Analyzer exposes an aligned estimated beat-grid offset',()=>{
  const result=analyzeSong(transientTrack(128,.2,18),22050);
  assert.ok(Math.abs(result.bpm-128)<1.1,'tempo '+result.bpm);
  assert.ok(result.beatOffset!==null,'should align beats');
  assert.ok(result.beatOffset>=0);
});

test('Selected audio segment can be analyzed independently',()=>{
  const sr=22050,track=transientTrack(120,.1,24,sr);
  const start=8,end=18;
  const selection=track.slice(Math.floor(start*sr),Math.floor(end*sr));
  const result=analyzeSong(selection,sr);
  assert.ok(Math.abs(result.bpm-120)<1.1);
  assert.ok(result.beatOffset+start>=start);
});
