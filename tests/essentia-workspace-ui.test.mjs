import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {songAnalyzerModule} from '../source/modules/focused-tools.mjs';
import {workspace} from '../source/modules/workspace.mjs';
import {fromChannels} from '../source/modules/dsp.mjs';

test('Essentia UI feeds real tick timestamps into the single shared waveform without changing its audio',async()=>{
 const prevWorker=globalThis.Worker,prevDocument=globalThis.document,prevCustomEvent=globalThis.CustomEvent;
 const previous={buffer:workspace.buffer,markers:workspace.markers,selection:workspace.selection};
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 const realTimes=[1.09,1.518,1.948,2.373,2.804,3.233];
 const rhythm={bpm:140,confidence:'high',tempoStability:91,
  method:'Essentia.js RhythmExtractor2013 / WASM',measuredBeatTimes:true,
  beatTimes:realTimes,analysisWindow:{offset:0,duration:12},alternatives:[],
  offset:1.09};
 class FakeWorker{
  constructor(url){assert.match(String(url),/\/vendor\/essentia\/essentia-worker\.mjs$/);}
  postMessage(data){
   const result=data.mode==='rhythm'?rhythm:{
    key:{name:'C major',camelot:'8B',confidence:'high',
     alternatives:[{name:'A minor',camelot:'8A'}]},
    chords:[{time:1.09,end:2.373,label:'C maj',confidence:88}],
    sampledFrames:90,method:'Essentia.js KeyExtractor + HPCP + ChordsDetectionBeats'
   };
   queueMicrotask(()=>this.onmessage?.({data:{type:'done',id:data.id,result}}));
  }
  terminate(){}
 }
 globalThis.document=document;globalThis.Worker=FakeWorker;
 // Node 24 CustomEvent is not compatible with linkedom's dispatchEvent implementation.
 globalThis.CustomEvent=undefined;
 const original=fromChannels([new Float32Array(12*44100)],44100);
 workspace.buffer=original;workspace.markers=[];workspace.selection=null;
 let cleanup;
 try{
  const host=document.getElementById('host');
  cleanup=songAnalyzerModule.mount({host});
  assert.equal(host.querySelector('[data-focus-engine="essentia"]').getAttribute('aria-pressed'),'true');
  host.querySelector('[data-focus-action="analyze"]').click();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(workspace.markers,realTimes);
  assert.equal(workspace.buffer,original);
  assert.equal(host.querySelector('[data-focus="bpm"]').textContent,'140.0');
  assert.equal(host.querySelector('[data-focus="camelot"]').textContent,'8B');
  assert.equal(host.querySelector('[data-focus="key"]').textContent,'C major');
  assert.match(host.querySelector('[data-focus-alt-keys]').textContent,/A minor/);
  assert.match(host.querySelector('[data-focus-chords]').textContent,/C maj/);
  assert.match(host.querySelector('[data-focus="coverage"]').textContent,/MEASURED BEAT TICKS/);
  host.querySelector('[data-focus-tempo="half"]').click();
  assert.deepEqual(workspace.markers,realTimes.filter((_,i)=>i%2===0));
  host.querySelector('[data-focus-engine="legacy"]').click();
  assert.deepEqual(workspace.markers,[]);
  assert.equal(host.querySelector('[data-focus="bpm"]').textContent,'—');
  assert.equal(host.querySelector('[data-focus-engine="legacy"]').getAttribute('aria-pressed'),'true');
 }finally{
  cleanup?.();
  workspace.buffer=previous.buffer;workspace.markers=previous.markers;workspace.selection=previous.selection;
  if(prevWorker===undefined)delete globalThis.Worker;else globalThis.Worker=prevWorker;
  if(prevDocument===undefined)delete globalThis.document;else globalThis.document=prevDocument;
  if(prevCustomEvent===undefined)delete globalThis.CustomEvent;else globalThis.CustomEvent=prevCustomEvent;
 }
});
