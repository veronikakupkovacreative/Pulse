import test from 'node:test';
import assert from 'node:assert/strict';
import {biquadMagnitudeDb,peakingBiquad,eqResponseCurve} from '../source/dsp/eq-response.mjs';
import {compareReference,monitoringGainDb} from '../source/dsp/reference-compare.mjs';
import {processMaster} from '../source/dsp/mastering.mjs';
function renderedGain(coeff,frequency,rate=48000){
  const [b0,b1,b2,a1,a2]=coeff;
  let x1=0,x2=0,y1=0,y2=0,input=0,output=0;
  for(let i=0;i<18000;i++){
    const x=Math.sin(2*Math.PI*frequency*i/rate);
    const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
    x2=x1;x1=x;y2=y1;y1=y;
    if(i>4000){input+=x*x;output+=y*y;}
  }
  return 10*Math.log10(output/input);
}
test('analytic EQ response agrees with DSP filter simulation',()=>{
  const coeff=peakingBiquad(48000,320,-.85,.9);
  for(const hz of [50,320,1200,6000]){
    const analytic=biquadMagnitudeDb(coeff,hz,48000);
    const simulated=renderedGain(coeff,hz);
    assert.ok(Math.abs(analytic-simulated)<.06,`at ${hz} Hz: ${analytic} vs ${simulated}`);
  }
  assert.ok(Math.abs(biquadMagnitudeDb(coeff,320,48000)+.85)<.015);
});
test('flat EQ has exactly zero dB and bypassed mastering remains flat',()=>{
  const flat=[1,0,0,0,0];
  assert.ok(eqResponseCurve([flat],48000).every(point=>point.db===0));
  const samples=Float32Array.from({length:48000},(_,i)=>.2*Math.sin(2*Math.PI*440*i/48000));
  const out=processMaster([samples],48000,{eqMode:'off'});
  assert.ok(out.eqCurve.every(p=>Math.abs(p.db)<.001));
  assert.equal(out.settings.lowDb,0);
  assert.equal(out.settings.highDb,0);
  assert.equal(out.settings.midDb,0);
});
test('compressor dynamics modes change attack and release without violating ceiling',()=>{
  const src=Float32Array.from({length:48000},(_,i)=>.2*Math.sin(2*Math.PI*220*i/48000));
  const a=processMaster([src],48000,{dynamicsMode:'preserve'});
  const b=processMaster([src],48000,{dynamicsMode:'control'});
  assert.equal(a.settings.attackMs,30);
  assert.equal(b.settings.attackMs,5);
  assert.ok(a.settings.releaseMs>b.settings.releaseMs);
  assert.ok(a.after.truePeakDb<=-.95 && b.after.truePeakDb<=-.95);
});
test('reference comparison reports measured deltas without automatic EQ',()=>{
 const source={lufs:-11,truePeakDb:-1,crestDb:8,correlation:.9,
   spectrum:[{id:'bass',label:'BASS',share:.20}]};
 const ref={lufs:-14,truePeakDb:-2,crestDb:10,correlation:.7,
   spectrum:[{id:'bass',label:'BASS',share:.10}]};
 const diff=compareReference(source,ref);
 assert.equal(diff.lufsDelta,3);assert.equal(diff.crestDelta,-2);
 assert.ok(Math.abs(diff.bands[0].relativeDeltaDb-3.01)<.01);
 assert.equal(monitoringGainDb(source,[ref]),-3);
 assert.equal(monitoringGainDb(ref,[source]),0);
 assert.equal(monitoringGainDb({...source,peakDb:1},[ref]),-3);
});
