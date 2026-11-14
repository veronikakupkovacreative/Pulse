import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');

test('Producer Toolkits contains the sole active Song Analyzer',()=>{
 const html=read('index.html');
 assert.match(html,/id="toolkit"/);
 assert.match(html,/data-open-tool="song-analyzer"/);
 assert.match(html,/data-open-tool="song-analyzer">Song Analyzer/);
 assert.match(html,/<span id="analyzer" aria-hidden="true"><\/span>/);
 assert.doesNotMatch(html,/<section id="analyzer" class="pulse-song-analyzer"/);
 assert.doesNotMatch(html,/src="\/song\/song-ui.mjs"/);
 assert.doesNotMatch(html,/href="\/song\/song-analyzer.css"/);
 for(const category of ['analyze','create','prepare'])
  assert.ok(html.includes('data-category="'+category+'"'),category);
 assert.match(html,/class="tool-board editor__grid"/);
 assert.match(html,/id="drop"/);
 assert.doesNotMatch(html,/id="pulse-theme-toggle"/);
});

test('active Song Analyzer shares Workspace and analyzes rhythm/harmony in workers',()=>{
 const code=read('modules/focused-tools.mjs');
 assert.match(code,/function mountSongAnalyzer/);
 assert.match(code,/analyzeRhythmInWorker/);
 assert.match(code,/analyzeHarmonyInWorker/);
 assert.match(code,/w\.ensureAudio\(\)/);
 assert.match(code,/w\.setMarkers\(beats\)/);
 assert.match(code,/w\.subscribe/);
 assert.match(code,/data-focus-action="copy"/);
 assert.doesNotMatch(code,/OPEN DETAILED ANALYZER/);
 assert.doesNotMatch(code,/getElementById\('analyzer'\)/);
});

test('active analyzer uses the canonical prototype theme, not the abandoned red-only system',()=>{
 const css=read('modules/studio-reference.css');
 const html=read('index.html');
 assert.match(css,/\.focus-song-main/);
 assert.match(css,/\.focus-song-tonality/);
 assert.match(css,/\.tool-module-host/);
 assert.doesNotMatch(html,/href="\/song\/song-analyzer.css"/);
 assert.doesNotMatch(html,/src="\/song\/song-ui.mjs"/);
});

test('build ships the active rhythm and harmony worker modules',()=>{
 const source=read('modules/focused-tools.mjs');
 const script=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(script,/readdir\(join\(source,'modules'\)\)/);
 assert.match(source,/rhythm-client\.mjs/);
 assert.match(source,/harmony-client\.mjs/);
 assert.match(read('modules/rhythm-worker.mjs'),/onmessage/);
 assert.match(read('modules/harmony-worker.mjs'),/onmessage/);
});
