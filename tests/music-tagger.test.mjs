import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseTaggingWindow,musicTaggerModule} from '../source/modules/music-tagger.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Music Tagger is registered in ANALYSIS without replacing Song Analyzer',()=>{
 const index=read('source/modules/index.mjs'),ui=read('source/index.html');
 assert.match(index,/songAnalyzerModule,musicTaggerModule,audioEditorModule/);
 assert.match(ui,/data-open-tool="music-tagger"/);
 assert.equal(musicTaggerModule.category,'analyze');
 assert.equal(typeof musicTaggerModule.mount,'function');
 assert.match(read('source/modules/focused-tools.mjs'),/analyzeHarmonyInWorker/);
 assert.doesNotMatch(read('source/modules/focused-tools.mjs'),/essentia-client|ESSENTIA WASM/);
});
test('window respects a valid user selection and the sixty-second limit',()=>{
 assert.deepEqual(chooseTaggingWindow(20,null),{start:0,end:20});
 assert.deepEqual(chooseTaggingWindow(120,{start:15,end:25}),{start:15,end:25});
 assert.deepEqual(chooseTaggingWindow(120,null),{start:30,end:90});
 assert.throws(()=>chooseTaggingWindow(1,null),/At least two seconds/);
});
test('Music Tagger distinguishes DSP from AI and uploads only after consent',()=>{
 const code=read('source/modules/music-tagger.mjs');
 assert.match(code,/new Worker\('\/modules\/music-tagger-worker.mjs',\{type:'module'\}\)/);
 assert.match(code,/data-tag-consent/);
 assert.match(code,/data-tag-action="cloud-start"/);
 assert.match(code,/data-tag-action="local"/);
 assert.match(code,/data-tag-action="download"/);
 assert.match(code,/fetch\('\/api\/pulse-tags'/);
 assert.doesNotMatch(code,/essentia/);
 const worker=read('source/modules/music-tagger-worker.mjs');
 assert.match(worker,/function fft/);assert.match(worker,/spectralCentroidHz/);
 assert.match(worker,/frequencyBalance/);assert.match(worker,/stereoCorrelation/);
});
test('Vercel server uses documented Audial endpoints and no client secrets',()=>{
 const api=read('api/pulse-tags.js');
 assert.match(api,/\/functions\/run\/segmentation/);
 assert.match(api,/\/functions\/run\/audio-tags/);
 assert.match(api,/process.env.AUDIAL_API_KEY/);
 assert.match(api,/UPLOAD_CONSENT_REQUIRED/);
 assert.match(api,/OWNER_AUTH_REQUIRED/);
 assert.match(api,/STEMS_NOT_READY/);
 assert.match(read('vercel.json'),/api\/pulse-tags\.js/);
});
