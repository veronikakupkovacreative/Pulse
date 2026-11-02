import test from 'node:test';
import assert from 'node:assert/strict';
import {VisualizerEngine,ThePulseStudioEngine,VISUAL_MODES} from '../source/modules/pulse-engine.mjs';
const canvas={width:400,height:240,clientWidth:400,clientHeight:240,getContext(){return {fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fillText(){}}}};
test('all seven source modes are available',()=>assert.deepEqual(Object.keys(VISUAL_MODES),['bars','sound_wave_maker','waveform','audio_waveform_generator','audiogram','podcast','spectrum']));
test('legacy setStyle and createVisualizer API work',()=>{const v=new ThePulseStudioEngine().createVisualizer(null,canvas,'bars');assert.equal(v.mode,'bars');v.setStyle('podcast');assert.equal(v.mode,'podcast');v.dispose()});
test('options validate values and do not enable unsafe sizes',()=>{const v=new VisualizerEngine(null,canvas);v.setOptions({barCount:64,sensitivity:1.4,smoothing:.65});assert.equal(v.barCount,64);assert.throws(()=>v.setOptions({fftSize:999}));assert.throws(()=>v.setStyle('not-real'))});
