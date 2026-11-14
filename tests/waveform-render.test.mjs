import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioWorkspace,getWaveformMarkerPixels} from '../source/modules/workspace.mjs';
import {fromChannels} from '../source/modules/dsp.mjs';

test('onset markers are spaced even when the detector returns thousands',()=>{
 const markers=Array.from({length:2000},(_,i)=>i*.01);
 const pixels=getWaveformMarkerPixels(markers,20,500,8);
 assert.ok(pixels.length>0);
 assert.ok(pixels.length<=Math.ceil(500/8)+1);
 assert.ok(pixels.every((pixel,i)=>i===0||pixel-pixels[i-1]>=8));
});

test('invalid or out-of-range beat times are omitted',()=>{
 assert.deepEqual(getWaveformMarkerPixels([-2,0,.001,2,3.99,NaN,Infinity,5],4,200,5),[0,100,199]);
 assert.deepEqual(getWaveformMarkerPixels([],4,200,5),[]);
 assert.deepEqual(getWaveformMarkerPixels([1,2],0,200,5),[]);
});

test('source waveform renders detected onsets as short ticks, never full-height stripes',()=>{
 const fills=[];
 const ctx={
  fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(x,y,width,height){fills.push({color:this.fillStyle,x,y,width,height});},
  beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}
 };
 const canvas={width:0,height:0,getBoundingClientRect:()=>({width:400,height:180}),getContext:()=>ctx};
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={getElementById:id=>id==='audio-wave'?canvas:null};
 globalThis.window={devicePixelRatio:2};
 try{
  const workspace=new AudioWorkspace();
  workspace.buffer=fromChannels([Float32Array.from({length:4000},(_,i)=>Math.sin(i/7))],1000);
  workspace.markers=Array.from({length:1500},(_,i)=>i*4/1500);
  workspace.position=1;
  workspace.drawWave();
  const ticks=fills.filter(fill=>fill.color==='#f4f2ee99');
  assert.ok(ticks.length>0,'beat markers must remain visible');
  assert.ok(ticks.every(tick=>tick.y===0&&tick.height<=14&&tick.width<=2),'beat ticks must not cross the audio');
  assert.ok(ticks.length<=Math.ceil(canvas.width/12)+1,'dense markers should be visually thinned');
  assert.ok(fills.some(fill=>fill.color==='#0e0e0f'),'waveform background is retained');
 }finally{
  if(previousDocument===undefined)delete globalThis.document;
  else globalThis.document=previousDocument;
  if(previousWindow===undefined)delete globalThis.window;
  else globalThis.window=previousWindow;
 }
});
