import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {transformSync} from 'esbuild';
import {visibleToolModules} from '../source/modules/index.mjs';
import {AUDIO_FORMATS} from '../source/modules/converter.mjs';
import {initializePhaseTwo} from '../source/modules/phase-two-runtime.mjs';

const read=name=>readFileSync(new URL('../source/'+name,import.meta.url),'utf8');
const css=read('modules/phase-two-audio.css');
const index=read('modules/index.mjs');
const html=read('index.html');
const runtime=read('modules/phase-two-runtime.mjs');
const app=read('app.mjs');

test('approved identity is applied after all original tool styles, not by replacing modules',()=>{
 const base=index.indexOf("designStyle.href='/modules/pulse-design-system.css'");
 const home=index.indexOf("phaseOneStyle.href='/modules/phase-one-reference.css'");
 const audio=index.indexOf("phaseTwoStyle.href='/modules/phase-two-audio.css'");
 assert.ok(base>=0&&home>base&&audio>home,'Phase 2 must be final stylesheet');
 for(const color of ['#0e0e0f','#141416','#19191b','#2a2a2e','#f4f2ee','#bdbab1','#ff4d1c'])
  assert.ok(css.includes(color),color);
 for(const font of ['Space Grotesk','Inter','JetBrains Mono'])assert.ok(css.includes(font),font);
 assert.match(css,/#pulse-legacy-workspace\[data-active-tool="editor"\]/);
 assert.match(css, /@media\(max-width:650px\)/);
 assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
 assert.ok(!css.includes('display:none!important}.focus-editor-modes'),'Editor modes cannot be hidden');
});

test('all 22 registered tools survive; all seven real converter formats remain selectable',()=>{
 assert.equal(visibleToolModules.length,22);
 assert.equal(new Set(visibleToolModules.map(m=>m.id)).size,22);
 for(const id of ['song-analyzer','music-tagger','editor','wav','visualizer'])
  assert.equal(visibleToolModules.filter(m=>m.id===id).length,1,id);
 assert.deepEqual(AUDIO_FORMATS.map(x=>x.id),['mp3','wav','flac','aac','m4a','ogg','wma']);
 const features=read('modules/features.mjs');
 for(const name of ['format','sampleRate','bitrate','bitDepth','oggQuality','flacLevel'])
  assert.ok(features.includes("'"+name+"'"),'Missing codec option '+name);
 assert.match(features,/AUDIO_FORMATS\.map/);
});

test('editor keeps every original control and EQ preset; analyzer has all live outputs',()=>{
 const focused=read('modules/focused-tools.mjs');
 const eq=read('modules/eq-advanced.mjs');
 for(const mode of ['trim','cut','merge','fade','gain','eq'])
  assert.ok(focused.includes("['"+mode+"','"),'Missing editor mode '+mode);
 for(const tag of ['data-edit-direction','data-edit-files','data-focus-input="fade"',
                    'data-focus-input="gain"','data-edit-mode','data-edit-view'])
  assert.ok(focused.includes(tag),tag);
 for(const mode of ['3','10','20'])assert.ok(eq.includes(mode),'Missing EQ band option '+mode);
 assert.match(eq,/data-eq-preset/);
 for(const marker of ['data-focus="bpm"','data-focus="key"','data-focus="camelot"',
                      'data-focus="key-confidence"','data-focus="stability"',
                      'data-focus-candidates','data-focus-chords','data-focus-tempo',
                      'data-audo-key-consent','data-audo-key-run','data-focus-action="copy"'])
  assert.ok(focused.includes(marker),marker);
 assert.match(focused,/analyzeRhythmInWorker/);
 assert.match(focused,/analyzeHarmonyInWorker/);
});

test('music tagger keeps acoustic measurements, CLAP, privacy warnings and JSON export',()=>{
 const tagger=read('modules/music-tagger.mjs');
 for(const label of ['PEAK','RMS','CREST FACTOR','CENTROID','TRANSIENTS','STEREO CORRELATION'])
  assert.ok(tagger.includes(label),label);
 for(const marker of ['data-tag-action="local"','data-tag-action="download"',
                      'data-tag-action="ai-run"','data-tag-action="ai-stop"',
                      'data-ai-stage','data-ai-status'])
  assert.ok(tagger.includes(marker),marker);
 for(const label of ['GENRES','MOODS','INSTRUMENTS','160 MB','relative similarity','Web Worker'])
  assert.ok(tagger.includes(label),label);
 assert.match(tagger,/downloadJson/);
});

test('Phase 2 breadcrumb reflects real active module and shared SOURCE AUDIO',()=>{
 const {document,window}=parseHTML(html);
 const old=globalThis.document;
 globalThis.document=document;
 let listener;
 const workspace={
  getSnapshot:()=>({track:{name:'court.wav'}}),
  subscribe:fn=>{listener=fn;return()=>{listener=null;}}
 };
 try{
  const controller=initializePhaseTwo({workspace});
  controller.updateTool({id:'wav',label:'Audio Converter'},'prepare');
  const shell=document.getElementById('pulse-legacy-workspace');
  assert.equal(shell.dataset.activeTool,'wav');
  assert.equal(shell.dataset.activeCategory,'prepare');
  assert.equal(document.querySelector('.phase2-current-tool').textContent,'Audio Converter');
  assert.equal(document.querySelector('.phase2-category-label').textContent,'PREPARE');
  assert.match(document.querySelector('.phase2-source-chip').textContent,/court\.wav/);
  assert.equal(document.querySelectorAll('.phase2-open-source').length,1);
  assert.match(runtime,/getElementById\('audio-file'\)/);
  assert.match(app,/phaseTwo\.updateTool\(definition,activeCategory\)/);
  assert.equal(typeof listener,'function');
  controller.dispose();
  assert.equal(document.querySelectorAll('.phase2-breadcrumb').length,0);
 }finally{
  if(old===undefined)delete globalThis.document;
  else globalThis.document=old;
 }
});

test('phase two changes only presentation color of the existing waveform',()=>{
 const audio=read('modules/workspace.mjs');
 assert.match(audio,/ctx\.strokeStyle='#ff4d1c'/);
 assert.match(audio,/ctx\.fillStyle='#ff4d1c40'/);
 assert.match(audio,/this\.history\.push\(before,processed,label\)/);
 assert.match(audio,/new HistoryStack\(\)/);
 assert.match(audio,/subscribe\(listener\)/);
 assert.match(html,/id="pulse-phase-footer"/);
});

test('phase two CSS passes an actual parser and keeps readable colors',()=>{
 const output=transformSync(css,{loader:'css',target:'es2022',minify:true});
 assert.ok(output.code.length>1000);
 assert.equal(output.warnings.length,0);
 const luminance=hex=>{
  const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
   .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
 };
 const contrast=(a,b)=>{
  const [hi,lo]=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (hi+.05)/(lo+.05);
 };
 assert.ok(contrast('#14130f','#ff4d1c')>=4.5,'CTA text on orange fill must pass AA');
 assert.ok(contrast('#bdbab1','#141416')>=4.5,'secondary text on dark surface must pass AA');
 assert.ok(contrast('#f4f2ee','#141416')>=7,'body text on dark surface should pass AAA');
});
