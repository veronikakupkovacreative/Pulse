import test from 'node:test';
import assert from 'node:assert/strict';
import {beatAtOrAfter,beatTimeline} from '../source/metronome-clock.mjs';
test('120 BPM produces exact half-second clicks',()=>{
 const beats=beatTimeline(0,120,0,4,12);
 for(let i=0;i<12;i++)assert.ok(Math.abs(beats[i].seconds-i*.5)<1e-10);
 assert.deepEqual(beats.map(b=>b.accent),[true,false,false,false,true,false,false,false,true,false,false,false]);
});
for(const meter of [3,4,5,6])test('meter '+meter+' accents one beat per bar',()=>{
 const beats=beatTimeline(0,120,0,meter,meter*3);
 assert.deepEqual(beats.filter(x=>x.accent).map(x=>x.index),[0,meter,2*meter]);
});
test('seeking and first-beat phase offset keep accent correct',()=>{
 const beat=beatAtOrAfter(3.67,120,.17,3);
 assert.ok(Math.abs(beat.seconds-3.67)<1e-10);
 assert.equal(beat.index,7);assert.equal(beat.beatInBar,1);assert.equal(beat.accent,false);
 assert.equal(beatAtOrAfter(.17,120,.17,4).accent,true);
});
