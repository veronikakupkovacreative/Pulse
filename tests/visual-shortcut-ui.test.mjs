import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VISUAL_MODES,ThePulseStudioEngine} from '../source/modules/pulse-engine.mjs';
import {Web} from '../source/modules/web-engine.mjs';
import {toolModules} from '../source/modules/features.mjs';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const modes=['audiogram','podcast','bars','sound_wave_maker','waveform','audio_waveform_generator','spectrum'];

test('both existing VISUALS modules and all seven audio modes remain registered',()=>{
  for(const id of ['visualizer','visualizer-advanced']){
    const module=toolModules.find(x=>x.id===id);
    assert.ok(module,id);assert.equal(module.category,'visuals');
  }
  for(const mode of modes)assert.ok(VISUAL_MODES[mode],mode);
});
test('the black See your sound panel is removed, retaining normal tool tabs and footer links',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/pulse-visual-shortcuts|pulse-visual-shortcut-grid|pulse-visual-summary/);
  assert.doesNotMatch(html,/Seven live visualizations and an advanced studio/);
  assert.match(html,/id="tool-tabs"/);
  const links=[...html.matchAll(/data-open-visual="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(links,['bars','waveform','podcast','spectrum']);
  assert.match(html,/data-open-tool="visualizer"/);
});
test('deleted panel controls do not leave unused event handlers or CSS',()=>{
  const js=read('app.mjs'),css=read('style.css');
  assert.doesNotMatch(js,/visualShortcuts|markVisualShortcut|pulse-visual-shortcuts/);
  assert.doesNotMatch(css,/pulse-visual-shortcuts|pulse-visual-shortcut-grid/);
  assert.match(js,/closest\('\[data-open-visual\]'\)/);
  assert.match(js,/tab\.click\(\)/);
  assert.match(js,/if\(control\)control\.click\(\)/);
});
test('original Web createVisualizer style API still supports all seven modes',()=>{
  const canvas={width:320,height:180,getContext:()=>({})};
  const web=new Web();
  const v=web.createVisualizer(null,canvas,'bars');
  assert.equal(v.mode,'bars');
  for(const mode of modes){v.setStyle(mode);assert.equal(v.mode,mode);}
  v.dispose();
});
test('audio sources still connect and disconnect correctly',()=>{
  let connected=0,disconnected=0,analyserDisconnected=0;
  const analyser={fftSize:0,smoothingTimeConstant:0,disconnect(){analyserDisconnected++}};
  const source={context:{createAnalyser(){return analyser}},connect(x){assert.equal(x,analyser);connected++},disconnect(x){assert.equal(x,analyser);disconnected++}};
  const v=new ThePulseStudioEngine().createVisualizer(null,{width:320,height:180,getContext:()=>({})},'podcast');
  v.attachSource(source);assert.equal(connected,1);
  v.attachSource(null);assert.equal(disconnected,1);assert.equal(analyserDisconnected,1);
  v.dispose();
});
