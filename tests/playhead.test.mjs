import test from 'node:test';
import assert from 'node:assert/strict';
import {clampPlayhead,pointerToTime,nudgePlayhead,snapBeat} from '../source/playhead.mjs';
import {readFileSync} from 'node:fs';

test('playhead maps positions within audio duration, including bounds and invalid dimensions',()=>{
  assert.equal(pointerToTime(250,100,300,12),6);
  assert.equal(pointerToTime(-30,100,300,12),0);
  assert.equal(pointerToTime(900,100,300,12),12);
  assert.equal(pointerToTime(120,100,0,12),0);
  assert.equal(pointerToTime(120,100,300,0),0);
  assert.equal(clampPlayhead(Number.NaN,10),0);
  assert.equal(clampPlayhead(4.75,10),4.75);
  assert.equal(clampPlayhead(15,10),10);
});

test('playhead keyboard nudge cannot pass clip edges',()=>{
  assert.equal(nudgePlayhead(3,10,1),4);
  assert.equal(nudgePlayhead(3,10,-5),0);
  assert.equal(nudgePlayhead(9,10,5),10);
});

test('compiled HTML exposes both accessible seeking surfaces and visual playheads',()=>{
  const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
  assert.match(html,/id="tool-playhead"/);
  assert.match(html,/id="bpm-playhead"/);
  assert.match(html,/id="tool-waveform"[^>]*role="slider"/);
  assert.match(html,/Shift\+drag/);
  const js=readFileSync(new URL('../source/tools.mjs',import.meta.url),'utf8');
  assert.match(js,/function seekTool\(time,autoplay=true,sourceTransport/);
});

test('phase-aware snapping respects a nonzero onset grid offset',()=>{
 assert.equal(snapBeat(1.18,120,10,.18),1.18);
 assert.equal(snapBeat(1.40,120,10,.18),1.18);
});
