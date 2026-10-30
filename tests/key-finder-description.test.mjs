import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Key Finder explanatory section displays provided copy and three steps', async()=>{
  const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
  const section=html.split('id="pulse-feature-key"')[1]?.split('</section>')[0]||'';
  assert.match(section,/Key<br><span>Finder\.<\/span>/);
  assert.match(section,/including Camelot notation/);
  for (const step of [
    'Load your track into the main editor.',
    'Start the key analysis in the Key Finder tab.',
    'Verify the estimated key by ear based on the displayed results.'
  ]) assert.ok(section.includes(step));
  assert.match(section,/<ol>/);
});
test('Only Key Finder shows its own text and typography responds on mobile', async()=>{
  const js=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../source/style.css',import.meta.url),'utf8');
  assert.ok(js.includes("section.hidden=section.dataset.feature!==which;"));
  assert.match(css,/\.pulse-feature-layout\s*\{\s*display: grid/);
  assert.match(css,/@media\(max-width: 580px\)/);
});
