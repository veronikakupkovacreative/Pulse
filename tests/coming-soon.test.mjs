import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
const bundle=await readFile(new URL('../index.html',import.meta.url),'utf8');
const toolkit=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
const build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');

test('YouTube is a visibly disabled roadmap tab in source and deployed HTML',()=>{
  for(const html of [source,bundle]){
    assert.match(html,/id="tab-youtube"[^>]*aria-disabled="true"[^>]*disabled/);
    assert.match(html,/YouTube Audio <b>COMING SOON<\/b>/);
    assert.doesNotMatch(html,/id="yt-url"|id="yt-download"|id="yt-check"|id="youtube-source"/);
  }
});

test('Active audio toolkit never attempts YouTube API calls',()=>{
  assert.doesNotMatch(toolkit,/initYoutubeTool|selectTab\('youtube'\)|\['converter','key','cutter','youtube'\]/);
  assert.doesNotMatch(build, /noExports\(youtube\)|read\('youtube\.mjs'\)/);
  assert.doesNotMatch(bundle,/function initYoutubeTool\(/);
});
