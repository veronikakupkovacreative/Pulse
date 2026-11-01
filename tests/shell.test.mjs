import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/index.mjs';
const read=(name)=>readFileSync(new URL('../source/'+name,import.meta.url),'utf8');
const html=read('index.html');
const app=read('app.mjs');
test('four toolkit categories remain',()=>{
  for(const category of ['analyze','edit','export','ai']){
    assert.ok(html.includes('data-category="'+category+'"'));
    assert.ok(app.includes(category+':{name:'));
  }
  assert.equal((html.match(/data-category="/g)||[]).length,4);
});
test('old tools, audio upload and DSP are absent',()=>{
  assert.deepEqual(toolModules,[]);
  for(const removed of ['id="file-input"','id="play-track"','id="eq-preview"',
    'id="master-preview"','id="mix-separate"','id="bpm-number"','id="conv-export"']){
    assert.equal(html.includes(removed),false,removed);
  }
  for(const legacy of ['AudioContext','OfflineAudioContext','decodeAudioData','createBiquadFilter']){
    assert.equal(app.includes(legacy),false,legacy);
  }
});
test('module mount points and navigation exist',()=>{
  for(const id of ['tool-panel','tool-tabs','blank-panel']){
    assert.ok(html.includes('id="'+id+'"'));
  }
  assert.ok(app.includes('import {toolModules}'));
  assert.ok(app.includes("activateCategory('analyze')"));
  assert.ok(app.includes('definition.mount'));
});
