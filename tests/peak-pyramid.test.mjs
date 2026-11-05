import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeakState,appendPeakChunk,finishPeakPyramid,buildPeakPyramid,pickPeakLevel,samplePeakRange} from '../source/modules/peak-pyramid.mjs';
import {WaveformRenderer} from '../source/modules/waveform-renderer.mjs';

test('streaming peak bins preserve quiet/loud transients and exact extrema',()=>{
 const data=new Float32Array(1024);data[511]=.82;data[512]=-.91;data[1000]=.56;
 const state=createPeakState(data.length,{blockSize:256});
 for(let offset=0;offset<data.length;offset+=128)appendPeakChunk(state,[data.subarray(offset,offset+128)],offset);
 const levels=finishPeakPyramid(state);
 assert.ok(Math.abs(levels[0].min[2]+.91)<1e-5);assert.ok(Math.abs(levels[0].max[1]-.82)<1e-5);assert.ok(Math.abs(levels.at(-1).min[0]+.91)<1e-5);
 const [min,max]=samplePeakRange(levels[0],500,530);assert.ok(min<-.9&&max>.8);
});
test('stereo peak pyramid combines both channels',()=>{
 const left=new Float32Array(2048),right=new Float32Array(2048);right[1020]=-.72;left[1021]=.65;
 const levels=buildPeakPyramid([left,right]);
 assert.ok(levels[0].min[3]<-.7);assert.ok(levels[0].max[3]>.6);
});
test('peak level selection avoids full PCM scan at overview zoom',()=>{
 const levels=buildPeakPyramid([new Float32Array(256*1024)]);
 const wide=pickPeakLevel(levels,12000),zoom=pickPeakLevel(levels,400);
 assert.ok(wide.blockSize>zoom.blockSize);assert.ok(wide.blockSize<=12000);
});
test('renderer viewport zoom and panning stay within audio duration',()=>{
 const renderer=new WaveformRenderer();renderer.buffer={duration:60};renderer.setViewport(16,100);const v=renderer.getViewport();
 assert.equal(v.zoom,16);assert.equal(v.end,60);assert.equal(v.start,56.25);
 assert.ok(Math.abs(renderer.atFraction(.5)-58.125)<1e-8);
 renderer.setViewport(1,-12);assert.equal(renderer.getViewport().start,0);
});
