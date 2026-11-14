import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPulseFrame,VISUAL_MODES,VISUAL_PRESETS} from '../source/modules/visualizer.mjs';
const canvas={width:400,height:240,getContext(){
 const calls=[];return {calls,fillRect(){calls.push('fillRect')},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},save(){},restore(){},closePath(){},translate(){},rotate(){},quadraticCurveTo(){},bezierCurveTo(){},set lineWidth(v){},set lineCap(v){},set lineJoin(v){},set strokeStyle(v){},set fillStyle(v){},set globalAlpha(v){},set font(v){},set textAlign(v){},set textBaseline(v){},set shadowBlur(v){},set shadowColor(v){}};
}};
test('active visualizer exposes six implemented modes and six presets',()=>{
 assert.deepEqual(Object.keys(VISUAL_MODES),['radial','spectrum','mirror','oscilloscope','vectorscope','particles']);
 assert.deepEqual(Object.keys(VISUAL_PRESETS),['pulse','mono','contrast','night','studio','charcoal']);
});
test('every visual mode renders from finite FFT and waveform data',()=>{
 const freq=new Uint8Array(1024).fill(80),wave=new Uint8Array(2048).fill(128);
 for(const mode of Object.keys(VISUAL_MODES))assert.doesNotThrow(()=>renderPulseFrame(canvas,{mode,fftSize:2048,sampleRate:44100,bars:48},{freq,wave}));
});
test('visualizer rendering is local and does not call provider APIs',()=>{
 assert.doesNotMatch(String(renderPulseFrame),/fetch\(|\/api\//);
});
