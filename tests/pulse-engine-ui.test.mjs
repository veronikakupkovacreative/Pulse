import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../source/app.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../source/pulse-engine-ui.mjs',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
test('new engine functions have real user-facing controls',()=>{
 for(const id of ['pulse-engine-panel','engine-effect','engine-strength','engine-profile','engine-seconds',
   'engine-preview','engine-stop','engine-apply','engine-export','engine-status','engine-viz']){
   assert.ok(html.includes('id="'+id+'"'),'Missing UI control '+id);
 }
 for(const effect of ['bass','rumble','voice','mix','master','fade-in','fade-out','volume','speed',
   'vocals','instrumental','reverse','trim','normalize'])assert.ok(html.includes('value="'+effect+'"'));
});
test('all new controls are connected to processing, preview, apply and export',()=>{
 assert.match(app,/initPulseEngineUI\(pulseProject,encodeWav\)/);
 assert.match(build,/read\('pulse-engine-ui\.mjs'\)/);
 assert.match(build,/noImports\(noExports\(pulseEngineUi\)\)/);
 for(const method of ['createBassBooster','createNoiseReductionFilter','createAIVoiceCleaner',
   'createAIMixEngine','createAIMasteringEngine','reverseAudioBuffer','removeSilenceBuffer',
   'normalizeAudioBuffer','separateVocalStems','createVisualizer'])assert.ok(ui.includes('.'+method+'('),method);
 assert.match(ui,/project\.workspace\.apply\(buffer\)/);
 assert.match(ui,/window\.dispatchEvent\(new Event\('pulse:advanced-applied'\)\)/);
 assert.match(ui,/encodeWav\(toChannels\(buffer\),buffer\.sampleRate,24\)/);
});
