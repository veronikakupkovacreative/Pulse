import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {viewportRange,viewportTime,viewportPercent,snapBeat} from '../source/playhead.mjs';

test('waveform zoom maps visible pixels to source time without changing duration',()=>{
  assert.deepEqual(viewportRange(16,2,3),{start:3,end:11,span:8});
  assert.deepEqual(viewportRange(16,8,99),{start:14,end:16,span:2});
  assert.deepEqual(viewportRange(0,8,1),{start:0,end:0,span:0});
  assert.equal(viewportTime(150,100,200,16,2,3),5);
  assert.equal(viewportTime(-999,100,200,16,2,3),0);
  assert.equal(viewportTime(999,100,200,16,2,3),16);
  assert.equal(viewportPercent(5,16,2,3),25);
});

test('beat snap uses file-relative grid and preserves raw position for invalid tempo',()=>{
  assert.equal(snapBeat(.49,120,10),.5);
  assert.equal(snapBeat(.66,120,10),.5);
  assert.equal(snapBeat(1.01,120,10),1);
  assert.equal(snapBeat(.49,0,10),.49);
  assert.equal(snapBeat(99,120,10),10);
});

test('bundled interface has loop boundaries, zoom and accessible toggles',()=>{
  const html=readFileSync(new URL('../private/studio.html',import.meta.url),'utf8');
  for(const id of ['wave-loop','wave-snap','wave-mark-in','wave-mark-out','wave-pan-left','wave-pan-right','wave-zoom-in','wave-zoom-out','wave-zoom-label','wave-loop-info']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/function viewportRange\(/);
  assert.match(html,/function markLoop\(/);
  assert.match(html,/function setZoom\(/);
  assert.match(html,/PULSE 3\.3/);
});
