import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/features.mjs';
import {TOOL_EDITORIAL} from '../source/modules/tool-editorial.mjs';
import {detectFundamental,frequencyNote,processPitchTime,choose808Region} from '../source/modules/808-tuner-dsp.mjs';
import {fromChannels,encodeWav} from '../source/modules/dsp.mjs';

const source=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const rate=12000;
const tone=(hz=55,seconds=2)=>Float32Array.from({length:Math.floor(rate*seconds)},(_,i)=>.65*Math.sin(2*Math.PI*hz*i/rate));
const close=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<tolerance,String(a)+' vs '+String(b)+' differs more than '+String(tolerance));

test('808 Tuner is restored in ANALYZE with old name and independent editorial copy',()=>{
 const module=toolModules.find(x=>x.id==='tuner');
 assert.equal(module?.label,'808 Tuner');
 assert.equal(module?.category,'analyze');
 assert.equal(toolModules.filter(x=>x.id==='tuner').length,1);
 assert.match(TOOL_EDITORIAL.tuner.summary,/fundamental frequency/);
 assert.equal(TOOL_EDITORIAL.tuner.steps.length,3);
 assert.match(source('index.html'),/data-open-tool="tuner"/);
});
test('original 808 YIN detector identifies a sustained 55 Hz A1 bass',()=>{
 const result=detectFundamental([tone()],rate);
 close(result.hz,55,.7);
 assert.equal(result.note.note,'A1');
 assert.ok(result.confidence>.75);
 close(frequencyNote(440).cents,0,.001);
});
test('original detector handles low bass and silences without false certainty',()=>{
 const b=detectFundamental([tone(41.203,2)],rate);
 close(b.hz,41.203,1.5);
 assert.equal(b.note.note,'E1');
 const silent=detectFundamental([new Float32Array(rate)],rate);
 assert.equal(silent.hz,null);
 assert.equal(silent.confidence,0);
 assert.throws(()=>detectFundamental([new Float32Array(200)],rate),/130 ms/);
});
test('playhead, first six seconds and waveform selection preserve original tuner analysis modes',()=>{
 const cursor=choose808Region(12,3,null,'cursor',60);
 close(cursor.from,3.06,.001);close(cursor.to,5,.001);
 const full=choose808Region(30,18,null,'full',30);
 close(full.from,.03,.001);close(full.to,6,.001);
 const loop=choose808Region(30,5,{start:10,end:13},'loop',100);
 close(loop.from,10.1,.001);close(loop.to,13,.001);
 assert.throws(()=>choose808Region(12,0,null,'loop',60),/Select/);
 assert.throws(()=>choose808Region(.19,0,null,'full',150),/minimum 130 ms/);
});
test('historical +12 semitone WSOLA renderer returns one octave higher without changing length',()=>{
 const data=tone();
 const shifted=processPitchTime([data],rate,{originalBpm:120,targetBpm:120,semitones:12,cents:0,preservePitch:true});
 assert.equal(shifted.length,1);
 assert.equal(shifted[0].length,data.length);
 close(detectFundamental(shifted,rate).hz,110,2);
 assert.equal(data[17],tone()[17]);
});
test('tuning maintains stereo lengths and can export 24-bit WAV from the current workspace contract',async()=>{
 const a=tone(55,1),b=Float32Array.from(a,x=>x*.4);
 const shifted=processPitchTime([a,b],rate,{semitones:3,cents:-9});
 assert.equal(shifted.length,2);
 assert.equal(shifted[0].length,a.length);
 assert.equal(shifted[1].length,a.length);
 assert.ok(shifted.every(ch=>ch.every(Number.isFinite)));
 const output=fromChannels(shifted,rate);
 const wav=encodeWav(output,24);
 const view=new DataView(await wav.arrayBuffer());
 assert.equal(view.getUint16(22,true),2);
 assert.equal(view.getUint32(24,true),rate);
 assert.equal(view.getUint16(34,true),24);
});
test('restored UI controls match the old project and use the PULSE red and black design',()=>{
 const ui=source('modules/808-tuner.mjs'),css=source('modules/808-tuner.css'),worker=source('modules/808-tuner-worker.mjs');
 for(const key of ['pulse808-range','pulse808-attack','pulse808-target','pulse808-semi','pulse808-fine','pulse808-note','pulse808-confidence','pulse808-stability','preview','apply','export']){
  assert.ok(ui.includes(key),key);
 }
 assert.match(ui,/new Worker\(new URL\('\.\/808-tuner-worker\.mjs'/);
 assert.match(worker,/detectFundamental/);
 assert.match(worker,/processPitchTime/);
 assert.match(css,/background:#191919/);
 assert.match(css,/background:transparent/);
 assert.doesNotMatch(css,/background:\s*white\b|background:\s*#fff\b/i);
});
