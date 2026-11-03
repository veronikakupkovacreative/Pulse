import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fromChannels} from '../source/modules/dsp.mjs';
import {getEqWaveformPeaks,paintEqWaveform,EQ_GRAPH_WIDTH,EQ_GRAPH_HEIGHT} from '../source/modules/eq-waveform.mjs';
import {createEqWav} from '../source/modules/eq-export.mjs';
import {toolModules} from '../source/modules/features.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('original bass PCM creates distinct red L / white R waveform peaks',()=>{
 const rate=44100,n=rate;
 const l=Float32Array.from({length:n},(_,i)=>.75*Math.sin(2*Math.PI*55*i/rate));
 const r=Float32Array.from(l,x=>x*.4);
 const b=fromChannels([l,r],rate),peaks=getEqWaveformPeaks(b,288);
 assert.equal(peaks.length,2);assert.equal(peaks[0].length,288);
 assert.ok(peaks[0].some(v=>v.low<-.6));assert.ok(peaks[0].some(v=>v.high>.6));
 assert.ok(peaks[1].some(v=>v.low<-.2));assert.ok(peaks[1].some(v=>v.high>.2));
 assert.equal(b.getChannelData(0)[123],l[123]);
});
test('empty workspace and silence do not create fake waveform graphics',()=>{
 const fills=[],canvas={width:0,height:0,getContext:()=>({clearRect(){},fillRect(...args){fills.push(args);}})};
 assert.equal(paintEqWaveform(canvas,null),false);assert.equal(fills.length,0);
 const b=fromChannels([new Float32Array(5000)],44100);
 assert.equal(paintEqWaveform(canvas,b),true);assert.equal(fills.length,0);
 assert.equal(canvas.width,EQ_GRAPH_WIDTH);assert.equal(canvas.height,EQ_GRAPH_HEIGHT);
});
test('shared graph layers real waveform beneath interactive frequency response',()=>{
 const graph=read('modules/eq-response.mjs'),css=read('modules/eq-ui.css');
 assert.match(graph,/class="pulse-eq-underlay"/);
 assert.match(graph,/paintEqWaveform\(underlay,buffer\)/);
 assert.match(graph,/waveformWatch=setInterval/);
 assert.match(graph,/clearInterval\(waveformWatch\)/);
 assert.match(css,/\.pulse-eq-live \.pulse-eq-underlay\{position:absolute/);
 assert.match(css,/\.pulse-eq-live \.pulse-eq-graph\{position:relative;z-index:1/);
});
test('both EQ modules export WAV without applying to workspace',()=>{
 const src=read('modules/features.mjs'),adv=read('modules/eq-advanced.mjs');
 assert.match(src,/\['Export EQ · WAV 24-bit','export-eq'\]/);
 assert.match(src,/if\(mode==='export-eq'\)/);
 assert.match(adv,/class="eq-advanced-export"/);
 assert.match(adv,/downloadEqWav\(output,w.name,'advanced-equalizer'\)/);
 assert.match(adv,/count=5,preset='flat'/);
 for(const id of ['equalizer','eq5'])assert.ok(toolModules.find(m=>m.id===id));
});
test('WAV export uses actual 24-bit little-endian PCM data',async()=>{
 const buffer=fromChannels([Float32Array.from([0,.25,-.25,1,-1])],44100);
 const b=createEqWav(buffer),view=new DataView(await b.arrayBuffer());
 assert.equal(b.size,44+buffer.length*3);assert.equal(view.getUint16(22,true),1);
 assert.equal(view.getUint16(34,true),24);assert.equal(view.getUint32(24,true),44100);
});
test('both tools switch genuine 3/5/10/20 band processing',()=>{
 const src=read('modules/features.mjs'),adv=read('modules/eq-advanced.mjs');
 assert.match(src,/changeCount,bandOptions:\[3,5,10,20\]/);
 assert.match(adv,/bandOptions:\[3,5,10,20\]/);
});
