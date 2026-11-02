import test from 'node:test';
import assert from 'node:assert/strict';
import {TapTempoEngine,tapTempoModule} from '../source/modules/tap-tempo.mjs';
test('Tap Tempo belongs in ANALYZE',()=>{assert.equal(tapTempoModule.category,'analyze');assert.equal(tapTempoModule.label,'Tap Tempo');});
test('four evenly spaced beats produce 120 BPM',()=>{const e=new TapTempoEngine();for(const t of [1000,1500,2000,2500])e.tap(t);assert.equal(e.state().bpm,120);assert.equal(e.state().count,4);});
test('single taps do not produce an estimate',()=>{const e=new TapTempoEngine();e.tap(1000);e.tap(1500);assert.equal(e.state().bpm,null);assert.equal(e.state().remaining,2);});
test('long pauses reset and consecutive double click is ignored',()=>{const e=new TapTempoEngine();[1000,1500,2000,2500].forEach(t=>e.tap(t));e.tap(2520);assert.equal(e.state().count,4);e.tap(7000);assert.equal(e.state().count,1);assert.equal(e.state().bpm,null);});
test('Reset returns empty state',()=>{const e=new TapTempoEngine();[1000,1500,2000,2500].forEach(t=>e.tap(t));assert.equal(e.reset().count,0);assert.equal(e.state().bpm,null);});
