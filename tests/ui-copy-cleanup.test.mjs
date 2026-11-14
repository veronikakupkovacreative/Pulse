import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const uiFiles=[
 'source/modules/audo-ui.mjs',
 'source/modules/focused-tools.mjs',
 'source/modules/musicgpt-extraction.mjs',
 'source/modules/musicgpt-lyrics.mjs',
 'source/modules/musicgpt-musicai.mjs',
 'source/modules/musicgpt-voicechanger.mjs',
 'source/modules/ai-v2-copy.mjs',
 'source/modules/tool-editorial.mjs',
 'source/modules/tool-benefits.mjs',
 'source/app.mjs',
 'source/index.html'
];

test('visible tool copy has no API-key, credit or model-implementation callouts',()=>{
 const source=uiFiles.map(read).join('\n');
 for(const phrase of [
  'No API key required',
  'PULSE credits.',
  'No credentials needed',
  'not a trained neural AI model',
  'This is not trained AI stem separation',
  'not a neural model',
  'not neural AI',
  'no neural isolation',
  'MUSICGPT / V2 CLOUD',
  'AUDO CLOUD · FREE',
  'No trained stem-separation model is enabled'
 ])assert.equal(source.includes(phrase),false,'Unexpected visible copy: '+phrase);
});

test('cloud upload consent still names the receiving provider',()=>{
 const audo=read('source/modules/audo-ui.mjs');
 const extraction=read('source/modules/musicgpt-extraction.mjs');
 const lyrics=read('source/modules/musicgpt-lyrics.mjs');
 const music=read('source/modules/musicgpt-musicai.mjs');
 const voice=read('source/modules/musicgpt-voicechanger.mjs');
 const analyzer=read('source/modules/focused-tools.mjs');
 assert.match(audo,/upload the selected audio to Audo/);
 assert.match(audo,/Send the description to Audo/);
 assert.match(analyzer,/send a copy or excerpt to Audo/);
 assert.match(extraction,/sending it to MusicGPT for processing/);
 assert.match(lyrics,/send this prompt to MusicGPT/);
 assert.match(music,/send this text to MusicGPT/);
 assert.match(voice,/upload the audio to MusicGPT for conversion/);
});

test('Audo free-tier limits and no-paid-mode behavior remain unchanged',()=>{
 const ui=read('source/modules/audo-ui.mjs');
 const api=read('api/pulse-audo.js');
 assert.match(ui,/maxSeconds=12/);
 assert.match(ui,/maxSeconds:20/);
 assert.match(ui,/duration>10/);
 assert.match(api,/duration>10/);
 assert.match(api,/form\.append\('free','true'\)/);
 assert.doesNotMatch(api,/form\.append\('free','false'\)/);
 assert.match(api,/freeOnly:true/);
});
