import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
const toolkit=await readFile(new URL('../source/tools.mjs',import.meta.url),'utf8');
const build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');
const controller=await readFile(new URL('../source/youtube.mjs',import.meta.url),'utf8');

test('YouTube Converter belongs to EXPORT and is interactive',()=>{
 assert.match(source,/id="tab-youtube"[^>]*data-tool="youtube"[^>]*data-group="export"/);
 assert.match(source,/id="panel-youtube"/);
 for(const id of ['yt-url','yt-format','yt-download','yt-permission','yt-check','yt-save-link']){
   assert.match(source,new RegExp('id="'+id+'"'));
 }
 for(const value of ['wav24','wav16','mp3','m4a','flac','mp4','native']){
   assert.match(source,new RegExp('value="'+value+'"'));
 }
 assert.match(toolkit,/export:\['converter','normalizer','youtube'\]/);
 assert.match(build,/noExports\(youtube\)/);
 assert.match(build,/read\('youtube.mjs'\)/);
 assert.match(controller,/initYoutubeTool/);
});
test('Existing AI Mix and Equalizer remain selectable',()=>{
 assert.match(source,/id="tab-mix"[^>]+data-tool="mix"/);
 assert.match(source,/id="tab-equalizer"[^>]+data-tool="equalizer"/);
});
