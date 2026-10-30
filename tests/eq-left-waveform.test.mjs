import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderEqRegion} from '../source/dsp/eq-region.mjs';
import {EQ_DEFAULT_BANDS} from '../source/dsp/parametric-eq.mjs';
const rate=48000;
const signal=()=>Float32Array.from({length:48000},(_,i)=>.12*Math.sin(2*Math.PI*1000*i/rate));

test('selection-only EQ preserves untouched samples and original duration',()=>{
  const left=signal(),right=signal(),original=[left.slice(),right.slice()];
  const bands=EQ_DEFAULT_BANDS.map(b=>({...b}));
  bands[3].gain=6;bands[3].frequency=1000;
  const result=renderEqRegion([left,right],rate,bands,0,{from:.25,to:.75});
  assert.equal(result.length,2);
  assert.equal(result[0].length,left.length);
  assert.deepEqual([left,right],original);
  for(const ch of result)for(let i=0;i<ch.length;i++){
    if(i<12000||i>=36000)assert.equal(ch[i],left[i],'out-of-range sample modified at '+i);
  }
  let changed=0;for(let i=14000;i<34000;i++)changed+=Math.abs(result[0][i]-left[i]);
  assert.ok(changed>50,'EQ inside selected region was not applied');
  assert.ok(Math.abs(result[0][12000]-left[12000])<.003);
  assert.ok(Math.abs(result[0][35999]-left[35999])<.003);
});
test('full-track EQ operates without a selection',()=>{
  const input=signal();
  const bands=EQ_DEFAULT_BANDS.map(b=>({...b}));
  const output=renderEqRegion([input],rate,bands,-3);
  assert.equal(output[0].length,input.length);
  assert.ok(output[0].some((v,i)=>Math.abs(v-input[i])>.001));
});
test('rejects invalid or tiny waveform regions',()=>{
  const input=signal();
  for(const range of [{from:0,to:.01},{from:-.2,to:.4},{from:.9,to:1.3},{from:NaN,to:.5}]){
    assert.throws(()=>renderEqRegion([input],rate,[],0,range),/Select at least/);
  }
});
test('EQ waveform lives in black source panel, not in red settings pane',async()=>{
  const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
  const tools=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
  const extra=await readFile(new URL('../source/extra-tools.mjs',import.meta.url),'utf8');
  const black=html.indexOf('class="tool-source"'),wave=html.indexOf('id="tool-waveform"');
  const settings=html.indexOf('class="tool-settings"'),editor=html.indexOf('id="eq-wave-editor"');
  assert.ok(black>=0&&black<editor&&editor<wave&&wave<settings);
  for(const id of ['eq-select-region','eq-play-region','eq-clear-region','eq-region-in','eq-region-out','eq-range-length'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(tools,/tools\.tab==='equalizer'&&\(tools\.eqSelectMode\|\|event\.shiftKey\)/);
  assert.match(tools,/setEqSelection\(tools\.eqDragStart,slicePosition\(event\)\)/);
  assert.match(extra,/renderEqRegion\(/);
  assert.match(extra,/eqPreviewOptions/);
});
