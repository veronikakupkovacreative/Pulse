import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AudioWorkspace} from '../source/modules/workspace.mjs';
import {drawLiveWaveform} from '../source/modules/playback-waveform.mjs';
import {fromChannels} from '../source/modules/dsp.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');

function fakeCanvas(){
 const paths=[];let active=[];
 const ctx={
  fillStyle:'',strokeStyle:'',lineWidth:1,shadowColor:'',shadowBlur:0,lineJoin:'',lineCap:'',
  fillRect(){},beginPath(){active=[];},moveTo(x,y){active.push([x,y]);},lineTo(x,y){active.push([x,y]);},
  stroke(){paths.push({strokeStyle:this.strokeStyle,points:[...active]});},save(){},restore(){},
 };
 const canvas={width:0,height:180,getBoundingClientRect:()=>({width:400,height:180}),getContext:()=>ctx};
 return {canvas,ctx,paths};
}
test('live player waveform reads fresh time-domain samples and animates the actual signal',()=>{
 const {ctx,paths}=fakeCanvas(),samples=new Uint8Array(32);
 let frame=0;
 const analyser={getByteTimeDomainData(out){out.fill(128);for(let i=0;i<out.length;i++)out[i]=frame===0?128+Math.round(60*Math.sin(i/2)):128+Math.round(45*Math.cos(i/3));frame++;}};
 assert.equal(drawLiveWaveform(ctx,analyser,samples,400,180,1),true);
 assert.equal(paths.length,2);
 const first=paths[0].points.map(x=>x[1]);
 paths.length=0;
 assert.equal(drawLiveWaveform(ctx,analyser,samples,400,180,1),true);
 const second=paths[0].points.map(x=>x[1]);
 assert.notDeepEqual(first,second,'waveform must change with live analyser data');
 assert.equal(paths[0].points[0][0],0);
 assert.equal(paths[0].points.at(-1)[0],400);
});
test('missing analyser data leaves the original waveform drawing untouched',()=>{
 const {ctx,paths}=fakeCanvas();
 assert.equal(drawLiveWaveform(ctx,null,new Uint8Array(32),400,180),false);
 assert.equal(drawLiveWaveform(ctx,{getByteTimeDomainData(){throw Error('not ready')}},new Uint8Array(32),400,180),false);
 assert.equal(paths.length,0);
});
test('playback connects through an analyser and stop disconnects the visualizer cleanly',async()=>{
 const previousDocument=globalThis.document,previousRAF=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame,previousEvent=globalThis.CustomEvent;
 const events=[],connections=[],disconnections=[];
 globalThis.document={getElementById:()=>null,querySelector:()=>null,dispatchEvent:event=>events.push(event)};
 globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init?.detail}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const destination={kind:'destination'};
 const analyser={fftSize:0,smoothingTimeConstant:0,connect(node){connections.push(['analyser',node]);},disconnect(){disconnections.push('analyser');},getByteTimeDomainData(data){data.fill(128);}};
 const node={buffer:null,onended:null,connect(target){connections.push(['source',target]);},start(){},stop(){},disconnect(){disconnections.push('source');}};
 const context={state:'running',currentTime:1,destination,createBufferSource:()=>node,createAnalyser:()=>analyser};
 try{
  const workspace=new AudioWorkspace();workspace.context=context;workspace.buffer=fromChannels([new Float32Array(48000).fill(.25)],48000);
  await workspace.togglePlay();
  assert.equal(workspace.playing,true);
  assert.equal(workspace.playbackAnalyser,analyser);
  assert.equal(workspace.playbackSamples.length,1024);
  assert.deepEqual(connections[0],['source',analyser]);
  assert.deepEqual(connections[1],['analyser',destination]);
  workspace.stop();
  assert.equal(workspace.playbackAnalyser,null);
  assert.equal(workspace.playbackSamples,null);
  assert.ok(disconnections.includes('source'));
  assert.ok(disconnections.includes('analyser'));
  assert.equal(workspace.playing,false);
 }finally{
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;
  if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;
  if(previousEvent===undefined)delete globalThis.CustomEvent;else globalThis.CustomEvent=previousEvent;
 }
});
test('workspace playback path uses the live waveform on every animation frame',()=>{
 const s=read('modules/workspace.mjs');
 assert.match(s,/analyser\.fftSize=1024/);
 assert.match(s,/drawLiveWaveform\(ctx,this\.playbackAnalyser,this\.playbackSamples,w,h,dpr\)/);
 assert.match(s,/this\.playbackAnalyser\.disconnect\(\)/);
});
