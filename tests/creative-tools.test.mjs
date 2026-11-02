import test from 'node:test';
import assert from 'node:assert/strict';
import {ThePulseStudioEngine,ENHANCER_PRESETS,VISUAL_PRESETS,AIAudioEnhancer} from '../source/modules/pulse-engine.mjs';
import {creativeModules} from '../source/modules/creative-tools.mjs';
test('brand presets and developer API',()=>{const studio=new ThePulseStudioEngine();const e=studio.createAIAudioEnhancer('studio_sound');assert.equal(e.presetName,'studio_sound');e.applyPreset('podcast');assert.equal(e.presetName,'podcast');assert.equal(Object.keys(ENHANCER_PRESETS).length,5);assert.equal(Object.keys(VISUAL_PRESETS).length,4)});
test('enhancer validates settings',()=>{const e=new AIAudioEnhancer();assert.throws(()=>e.applyPreset('fake'));assert.throws(()=>e.setMix(101));assert.equal(e.setMix(60).mix,60)});
test('creative tools in correct categories',()=>{assert.deepEqual(creativeModules.map(m=>m.category),['ai','analyze']);assert.deepEqual(creativeModules.map(m=>m.id),['enhancer','visualizer'])});
