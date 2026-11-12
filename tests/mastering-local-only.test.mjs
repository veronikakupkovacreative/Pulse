import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const file=path=>new URL('../'+path,import.meta.url);
const source=path=>readFileSync(file(path),'utf8');

test('removed MusicGPT Mastering cannot be mounted or called from this build',()=>{
 assert.equal(existsSync(file('api/pulse-mastering.js')),false);
 assert.equal(existsSync(file('source/modules/musicgpt-mastering.mjs')),false);
 assert.equal(existsSync(file('tests/musicgpt-mastering.test.mjs')),false);
 const app=source('source/modules/mastering-ui.mjs');
 const index=source('source/modules/index.mjs');
 const vercel=JSON.parse(source('vercel.json'));
 assert.equal(Object.hasOwn(vercel.functions,'api/pulse-mastering.js'),false);
 assert.doesNotMatch(app,/MUSICGPT|musicgpt-mastering|cloudController|data-master-cloud|data-master-engine|pulse-mastering/i);
 assert.doesNotMatch(index,/Cloud mastering is optional/);
 assert.doesNotMatch(source('source/modules/ui.css'),/pulse-master-cloud|pulse-master-engines/);
 assert.doesNotMatch(source('source/modules/pulse-design-system.css'),/MUSICGPT REFERENCE MASTERING|pulse-mg-master/);
});

test('working local mastering controls and reference comparison remain available',()=>{
 const app=source('source/modules/mastering-ui.mjs');
 const engine=source('source/modules/mastering-worker.mjs');
 const copy=source('source/modules/ai-v2-copy.mjs');
 assert.match(app,/data-master-reference/);
 assert.match(app,/data-master-action="match"/);
 assert.match(app,/data-master-auto/);
 assert.match(app,/data-master-action="analyze"/);
 assert.match(app,/data-master-action="render"/);
 assert.match(app,/data-master-action="listen"/);
 assert.match(app,/data-master-ab="a"/);
 assert.match(app,/data-master-ab="b"/);
 assert.match(app,/data-master-ab="c"/);
 assert.match(app,/data-master-action="export"/);
 assert.match(app,/runMasteringWorker\('render'/);
 assert.match(app,/runMasteringWorker\('reference'/);
 assert.match(engine,/planReferenceMastering/);
 const masteringCopy=copy.split("'ai2-mastering':{")[1].split("'ai2-stereo':{")[0];
 assert.ok(masteringCopy,'AI Mastering tool copy must exist');
 assert.match(masteringCopy,/LOCAL MASTERING|LOCAL DSP|browser/i);
 assert.doesNotMatch(masteringCopy,/MusicGPT|cloud reference mastering|paid API/i);
});
