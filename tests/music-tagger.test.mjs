import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseTaggingWindow,makeCloudTaggingExcerpt,makeLocalClapSamples,musicTaggerModule} from '../source/modules/music-tagger.mjs';
import {MODEL_SAMPLE_RATE,MODEL_ID,GROUPS,sortModelTags,checkSignal,classifyAudio} from '../source/modules/music-tagger-clap-worker.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sine=(rate=48000,seconds=4,hz=440)=>Float32Array.from({length:rate*seconds},(_,i)=>.3*Math.sin(2*Math.PI*hz*i/rate));
test('Music Tagger remains in ANALYSIS and does not use Audial APIs or keys',()=>{
 const index=read('source/modules/index.mjs'),html=read('source/index.html'),ui=read('source/modules/music-tagger.mjs');
 assert.match(index,/songAnalyzerModule,musicTaggerModule,audioEditorModule/);
 assert.match(html,/data-open-tool="music-tagger"/);
 assert.equal(musicTaggerModule.category,'analyze');
 assert.equal(typeof musicTaggerModule.mount,'function');
 assert.match(read('source/modules/focused-tools.mjs'),/analyzeHarmonyInWorker/);
 assert.doesNotMatch(read('source/modules/focused-tools.mjs'),/essentia-client|ESSENTIA WASM/);
 assert.match(ui,/data-tag-action="ai-run"/);
 assert.match(ui,/music-tagger-clap-worker\.mjs/);
 assert.match(ui,/No audio upload|Your audio never leaves this device/);
 assert.doesNotMatch(ui,/Audial|\/api\/pulse-tags|owner-token|data-tag-consent|cloud-run/);
 assert.doesNotMatch(read('vercel.json'),/api\/pulse-tags/);
 assert.doesNotMatch(read('source/modules/music-tagger-clap-worker.mjs'),/fetch\(['"].*api|Audial/);
});
test('shared source selection uses a bounded interval',()=>{
 assert.deepEqual(chooseTaggingWindow(20,null),{start:0,end:20});
 assert.deepEqual(chooseTaggingWindow(120,{start:15,end:25},10),{start:15,end:25});
 assert.deepEqual(chooseTaggingWindow(120,null,10),{start:55,end:65});
 assert.throws(()=>chooseTaggingWindow(1),/at least two seconds/);
});
test('CLAP model uses real mono 48 kHz data and rejects silence',()=>{
 assert.equal(MODEL_ID,'Xenova/clap-htsat-unfused');
 assert.equal(MODEL_SAMPLE_RATE,48000);
 const waveform=sine();
 const source={sampleRate:48000,duration:4,length:waveform.length,numberOfChannels:1,getChannelData:()=>waveform};
 const check=checkSignal(waveform);
 assert.ok(check.rms>.1);
 assert.throws(()=>checkSignal(new Float32Array(48000*3)),/silent/);
 assert.throws(()=>checkSignal(Float32Array.from({length:48000*3},()=>NaN)),/Invalid waveform/);
 return makeLocalClapSamples(source).then(result=>{
  assert.equal(result.sampleRate,48000);
  assert.deepEqual(result.samples,waveform);
 });
});
test('group ranking uses actual model similarities and never generates stem labels',async()=>{
 for(const group of ['genres','moods','instruments'])assert.ok(GROUPS[group].length>=12);
 const prompt=GROUPS.genres[2][1],label=GROUPS.genres[2][0];
 assert.deepEqual(sortModelTags([{label:prompt,score:.86},{label:'unknown fake label',score:.99}], 'genres'),[{label,score:.86}]);
 const requests=[];
 const classifier=async(audio,descriptions,options)=>{
  assert.ok(audio instanceof Float32Array);
  assert.equal(options.hypothesis_template,'This is a sound of {}.');
  requests.push(descriptions);
  return descriptions.map((label,i)=>({label,score:i===2?.9:.01}));
 };
 const report=await classifyAudio(sine(),classifier);
 assert.equal(requests.length,3);
 assert.equal(report.genre[0].label,GROUPS.genres[2][0]);
 assert.equal(report.moods[0].label,GROUPS.moods[2][0]);
 assert.equal(report.instruments[0].label,GROUPS.instruments[2][0]);
 assert.equal(report.engine,'local-onnx-wasm');
 assert.match(report.disclaimer,/not calibrated|stem-level/);
 assert.equal(report.song_tags,undefined);
});
test('actual FFT worker retains local audio measurements and silence detection',async()=>{
 const old=globalThis.self;globalThis.self={postMessage(){}};
 try{
  const {analyzeAcoustics}=await import('../source/modules/music-tagger-worker.mjs');
  const result=analyzeAcoustics([sine(44100,4)],44100);
  assert.equal(result.silent,false);
  assert.ok(Math.abs(result.spectralCentroidHz-440)<60);
  assert.ok(Math.abs(result.peakDb+10.45)<1);
  assert.equal(analyzeAcoustics([new Float32Array(44100*3)],44100).silent,true);
 }finally{if(old===undefined)delete globalThis.self;else globalThis.self=old;}
});
test('separate MusicGPT voice feature still has a valid short WAV helper',()=>{
 const source={duration:24,sampleRate:48000,length:48000*24,numberOfChannels:1,
  getChannelData:()=>sine(48000,24)};
 const output=makeCloudTaggingExcerpt(source);
 const wav=Buffer.from(output.file.base64,'base64');
 assert.equal(wav.toString('ascii',0,4),'RIFF');
 assert.equal(wav.readUInt32LE(24),44100);
 assert.ok(wav.byteLength<=2500000);
});
