import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const files=[
  'source/index.html','source/style.css','source/app.mjs','source/tools.mjs',
  'source/studio-audio.mjs','source/production-worker.mjs','source/youtube.mjs',
  'source/core/audio-workspace.mjs','source/core/project-session.mjs',
  'source/core/media-loader.mjs','source/dsp/production-tools.mjs',
  'source/dsp/quick-tools.mjs','source/dsp/mastering.mjs',
  'source/dsp/harmonic-workflow.mjs','source/dsp/zip-store.mjs'
];
test('all shipped interface text and diagnostics are English',async()=>{
  for(const path of files){
    const content=await readFile(new URL('../'+path,import.meta.url),'utf8');
    assert.doesNotMatch(content,/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/,path+' still contains Czech text');
  }
  const html=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
  assert.match(html,/<html lang="en">/);
  assert.match(html,/Choose file/);
});

test('localization scan catches untranslated producer-facing phrases without diacritics',async()=>{
  const files=['source/index.html','source/app.mjs','source/tools.mjs','source/style.css','source/studio-audio.mjs'];
  // Known Czech terms without accents would evade the diacritic-only safeguard.
  const untranslated=/\b(?:Nejprve|Zkopirovat|Vyber|Nahrat|Nastaveni|Zpracovani|Ulozit|Stahnout|Puvodni|Vysledek|Analyzovat|Preskocit|Prehrat|Smycka|Takt|Chyba vypoctu|Nektery soubor|Soubor je)\b/i;
  for(const name of files){
    const source=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.doesNotMatch(source,untranslated,name+' contains likely untranslated copy');
  }
});
