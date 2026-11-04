import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountWorkspaceActions} from '../source/modules/workspace-actions.mjs';

function mockUi(audio) {
  const handlers = new Map();
  function button() {return {disabled:false,innerHTML:'',attrs:{},addEventListener(type,callback){handlers.set(this.type+type,callback)},setAttribute(name,value){this.attrs[name]=value}};}
  const preview=button();preview.type='preview';const wav=button();wav.type='wav';
  const status={textContent:'',dataset:{}};
  const section={className:'',innerHTML:'',attrs:{},setAttribute(name,value){this.attrs[name]=value},querySelector(selector){return selector==='[data-workspace-preview]'?preview:selector==='[data-workspace-export]'?wav:status},remove(){this.removed=true}};
  const container={append(element){this.section=element}};
  const listeners=new Map();
  const root={createElement:()=>section,querySelector:()=>null,addEventListener:(t,cb)=>listeners.set(t,cb),removeEventListener:t=>listeners.delete(t)};
  const cleanup=mountWorkspaceActions(container,audio,root);
  return {preview,wav,status,section,handlers,container,listeners,cleanup};
}
test('shared red-panel actions disable before audio upload',()=>{
 const w={buffer:null,playing:false};const ui=mockUi(w);
 assert.equal(ui.preview.disabled,true);assert.equal(ui.wav.disabled,true);
 assert.match(ui.section.innerHTML,/EXPORT WAV/);assert.match(ui.section.innerHTML,/PREVIEW AUDIO/);
 ui.cleanup();assert.equal(ui.section.removed,true);assert.equal(ui.listeners.size,0);
});
test('preview uses real AudioWorkspace playback and WAV export uses PCM24',async()=>{
 let played=0,saved=null;const w={buffer:{length:1000},playing:false,async togglePlay(){played++;this.playing=!this.playing},save(bits,segment){saved=[bits,segment]}};
 const ui=mockUi(w);assert.equal(ui.preview.disabled,false);assert.equal(ui.wav.disabled,false);
 await ui.handlers.get('previewclick')();
 assert.equal(played,1);assert.equal(w.playing,true);assert.match(ui.preview.innerHTML,/PAUSE AUDIO/);
 ui.handlers.get('wavclick')();assert.deepEqual(saved,[24,false]);
 assert.match(ui.status.textContent,/24-bit PCM WAV/);
 ui.cleanup();
});
test('status updates after a workspace buffer is added and no stale listeners remain',()=>{
 const w={buffer:null,playing:false};const ui=mockUi(w);w.buffer={length:1024};
 ui.listeners.get('pulse:audio-source')();assert.equal(ui.preview.disabled,false);
 ui.cleanup();assert.equal(ui.listeners.has('pulse:audio-source'),false);
});
test('tool panel and standalone BPM both mount shared output controls',()=>{
 const app=readFileSync(new URL('../source/app.mjs',import.meta.url),'utf8');
 const bpm=readFileSync(new URL('../source/reference-ui.mjs',import.meta.url),'utf8');
 assert.match(app,/mountWorkspaceActions\(host,w\)/);
 assert.match(bpm,/mountWorkspaceActions\(document\.querySelector\('#analyzer \.bpm-result-panel'\),w\)/);
});
