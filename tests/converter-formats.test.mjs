import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_FORMATS,conversionOptions,buildConversionArgs,inferFormat} from '../source/modules/converter.mjs';
const expected=['mp3','wav','flac','aac','m4a','ogg','wma'];
test('seven formats are supported',()=>assert.deepEqual(AUDIO_FORMATS.map(x=>x.id),expected));
test('source extensions are inferred',()=>{assert.equal(inferFormat('test.WMA'),'wma');assert.equal(inferFormat('song.oga'),'ogg');});
test('each export format specifies an explicit codec and container',()=>{for(const format of expected){const args=buildConversionArgs('in.wav','out.'+format,{format});assert.ok(args.includes('-c:a'));assert.ok(args.includes('-f'));assert.equal(args.at(-1),'out.'+format);}});
test('input validation rejects invalid parameters',()=>{assert.throws(()=>conversionOptions({format:'wma',bitrate:500}));assert.throws(()=>conversionOptions({format:'bogus'}));assert.throws(()=>conversionOptions({format:'ogg',oggQuality:12}));});

test('browser encoder uses the ESM FFmpeg core rather than incompatible UMD build',async()=>{
 const {readFileSync,existsSync,statSync}=await import('node:fs');
 const {join,dirname}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const buildSource=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 const converterSource=readFileSync(new URL('../source/modules/converter.mjs',import.meta.url),'utf8');
 assert.match(buildSource,/'core','dist','esm','ffmpeg-core\.js'/);
 assert.match(buildSource,/'core','dist','esm','ffmpeg-core\.wasm'/);
 assert.doesNotMatch(buildSource,/'core','dist','umd','ffmpeg-core\.js'/);
 assert.match(converterSource,/ffmpeg-core-esm\/ffmpeg-core\.js/);
 assert.match(converterSource,/ffmpeg-core-esm\/ffmpeg-core\.wasm/);
 assert.match(converterSource,/method:'HEAD'/);
 assert.match(converterSource,/LOAD_TIMEOUT_MS/);
 const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
 const dist=join(root,'node_modules','@ffmpeg','core','dist','esm');
 for(const name of ['ffmpeg-core.js','ffmpeg-core.wasm']){
  assert.equal(existsSync(join(dist,name)),true,name+' must be shipped by pinned @ffmpeg/core');
  assert.ok(statSync(join(dist,name)).size>100000,'Bundle missing or too small: '+name);
 }
 const js=readFileSync(join(dist,'ffmpeg-core.js'),'utf8');
 assert.match(js,/\bexport\s+default\b|\bexport\s*\{[^}]*default/,'Module-worker core needs a default ESM export');
});
