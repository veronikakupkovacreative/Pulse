import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fftPosition,paintEqFft,createEqFftMonitor,EQ_FFT_SIZE} from '../source/modules/eq-fft.mjs';

const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');

test('FFT uses the exact logarithmic EQ graph frequency axis',()=>{
  assert.equal(fftPosition(20),36);
  assert.equal(fftPosition(20000),612);
  assert.ok(Math.abs(fftPosition(Math.sqrt(20*20000))-324)<1e-6);
  assert.equal(fftPosition(10),null);
  assert.equal(fftPosition(25000),null);
  assert.equal(EQ_FFT_SIZE,8192);
});

test('FFT does not generate spectrum lines without active analyser',()=>{
  let strokes=0;
  const canvas={width:640,height:232,getContext:()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;},closePath(){},fill(){}})};
  assert.equal(paintEqFft(canvas,null,48000),false);
  const values=new Float32Array(EQ_FFT_SIZE/2).fill(-45);
  const analyser={frequencyBinCount:values.length,fftSize:EQ_FFT_SIZE,getFloatFrequencyData(x){x.set(values);}};
  assert.equal(paintEqFft(canvas,analyser,48000),true);
  assert.equal(strokes,1);
});

test('post-EQ monitoring uses the same actual filter specs and silent output without altering dry playback',()=>{
  const made=[],calls=[];
  function node(kind){
    const n={kind,connect(x){calls.push(['connect',this.kind,x.kind||'destination']);return x;},disconnect(x){calls.push(['disconnect',this.kind,x?.kind||'all']);},type:'',frequency:{value:0},Q:{value:0},gain:{value:0}};
    made.push(n);return n;
  }
  const context={sampleRate:48000,destination:{kind:'destination'},createBiquadFilter:()=>node('filter'),createAnalyser:()=>({...node('analyser'),frequencyBinCount:4096,fftSize:0}),createGain:()=>node('sink')};
  const source={context,connect(x){calls.push(['connect','source',x.kind]);},disconnect(x){calls.push(['disconnect','source',x?.kind]);}};
  const canvas={width:640,height:232,getContext:()=>({clearRect(){}})};
  const beforeRAF=globalThis.requestAnimationFrame,beforeCancel=globalThis.cancelAnimationFrame;
  let sequence=0;globalThis.requestAnimationFrame=()=>++sequence;globalThis.cancelAnimationFrame=()=>{};
  let count=3,gains=[2,-1,4],state='';
  try{
    const monitor=createEqFftMonitor({canvas,getCount:()=>count,getGains:()=>gains,onState:x=>{state=x;}});
    monitor.setEnabled(true,source);
    assert.equal(state,'live');
    const filters=made.filter(x=>x.kind==='filter');
    assert.equal(filters.length,3);
    assert.deepEqual(filters.map(x=>x.gain.value),gains);
    assert.deepEqual(filters.map(x=>x.type),['lowshelf','peaking','highshelf']);
    assert.ok(calls.some(x=>x[0]==='connect'&&x[1]==='analyser'&&x[2]==='sink'));
    assert.ok(calls.some(x=>x[0]==='connect'&&x[1]==='sink'&&x[2]==='destination'));
    assert.ok(!calls.some(x=>x[0]==='connect'&&x[1]==='source'&&x[2]==='destination'));
    gains=[-3,0,5];monitor.sync();
    assert.deepEqual(filters.map(x=>x.gain.value),gains);
    count=5;gains=[1,2,3,4,5];monitor.sync();
    assert.equal(made.filter(x=>x.kind==='filter').length,8);
    monitor.setEnabled(false,source);
    assert.equal(state,'off');
    assert.ok(calls.some(x=>x[0]==='disconnect'&&x[1]==='source'&&x[2]==='filter'));
    monitor.cleanup();
  }finally{
    if(beforeRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=beforeRAF;
    if(beforeCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=beforeCancel;
  }
});

test('the FFT graph is layered between red source waveform and white EQ handles in both tools',()=>{
  const graph=read('modules/eq-response.mjs');
  const css=read('modules/eq-ui.css');
  assert.match(graph,/class="pulse-eq-underlay"/);
  assert.match(graph,/class="pulse-eq-fft"/);
  assert.match(graph,/class="pulse-eq-fft-toggle"/);
  assert.match(graph,/Live FFT spectrum/);
  assert.match(graph,/createEqFftMonitor/);
  assert.match(graph,/pulse:audio-source/);
  assert.match(graph,/spectrum\\.cleanup\\(\\)/);
  assert.match(css,/\\.pulse-eq-live \\.pulse-eq-fft\\{position:absolute/);
  assert.match(css,/\\.pulse-eq-live \\.pulse-eq-underlay\\{position:absolute/);
  assert.match(css,/\\.pulse-eq-live \\.pulse-eq-graph\\{position:relative;z-index:2/);
});
