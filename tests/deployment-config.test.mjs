import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Vercel serves a static frontend rather than autodetecting Python API', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'public');
  assert.deepEqual(config.rewrites, [{source: '/', destination: '/index.html'}]);
  assert.equal(config.functions['api/studio.js'].includeFiles, 'private/studio.html');
});

test('public entry is startscreen, not studio DSP or Python FastAPI', async () => {
  const publicPage = await read('public/index.html');
  const privatePage = await read('private/studio.html');
  assert.match(publicPage, /Lifetime Access/);
  assert.match(publicPage, /access-status/);
  assert.doesNotMatch(publicPage, /ANALYSIS_WORKER_SOURCE/);
  assert.match(privatePage, /ANALYSIS_WORKER_SOURCE/);
});
