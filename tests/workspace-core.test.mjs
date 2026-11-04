import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../source/modules/'+path,import.meta.url),'utf8');

test('AudioSession stores the source File instead of a second decoded AudioBuffer',()=>{
 const source=read('workspace.mjs');
 assert.match(source,/this\.originalFile=file/);
 assert.match(source,/export class AudioSession extends AudioWorkspace/);
 assert.doesNotMatch(source,/cloneBuffer/);
 assert.match(source,/async reset\(\)/);
});
test('workspace exposes a metadata-only observable snapshot',()=>{
 const source=read('workspace.mjs');
 assert.match(source,/subscribe\(listener\)/);
 assert.match(source,/getSnapshot\(\)/);
 assert.match(source,/emitChange\(reason/);
 assert.match(source,/history:Object\.freeze/);
});
test('workspace history is memory bounded and uses shared reference entries',()=>{
 const source=read('workspace.mjs');
 assert.match(source,/new HistoryStack\(\)/);
 assert.match(source,/this\.history\.push\(before,processed,label\)/);
 assert.match(source,/Undo snapshot skipped to protect memory/);
});
