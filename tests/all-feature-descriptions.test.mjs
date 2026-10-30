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
test('Hero uses one concise paragraph, keeps format tags and removes BPM how-to',async()=>{
  const html=await source('index.html');
  const about=html.split('<aside class="pulse-hero-info"')[1]?.split('</aside>')[0]||'';
  assert.match(about,/WHAT IT IS/);
  assert.match(about,/IN · OUT/);
  assert.equal((about.match(/class="pulse-hero-description"/g)||[]).length,1);
  assert.equal((about.match(/<p class="pulse-hero-description"/g)||[]).length,1);
  assert.match(about,/make changes in browser memory/);
  assert.match(about,/M4A\/AAC at 192 kbps where supported/);
  assert.doesNotMatch(about,/Input and output formats/);
  assert.doesNotMatch(html,/id="pulse-feature-bpm"/);
  assert.doesNotMatch(html,/TEMPO ANALYSIS/);
  for(const format of ['MP3','WAV','M4A','FLAC'])assert.ok(about.includes('<span>'+format+'</span>'));
  assert.doesNotMatch(about,/<span>FLA<\/span>/);
});
test('Tab switches toolkit explanatory copy without the BPM explainer',async()=>{
  const js=await source('tools.mjs'),css=await source('style.css');
  assert.match(js,/querySelectorAll\('\.pulse-feature-explainer\[data-feature\]'\)/);
  assert.match(js,/section\.hidden=section\.dataset\.feature!==which/);
  assert.match(css,/\.pulse-feature-layout\s*\{\s*display: grid/);
  assert.match(css,/@media\(max-width:650px\)/);
});
