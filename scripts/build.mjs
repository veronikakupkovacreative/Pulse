import {mkdir,copyFile,readFile,readdir,cp} from 'node:fs/promises';
import {build as bundle} from 'esbuild';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(root,'source'),output=join(root,'public');
await mkdir(join(output,'modules'),{recursive:true});
for(const file of ['index.html','style.css','app.mjs']){await readFile(join(source,file));await copyFile(join(source,file),join(output,file));}
for(const file of await readdir(join(source,'modules'))){if(file.endsWith('.mjs')||file.endsWith('.css'))await copyFile(join(source,'modules',file),join(output,'modules',file));}
// Publish a pinned same-origin beat detector for lazy browser loading.
await mkdir(join(output,'vendor','beat-detector'),{recursive:true});
await bundle({
 entryPoints:[join(root,'node_modules','web-audio-beat-detector','build','es2019','module.js')],
 outfile:join(output,'vendor','beat-detector','bundle.js'),
 bundle:true,platform:'browser',format:'iife',globalName:'webAudioBeatDetector',
 target:'es2020',minify:true,legalComments:'inline'
});
await copyFile(join(root,'node_modules','web-audio-beat-detector','LICENSE'),join(output,'vendor','beat-detector','LICENSE.txt'));
console.log('Built PULSE Studio with browser audio modules.');

// Ship pinned codec binaries and ESM worker from node_modules; no runtime CDN dependency.
await mkdir(join(output,'vendor','ffmpeg'),{recursive:true});
await mkdir(join(output,'vendor','ffmpeg-core'),{recursive:true});
await cp(join(root,'node_modules','@ffmpeg','ffmpeg','dist','esm'),join(output,'vendor','ffmpeg'),{recursive:true});
// The FFmpeg wrapper uses a MODULE worker. Its dynamic import requires the ESM core,
// not the UMD core (UMD has no default export). Use a new URL to avoid stale cached UMD.
await mkdir(join(output,'vendor','ffmpeg-core-esm'),{recursive:true});
await copyFile(join(root,'node_modules','@ffmpeg','core','dist','esm','ffmpeg-core.js'),join(output,'vendor','ffmpeg-core-esm','ffmpeg-core.js'));
await copyFile(join(root,'node_modules','@ffmpeg','core','dist','esm','ffmpeg-core.wasm'),join(output,'vendor','ffmpeg-core-esm','ffmpeg-core.wasm'));

// Self-host Transformers.js and ONNX Runtime WASM so audio inference code never needs a third-party script.
const clap=join(root,'node_modules','@xenova','transformers');
await mkdir(join(output,'vendor','clap'),{recursive:true});
for(const file of ['transformers.min.js','ort-wasm.wasm','ort-wasm-simd.wasm','ort-wasm-threaded.wasm','ort-wasm-simd-threaded.wasm']){
 await copyFile(join(clap,'dist',file),join(output,'vendor','clap',file));
}
try{await copyFile(join(clap,'LICENSE'),join(output,'vendor','clap','LICENSE.txt'));}catch{}
console.log('Bundled pinned Transformers.js CLAP runtime. Model weights download on first use to browser cache.');
