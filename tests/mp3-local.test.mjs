import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// The encoder ships as a separate LGPL file, not part of the proprietary app bundle.
const encoderPath=new URL('../node_modules/@breezystack/lamejs/dist/lamejs.iife.js',import.meta.url);
test('MP3 encoder is self-hosted, not loaded from a third-party CDN',async()=>{
  const source=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
  const build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert.match(source,/\/vendor\/lamejs\.iife\.js/);
  assert.doesNotMatch(source,/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/);
  assert.match(build,/lamejs-LICENSE\.txt/);
});
test('bundled MP3 encodes silent frames at all supported bitrates',async()=>{
  const code=await readFile(encoderPath,'utf8');
  const context={};
  vm.runInNewContext(code,context,{timeout:10000});
  const api=context.lamejs||context.window?.lamejs;
  assert.equal(typeof api?.Mp3Encoder,'function');
  for(const bitrate of [128,192,320]){
    const encoder=new api.Mp3Encoder(2,44100,bitrate);
    const left=new Int16Array(1152),right=new Int16Array(1152);
    const chunks=[encoder.encodeBuffer(left,right),encoder.flush()];
    const bytes=Uint8Array.from(chunks.flatMap(chunk=>Array.from(chunk)));
    assert.ok(bytes.length>80,'empty MP3 at '+bitrate);
    assert.ok(bytes.some((x,i)=>x===0xff&&(bytes[i+1]&0xe0)===0xe0),'missing MPEG frame sync at '+bitrate);
  }
});
