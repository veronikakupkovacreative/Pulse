import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
test('Audio Protection is registered and reachable from the prototype tool directory',()=>{
 const registry=read('modules/index.mjs'),page=read('index.html'),runtime=read('modules/prototype-runtime.mjs');
 assert.match(registry,/audioProtectionModule/);
 assert.match(page,/data-open-tool="audio-protection"/);
 assert.match(runtime,/audio-protection/);
 assert.match(read('modules/tool-editorial.mjs'),/audio-protection/);
});
test('Audio Protection uses the shared source buffer without a second upload',()=>{
 const module=read('modules/audio-protection-tool.mjs'),ui=read('modules/protection-ui.mjs');
 assert.match(module,/workspace as w/);assert.match(module,/getSourceAudio/);
 assert.match(ui,/mountAudioProtection/);assert.doesNotMatch(ui,/type="file"|data-protection-file/);
});
test('watermark engine supports embedding and verification',()=>{
 const dsp=read('modules/audio-protection.mjs');
 assert.match(dsp,/embedWatermark/);assert.match(dsp,/verifyWatermark/);
});
