import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolModules} from '../source/modules/features.mjs';
import {TOOL_EDITORIAL} from '../source/modules/tool-editorial.mjs';
import {conversionOptions,recommendedAudioSettings} from '../source/modules/converter.mjs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('legacy AI voice cleaner and speech enhancer remain registered, advanced visuals paused',()=>{
  const expected=[['ai-voice-cleaner','AI Voice Cleaner','ai'],['ai-speech-enhancer','Speech Enhancer','ai']];
  for(const [id,label,category] of expected){const m=toolModules.find(x=>x.id===id);assert.ok(m,id);assert.equal(m.label,label);assert.equal(m.category,category);}
 assert.ok(toolModules.some(m=>m.id==='ai-voice-cloning'));
 assert.ok(!toolModules.some(m=>m.id==='visualizer-advanced'));
});
test('every mounted tool has its own editorial copy',()=>{
  for(const tool of toolModules){const copy=TOOL_EDITORIAL[tool.id];assert.ok(copy,tool.id);assert.equal(copy.steps.length,3);}
  assert.match(read('app.mjs'),/renderToolEditorial\(definition\)/);
  assert.doesNotMatch(read('reference-ui.mjs'),/const descriptions=\{/);
});
test('AUTO uses practical audio format defaults and supports overrides',()=>{
 const mp3=conversionOptions({format:'mp3'}),aac=conversionOptions({format:'aac'}),wav=conversionOptions({format:'wav'}),ogg=conversionOptions({format:'ogg'});
 assert.deepEqual([mp3.sampleRate,mp3.bitrate,aac.bitrate,wav.bitDepth,ogg.oggQuality],[44100,320,256,24,6]);
 assert.equal(recommendedAudioSettings('wma').bitrate,192);
 assert.equal(conversionOptions({format:'mp3',sampleRate:'original'}).sampleRate,null);
 assert.equal(conversionOptions({format:'wav',sampleRate:48000,bitDepth:16}).bitDepth,16);
 assert.throws(()=>conversionOptions({format:'mp3',bitrate:'unknown'}));
});
test('all editable numeric formats expose AUTO where quality defaults are meaningful',()=>{
  const src=read('modules/features.mjs');
  for(const key of ['sampleRate','bitrate','bitDepth','oggQuality','flacLevel','bits'])assert.match(src,new RegExp("dropdown\\('"+key+"'[\\s\\S]*?AUTO"));
  assert.match(read('modules/legacy-tools.mjs'),/AUTO · MUSIC/);
  assert.match(read('modules/web-tools.mjs'),/AUTO · 320 kbps/);
  assert.match(read('modules/normalizer-tool.mjs'),/AUTO · 24-bit PCM/);
});
test('AI master does not use white input or visualizer button backgrounds',()=>{
  const src=read('modules/pulse-ai-master.mjs');
  assert.doesNotMatch(src,/background:#fff;/);
  assert.match(src,/LOCAL DSP',true/);
  assert.match(src,/\['broadcast','BROADCAST'/);
});
