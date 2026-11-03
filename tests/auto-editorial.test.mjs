import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_EDITORIAL,renderToolEditorial} from '../source/modules/tool-editorial.mjs';

const existing = ['bpm','key','beats','tap','editor','reverse','equalizer','volume','eq5','silence-trim','fade','tone','center-separate','merge-files','speed-change','sidechain','modulation','clip-pan','pitch-correction','time-stretch','wav','loop','resample','file-size','video-audio','health','master','quickfix','voice-cleaner','dynamics','enhancer','rack','mix-master','stems','normalize','ai-voice-cleaner','ai-speech-enhancer','ai-voice-cloning','visualizer','reference-matcher','room-tail-reducer','key-chords','noise-remover'];

test('every currently registered tool has individual editorial summary and steps',()=>{
  assert.deepEqual(Object.keys(TOOL_EDITORIAL).sort(),existing.sort());
  for(const id of existing){const d=TOOL_EDITORIAL[id];assert.ok(d.title[0] && d.title[1],id);assert.ok(d.summary.length>45,id);assert.equal(d.steps.length,3,id);}
  assert.equal(new Set(existing.map(id=>TOOL_EDITORIAL[id].summary)).size,existing.length);
});
test('tool description changes when mounting another module',()=>{
 const elements=new Map();
 const node=(name)=>({name,textContent:'',children:[],classList:{toggle(){}},replaceChildren(...x){this.children=x}});
 for(const id of ['#toolkit-title','#pulse-tool-summary','#pulse-tool-steps'])elements.set(id,node(id));
 const doc={querySelector:id=>elements.get(id),createElement:name=>node(name)};
 renderToolEditorial({id:'bpm',label:'BPM Analyzer'},doc);
 assert.match(elements.get('#pulse-tool-summary').textContent,/tempo/);
 renderToolEditorial({id:'ai-voice-cloning',label:'Voice Cloning'},doc);
 assert.match(elements.get('#pulse-tool-summary').textContent,/voice clone/);
 assert.deepEqual(elements.get('#pulse-tool-steps').children.map(li=>li.textContent),TOOL_EDITORIAL['ai-voice-cloning'].steps);
});
test('cloud feature copy is upfront about authorization and provider',()=>{
 assert.match(TOOL_EDITORIAL['ai-voice-cloning'].summary,/protected cloud API/);
 assert.match(TOOL_EDITORIAL['ai-voice-cleaner'].summary,/cloud neural isolation/);
});