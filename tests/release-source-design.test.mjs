import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeReleaseBuffer} from '../source/modules/release-analysis.mjs';
const read=name=>readFileSync(new URL('../source/'+name,import.meta.url),'utf8');
test('Release Preflight reads the shared buffer without a second file or URL input',()=>{
 const source=read('modules/producer-workflows.mjs'),start=source.indexOf('function mountReleasePreflight('),end=source.indexOf('function mountVocalSessionMapper(',start);
 const release=source.slice(start,end);assert.match(release,/analyzeReleaseBuffer\(buffer/);assert.match(release,/SOURCE AUDIO/);
 assert.doesNotMatch(release,/type="file"|type="url"|completeAudo\(/);
});
test('prototype routes connect to the shared real modules',()=>{
 const page=read('index.html'),studio=read('modules/studio-redesign.mjs'),runtime=read('modules/prototype-runtime.mjs');
 assert.match(page,/id="drop"[^>]*data-open-audio/);assert.match(studio,/w\.load\(file\)/);
 assert.match(studio,/pulse:tool-mounted/);assert.match(page,/id="pulse-legacy-host" hidden/);
 assert.doesNotMatch(page,/pulse-hero-drop|pulse-tool-directory|pulse-bitrate-guide/);
 assert.doesNotMatch(read('modules/musicgpt-extraction.mjs'),/data-ext-file="|data-ext-url="|type="file"|type="url"/);
 assert.doesNotMatch(read('modules/musicgpt-voicechanger.mjs'),/data-voice-file|type="file"/);
 assert.match(read('modules/studio-reference.css'),/--accent:\s*#ff4d1c/);
});
