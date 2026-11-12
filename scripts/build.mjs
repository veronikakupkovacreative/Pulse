import {mkdir,copyFile,readFile,readdir,cp} from 'node:fs/promises';
import {build as bundle} from 'esbuild';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(root,'source'),output=join(root,'public');
await mkdir(join(output,'modules'),{recursive:true});
for(const file of ['index.html','style.css','app.mjs','reference-ui.mjs']){await readFile(join(source,file));await copyFile(join(source,file),join(output,file));}
for(const file of await readdir(join(source,'modules'))){if(file.endsWith('.mjs')||file.endsWith('.css'))await copyFile(join(source,'modules',file),join(output,'modules',file));}
// Ship the Song Analyzer as a same-origin worker-based module (including its CSS).
await cp(join(source,'song'),join(output,'song'),{recursive:true});
// Publish a pinned same-origin beat detector for lazy browser loading.
await mkdir(join(output,'vendor','beat-detector'),{recursive:true});
await bundle({
 entryPoints:[join(root,'node_modules','web-audio-beat-detector','build','es2019','module.js')],
 outfile:join(output,'vendor','beat-detector','bundle.js'),
 bundle:true,platform:'browser',format:'iife',globalName:'webAudioBeatDetector',
 target:'es2020',minify:true,legalComments:'inline'
});
await copyFile(join(root,'node_modules','web-audio-beat-detector','LICENSE'),join(output,'vendor','beat-detector','LICENSE.txt'));
// Experimental Essentia.js 0.1.3: local AGPL-3.0 WASM (never fetched from a CDN).
await mkdir(join(output,'vendor','essentia'),{recursive:true});
for(const file of ['essentia-wasm.web.js','essentia-wasm.web.wasm','essentia.js-core.umd.js']){
 await copyFile(join(root,'node_modules','essentia.js','dist',file),join(output,'vendor','essentia',file));
}
await copyFile(join(root,'node_modules','essentia.js','LICENSE'),join(output,'vendor','essentia','LICENSE.txt'));
// Emscripten resolves .wasm relative to the Worker script, not importScripts URL.
await copyFile(join(source,'modules','essentia-worker.mjs'),join(output,'vendor','essentia','essentia-worker.mjs'));
console.log('Built PULSE Studio with browser audio modules.');

// Ship pinned codec binaries and ESM worker from node_modules; no runtime CDN dependency.
await mkdir(join(output,'vendor','ffmpeg'),{recursive:true});
await mkdir(join(output,'vendor','ffmpeg-core'),{recursive:true});
await cp(join(root,'node_modules','@ffmpeg','ffmpeg','dist','esm'),join(output,'vendor','ffmpeg'),{recursive:true});
await copyFile(join(root,'node_modules','@ffmpeg','core','dist','umd','ffmpeg-core.js'),join(output,'vendor','ffmpeg-core','ffmpeg-core.js'));
await copyFile(join(root,'node_modules','@ffmpeg','core','dist','umd','ffmpeg-core.wasm'),join(output,'vendor','ffmpeg-core','ffmpeg-core.wasm'));
