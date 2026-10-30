import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=name=>readFile(new URL('../source/'+name,import.meta.url),'utf8');
const tools=['converter','key','cutter','reverse','trim','calculator','pitch','tuner','slicer','normalizer','equalizer','denoise','mix','master'];
test('All 14 toolkit tabs have a matching individual description and exactly three how-to steps',async()=>{
  const html=await source('index.html');
  for(const key of tools){
    const section=html.match(new RegExp('<section class="pulse-feature-explainer" id="pulse-feature-'+key+'"[\\s\\S]*?<\\/section>'))?.[0];
    assert.ok(section,'missing '+key+' content');
    assert.match(section,new RegExp('data-feature="'+key+'"'));
    assert.equal([...section.matchAll(/<li>/g)].length,3,key);
    assert.match(section,/How to use:/);
    assert.match(section,/<h3/);
  }
  assert.equal([...html.matchAll(/class="pulse-feature-explainer" id="pulse-feature-/g)].length,14);
});
test('BPM copy and introduction include all supplied supported formats',async()=>{
  const html=await source('index.html');
  assert.match(html,/WHAT IT IS/);
  assert.match(html,/Input and output formats/);
  assert.match(html,/audio and video formats/);
  assert.match(html,/id="pulse-feature-bpm"/);
  for(const format of ['MP3','WAV','M4A','FLAC'])assert.ok(html.includes('<span>'+format+'</span>'));
  assert.doesNotMatch(html,/<span>FLA<\/span>/);
});
test('Tab switches explanatory copy and leaves the BPM description visible',async()=>{
  const js=await source('tools.mjs'),css=await source('style.css');
  assert.match(js,/querySelectorAll\('\.pulse-feature-explainer\[data-feature\]'\)/);
  assert.match(js,/section\.hidden=section\.dataset\.feature!==which/);
  assert.match(css,/\.pulse-feature-layout\s*\{\s*display: grid/);
  assert.match(css,/@media\(max-width:650px\)/);
});
