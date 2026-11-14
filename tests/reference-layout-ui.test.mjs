import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {transformSync} from 'esbuild';
import {initializeReferenceLayout} from '../source/modules/reference-layout-runtime.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';
import {AUDIO_FORMATS} from '../source/modules/converter.mjs';

const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.mjs');
const css=read('modules/reference-tool-layout.css');
const loader=read('modules/index.mjs');
const focused=read('modules/focused-tools.mjs');

test('phase two uses original prototype screen anatomy, not the generic producer dashboard',()=>{
 const {document}=parseHTML(html);
 const prior=globalThis.document;globalThis.document=document;
 const listeners=new Set();
 const workspace={
  buffer:null,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
 };
 try{
  const ctrl=initializeReferenceLayout({workspace});
  const root=document.getElementById('pulse-phase-one');
  const work=document.getElementById('pulse-legacy-workspace');
  assert.ok(root.contains(work),'live workspace belongs inside approved HTML shell');
  assert.ok(root.querySelector('#pulse-phase-footer'));
  assert.ok(work.previousElementSibling===root.querySelector('main')||root.contains(work));
  const section=work.querySelector('#toolkit');
  for(const selector of ['.crumbs','.editor__head h1','.filechip','.filters',
                         '.toolbar','.editor__grid','.panel.stage','.panel.side'])
   assert.ok(section.querySelector(selector),'Missing original HTML component '+selector);
  assert.equal(document.querySelectorAll('#audio-file').length,0,
   'the workspace component owns the one real source; no duplicate input is synthesized here');
  assert.ok(section.querySelector('#tool-panel'),'actual existing panel is retained');
  assert.ok(section.querySelector('#tool-tabs'),'actual existing tabs are retained');
  assert.ok(section.querySelector('.tool-empty'),'original live audio mount point is retained');
  assert.ok(!work.querySelector('.toolkit-heading').hidden===false||work.querySelector('.toolkit-heading').hidden,
    'old Producer Toolkit title is hidden');
  assert.equal(work.querySelectorAll('.pulse-directory').length,1,'no destructive removal of legacy content');

  const cases=[
   ['song-analyzer','analysis','Song Analyzer'],
   ['editor','editor','Audio Editor'],
   ['wav','converter','Audio Converter'],
   ['music-tagger','analysis','Music Tagger'],
   ['visualizer','visualizer','Audio Visualizer']
  ];
  for(const [id,layout,label] of cases){
   ctrl.updateTool({id,label,category:'analyze'});
   assert.equal(work.dataset.template,layout);
   assert.equal(section.querySelector('h1').textContent.replace(/\s+/g,' ').trim(),label+' Local');
  }
  assert.equal(listeners.size,1);
  ctrl.dispose();
  assert.equal(listeners.size,0);
 }finally{
  if(prior===undefined)delete globalThis.document;else globalThis.document=prior;
 }
});

test('real editing controls are moved into the reference toolbar, not duplicated',()=>{
 const {document}=parseHTML(html);
 const prior=globalThis.document;globalThis.document=document;
 try{
  const ctrl=initializeReferenceLayout({workspace:{buffer:null,subscribe:()=>()=>{}}});
  const host=document.createElement('div'),modes=document.createElement('div');
  modes.className='focus-editor-modes';
  const button=document.createElement('button');button.dataset.editMode='cut';
  let presses=0;button.addEventListener('click',()=>presses++);
  modes.append(button);host.append(modes);
  ctrl.updateTool({id:'editor',label:'Audio Editor'});
  ctrl.decorateTool({id:'editor'},host);
  const bar=document.querySelector('.phase2-modes');
  assert.equal(bar.hidden,false);
  assert.strictEqual(bar.querySelector('[data-edit-mode="cut"]'),button);
  button.click();assert.equal(presses,1,'moving live DOM controls keeps action listeners');
  ctrl.updateTool({id:'song-analyzer',label:'Song Analyzer'});
  ctrl.decorateTool({id:'song-analyzer'},host);
  assert.equal(bar.hidden,true);
  ctrl.dispose();
 }finally{
  if(prior===undefined)delete globalThis.document;else globalThis.document=prior;
 }
});

test('canonical prototype style loads last and reproduces distinct module geometry',()=>{
 const scoped=loader.indexOf("phaseOneStyle.href='/modules/phase-one-reference.css'");
 const live=loader.indexOf("referenceToolsStyle.href='/modules/reference-tool-layout.css'");
 assert.ok(scoped>=0&&live>scoped);
 for(const marker of ['.editor__head','.filechip','.toolbar','.editor__grid',
   '.focus-song-summary','.focus-song-tonality','[data-template=analysis]',
   '[data-template=editor]','[data-template=converter]','[data-template=visualizer]'])
  assert.ok(css.includes(marker),marker);
 for(const term of ['var(--paper)','var(--surface)','var(--accent)','var(--font-display)'])
  assert.ok(css.includes(term),'approved token missing: '+term);
 assert.doesNotMatch(css,/color:#ff2b20|background:#ff2b20/i);
 const out=transformSync(css,{loader:'css',minify:true,target:'es2022'});
 assert.equal(out.warnings.length,0);
 assert.ok(out.code.length>2000);
 assert.match(app,/referenceLayout\.decorateTool\(definition,host\)/);
 assert.match(read('modules/phase-one-runtime.mjs'),/for\(const nav of \$\$\('\[data-phase-nav\]'\)\)/);
});

test('full audio controls and real processing are unchanged',()=>{
 assert.equal(visibleToolModules.length,22);
 assert.deepEqual(AUDIO_FORMATS.map(x=>x.id),['mp3','wav','flac','aac','m4a','ogg','wma']);
 for(const mode of ['trim','cut','merge','fade','gain','eq'])
  assert.ok(focused.includes("['"+mode+"','"),mode);
 for(const field of ['data-audo-key-consent','data-focus-candidates','data-focus-chords',
                     'data-focus="camelot"','data-edit-files','data-edit-direction'])
  assert.ok(focused.includes(field),field);
 assert.match(focused,/analyzeRhythmInWorker/);
 assert.match(focused,/advancedEqualizerModule\.mount/);
 assert.match(app,/definition\.mount\(\{host,category:activeCategory\}\)/);
 assert.match(html,/id="pulse-phase-footer"/);
});
