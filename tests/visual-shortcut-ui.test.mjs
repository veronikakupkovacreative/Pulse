import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VISUAL_MODES,ThePulseStudioEngine} from '../source/modules/pulse-engine.mjs';
import {Web} from '../source/modules/web-engine.mjs';
import {toolModules} from '../source/modules/features.mjs';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const modes=['audiogram','podcast','bars','sound_wave_maker','waveform','audio_waveform_generator','spectrum'];

test('VISUALS is registered with both actual visualizer tools',()=>{
  for(const id of ['visualizer','visualizer-advanced']){
    const module=toolModules.find(x=>x.id===id);
    assert.ok(module,id);assert.equal(module.category,'visuals');
  }
  for(const mode of modes)assert.ok(VISUAL_MODES[mode],mode);
});
test('every real-time mode has one explicit accessible shortcut',()=>{
  const html=read('index.html');
  for(const mode of modes){
    const token='data-open-visual="'+mode+'"';
    assert.equal(html.split(token).length-1,1,token);
    assert.match(html,new RegExp('data-open-visual="'+mode+'" aria-pressed="(?:true|false)"'));
  }
  assert.match(html,/data-open-tool="visualizer-advanced" aria-pressed="false"/);
});
test('visual shortcuts are shown for VISUALS and hidden for other categories',()=>{
  const js=read('app.mjs'),css=read('style.css');
  assert.match(js,/visualShortcuts\.hidden=category!=='visuals'/);
  assert.match(js,/markVisualShortcut\(mode,'visualizer'\)/);
  assert.match(js,/control\.dataset\.mode,'visualizer'/);
  assert.match(css,/\.pulse-visual-shortcuts\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.pulse-visual-shortcut-grid button\.is-active/);
  assert.doesNotMatch(css,/\.pulse-visual-shortcut-grid button:first-child\{background:#ff2b20/);
});
test('user-provided Web createVisualizer style API remains callable',()=>{
  const canvas={width:320,height:180,getContext:()=>({})};
  const web=new Web();
  const v=web.createVisualizer(null,canvas,'bars');
  assert.equal(v.mode,'bars');
  for(const mode of modes){v.setStyle(mode);assert.equal(v.mode,mode);}
  v.dispose();
});
test('audio-source node connects and disconnects from analyser with source events',()=>{
  let connected=0,disconnected=0,analyserDisconnected=0;
  const analyser={fftSize:0,smoothingTimeConstant:0,disconnect(){analyserDisconnected++}};
  const source={context:{createAnalyser(){return analyser}},connect(x){assert.equal(x,analyser);connected++},disconnect(x){assert.equal(x,analyser);disconnected++}};
  const canvas={width:320,height:180,getContext:()=>({})};
  const v=new ThePulseStudioEngine().createVisualizer(null,canvas,'podcast');
  v.attachSource(source);assert.equal(connected,1);
  v.attachSource(null);assert.equal(disconnected,1);assert.equal(analyserDisconnected,1);
  v.dispose();
});
