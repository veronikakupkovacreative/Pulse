import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {join} from 'node:path';
import {build} from 'esbuild';

// Compile the browser integration into a dependency-free IIFE before shipping.
// The upstream prebuilt UMD bundle still expects an external broker global.
test('pinned beat detector bundles with all dependencies and exposes analyze/guess',async()=>{
 const result=await build({
  entryPoints:[join(process.cwd(),'node_modules','web-audio-beat-detector','build','es2019','module.js')],
  bundle:true,write:false,platform:'browser',format:'iife',
  globalName:'webAudioBeatDetector',target:'es2020',minify:true,legalComments:'inline'
 });
 const script=new TextDecoder().decode(result.outputFiles[0].contents);
 const scope={};scope.self=scope;scope.window=scope;scope.globalThis=scope;
 runInNewContext(script,scope,{timeout:3000});
 assert.equal(typeof scope.webAudioBeatDetector?.analyze,'function');
 assert.equal(typeof scope.webAudioBeatDetector?.guess,'function');
});
