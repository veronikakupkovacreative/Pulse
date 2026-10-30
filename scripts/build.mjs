import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFile(path.join(root,'source',name),'utf8');
let [html,css,app,analyzer,worker,studioAudio,tools,keyWorker,quickDsp,audioWorkspace,productionDsp,productionWorker,zipStore,mastering,playhead,harmonicWorkflow,fileSupport,mediaLoader,projectSession,metronomeClock,truePeak,mixHealth,spectralHealth,eqResponse,referenceCompare,eqDsp,mixDsp,extraTools,mixAdvisor,quickFix,classicEq,eqRegion,eqBandModes,waveEdit]=await Promise.all([
  read('index.html'),read('style.css'),read('app.mjs'),read('analyzer.mjs'),read('analysis-worker.mjs'),
  read('studio-audio.mjs'),read('tools.mjs'),read('key-worker.mjs'),read('dsp/quick-tools.mjs'),read('core/audio-workspace.mjs'),read('dsp/production-tools.mjs'),read('production-worker.mjs'),read('dsp/zip-store.mjs'),read('dsp/mastering.mjs'),read('playhead.mjs'),read('dsp/harmonic-workflow.mjs'),read('file-support.mjs'),read('core/media-loader.mjs'),read('core/project-session.mjs'),read('metronome-clock.mjs'),read('dsp/true-peak.mjs'),read('dsp/mix-health.mjs'),read('dsp/spectral-health.mjs'),read('dsp/eq-response.mjs'),read('dsp/reference-compare.mjs'),read('dsp/parametric-eq.mjs'),read('dsp/multitrack-mix.mjs'),read('extra-tools.mjs'),read('dsp/mix-advisor.mjs'),read('dsp/stereo-quick-fix.mjs'),read('dsp/classic-eq.mjs'),read('dsp/eq-region.mjs'),read('dsp/eq-band-modes.mjs'),read('dsp/waveform-edit.mjs')
]);
const noExports=source=>source.replace(/^export /gm,'');
const noImports=source=>source.replace(/^import[^\n]+\n/gm,'');
const workerSource=noExports(analyzer)+'\n'+noImports(worker);
const keySource=noExports(studioAudio)+'\n'+noImports(keyWorker);
const productionSource=noExports(productionDsp)+'\n'+noExports(analyzer)+'\n'+noExports(quickDsp)+'\n'+noExports(truePeak)+'\n'+noExports(mixHealth)+'\n'+noExports(spectralHealth)+'\n'+noExports(eqResponse)+'\n'+noImports(noExports(mastering))+'\n'+noImports(productionWorker);
new vm.Script(workerSource);new vm.Script(keySource);new vm.Script(productionSource);
const originalWorker="new Worker(new URL('./analysis-worker.mjs',import.meta.url),{type:'module'})";
const originalKeyWorker="new Worker(new URL('./key-worker.mjs',import.meta.url),{type:'module'})";
const originalProductionWorker="new Worker(new URL('./production-worker.mjs',import.meta.url),{type:'module'})";

assert.equal(app.split(originalWorker).length,2,'Expected one BPM worker constructor');

app=noImports(app).replace(originalWorker,'createAnalysisWorker()');
assert.equal(tools.split(originalKeyWorker).length,2,'Expected one key worker constructor');
tools=noImports(tools).replace(originalKeyWorker,'createBundledKeyWorker()');
assert.equal(tools.split(originalProductionWorker).length,2,'Expected one production worker constructor');
tools=tools.replace(originalProductionWorker,'createBundledProductionWorker()');
const createBlobWorker=source=>`function ${source==='bpm'?'createAnalysisWorker':'createBundledKeyWorker'}(){\n    const url=URL.createObjectURL(new Blob([${source==='bpm'?'ANALYSIS_WORKER_SOURCE':'KEY_WORKER_SOURCE'}],{type:'text/javascript'}));\n    let worker;try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}\n    const terminate=worker.terminate.bind(worker);worker.terminate=()=>{URL.revokeObjectURL(url);terminate();};return worker;\n  }`;
const rawApiBase=(process.env.PULSE_API_BASE_URL||'').trim();
if(rawApiBase && !/^https:\/\/[^\s/]+\/?$/i.test(rawApiBase) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(rawApiBase)) {
  throw new Error('PULSE_API_BASE_URL must be an HTTPS origin, or an HTTP localhost origin for tests.');
}
const bundledScript=`(() => {
  'use strict';
  const PULSE_API_BASE_URL=${JSON.stringify(rawApiBase.replace(/\/$/,''))};
  const ANALYSIS_WORKER_SOURCE=${JSON.stringify(workerSource)};
  const KEY_WORKER_SOURCE=${JSON.stringify(keySource)};
  const PRODUCTION_WORKER_SOURCE=${JSON.stringify(productionSource)};
  ${createBlobWorker('bpm')}
  ${createBlobWorker('key')}
  function createBundledProductionWorker(){const url=URL.createObjectURL(new Blob([PRODUCTION_WORKER_SOURCE],{type:'text/javascript'}));const worker=new Worker(url);const terminate=worker.terminate.bind(worker);worker.terminate=()=>{URL.revokeObjectURL(url);terminate();};return worker;}
  ${noExports(studioAudio)}
  ${noExports(playhead)}
  ${noExports(metronomeClock)}
  ${noExports(harmonicWorkflow)}
  ${noExports(fileSupport)}
  ${noExports(quickDsp)}
  ${noExports(audioWorkspace)}
  ${noExports(mediaLoader)}
  ${noImports(noExports(projectSession))}
  ${noExports(productionDsp)}
  ${noExports(referenceCompare)}
  ${noExports(eqResponse)}
  ${noExports(spectralHealth)}
  ${noImports(noExports(mixAdvisor))}
  ${noImports(noExports(quickFix))}
  ${noImports(noExports(eqDsp))}
  ${noImports(noExports(classicEq))}
  ${noImports(noExports(eqBandModes))}
  ${noImports(noExports(eqRegion))}
  ${noExports(waveEdit)}
  ${noExports(mixDsp)}
  ${noExports(extraTools)}
  ${noExports(zipStore)}
  ${noExports(tools)}
  ${app}
})();`;
new vm.Script(bundledScript);
assert(!bundledScript.includes('import.meta'),'Standalone app cannot reference import.meta');
assert(html.includes('<link rel="stylesheet" href="./style.css">'));
assert(html.includes('<script type="module" src="./app.mjs"></script>'));
html=html.replace('<link rel="stylesheet" href="./style.css">',()=>'<style>\n'+css.replace(/<\/style/gi,'<\\/style')+'\n</style>')
  .replace('  <script type="module" src="./app.mjs"></script>','')
  .replace('</body>',()=>'<script>\n'+bundledScript.replace(/<\/script/gi,'<\\/script')+'\n</script>\n</body>');
assert(!/<link[^>]+rel=["']stylesheet/.test(html));
assert(!/<script[^>]+src=/.test(html));
await mkdir(path.join(root,'public'),{recursive:true});
await mkdir(path.join(root,'public','vendor'),{recursive:true});
await copyFile(path.join(root,'node_modules','@breezystack','lamejs','dist','lamejs.iife.js'),path.join(root,'public','vendor','lamejs.iife.js'));
await copyFile(path.join(root,'node_modules','@breezystack','lamejs','LICENSE'),path.join(root,'public','vendor','lamejs-LICENSE.txt'));
// On-device Demucs runs only on user request. No model is downloaded on page load.
const vendor=path.join(root,'public','vendor'),ortVendor=path.join(vendor,'onnx');
await mkdir(ortVendor,{recursive:true});
const ortDir=path.join(root,'node_modules','onnxruntime-web','dist');
await copyFile(path.join(ortDir,'ort.min.js'),path.join(ortVendor,'ort.min.js'));
for(const name of await readdir(ortDir)){
  if(/^ort-wasm.*\.(?:wasm|mjs)$/.test(name))
    await copyFile(path.join(ortDir,name),path.join(ortVendor,name));
}
const demucsLoader=await read('vendor/demucs-loader.mjs');
const demucsWorker=await read('vendor/demucs-worker.js');
const workerWithLoader=demucsWorker.replace('let session=null,active=false;',noExports(demucsLoader)+'\nlet session=null,active=false;');
new vm.Script(workerWithLoader);
await writeFile(path.join(vendor,'demucs-worker.js'),workerWithLoader);
await writeFile(path.join(vendor,'demucs-NOTICE.txt'),`Demucs ONNX loader adapted from joverval/sdemux (MIT), https://github.com/joverval/sdemux
Model: htdemucs_embedded.onnx, model origin https://huggingface.co/timcsy/demucs-web-onnx
The pretrained model is fetched on demand. Trained-model licensing and source-data rights need review for commercial use.
Copyright (c) 2026 joverval/sdemux contributors and respective authors.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom
the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
`);
await writeFile(path.join(root,'public/index.html'),html);
await writeFile(path.join(root,'index.html'),html);
console.log(`Built standalone Pulse Studio index.html (${Math.round(Buffer.byteLength(html)/1024)} KiB).`);
