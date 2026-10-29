import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loopTime} from '../source/playhead.mjs';
import {extractSegment} from '../source/studio-audio.mjs';

const almost=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
test('native loop playhead wraps precisely across repeated cycles',()=>{
  almost(loopTime(1.5,1,2,0),1.5);
  almost(loopTime(1.5,1,2,0.7),1.2);
  almost(loopTime(1.5,1,2,7.7),1.2);
  almost(loopTime(1.75,1,2,0.25),1);
  almost(loopTime(0,1,2,0.5),1.5);
  assert.equal(loopTime(3,2,2,1),3);
});

test('slicer anti-click fade changes only the exported segment, not its source',()=>{
  const rate=1000,samples=new Float32Array(100).fill(1);
  const raw=extractSegment([samples],rate,.01,.09,0)[0];
  const smooth=extractSegment([samples],rate,.01,.09,5)[0];
  assert.equal(raw.length,80);assert.equal(smooth.length,80);
  assert.equal(raw[0],1);assert.ok(smooth[0]<.25);assert.ok(smooth.at(-1)<.25);
  assert.equal(smooth[40],1);assert.equal(samples[10],1);assert.equal(samples[89],1);
});

test('bundled 3.4 controls expose manual BPM and loop audition',()=>{
  const html=readFileSync(new URL('../private/studio.html',import.meta.url),'utf8');
  for(const id of ['bpm-override','bpm-send','cut-audition','cut-loop-info','slice-fade']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/pulse:tempo-apply/);
  assert.match(html,/src\.loop=true/);
  assert.match(html,/function loopTime\(/);
});
