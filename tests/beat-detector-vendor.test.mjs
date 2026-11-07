import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// This test protects the lazy-load contract: script must create the public namespace.
test('pinned npm UMD bundle exposes analyze and guess to a browser-like global',()=>{
 const path=new URL('../node_modules/web-audio-beat-detector/build/es5/bundle.js',import.meta.url);
 const src=readFileSync(path,'utf8');
 const scope={};scope.self=scope;scope.window=scope;scope.globalThis=scope;
 runInNewContext(src,scope,{timeout:2000});
 assert.equal(typeof scope.webAudioBeatDetector?.analyze,'function');
 assert.equal(typeof scope.webAudioBeatDetector?.guess,'function');
});
