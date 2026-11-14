import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BITRATES} from '../source/modules/converter.mjs';

const read=path=>readFileSync(new URL('../source/'+path,import.meta.url),'utf8');
const html=read('index.html');
const app=read('app.mjs');
const css=read('style.css');

test('MP3 bitrate guide is attached immediately below the converter workspace and hidden by default',()=>{
 const guide=html.match(/<section class="pulse-bitrate-guide"[\s\S]*?<\/section>/)?.[0];
 assert.ok(guide,'MP3 guide must exist as a dedicated section');
 assert.match(guide,/id="pulse-bitrate-guide"[^>]*hidden/);
 assert.match(guide,/id="pulse-bitrate-title"/);
 assert.ok(html.indexOf('class="pulse-bitrate-guide"')>html.indexOf('class="tool-board editor__grid"'));
 assert.ok(html.indexOf('id="pulse-tool-directory"')<html.indexOf('class="pulse-bitrate-guide"'));
 assert.equal((guide.match(/class="pulse-bitrate-card"/g)||[]).length,5);
});

test('MP3 guide contains the five requested bitrate ranges and truthful caveats',()=>{
 for(const bitrate of [64,96,128,192,256,320])assert.ok(BITRATES.includes(bitrate),String(bitrate));
 for(const label of ['64 kbps','96 kbps','128 kbps','192 kbps','256–320 kbps'])assert.ok(html.includes('<h3>'+label+'</h3>'),label);
 for(const text of [
 'Choose an MP3 bitrate for the job.',
 'More bitrate = larger files. It cannot restore lost source quality.',
 'Speech drafts and very compact spoken-word files.',
 'Music and ambience can show obvious compression artifacts.',
 'Sibilance and complex backgrounds deserve a careful preview.',
 'Dense music can benefit from a higher setting.',
 'Cannot restore detail already lost in the source.'
 ])assert.ok(html.includes(text),text);
});

test('guide visibility follows the Converter MP3 format and unregisters listeners on cleanup',()=>{
 assert.match(app,/showBitrateGuide\(false\)/);
 assert.match(app,/definition\.id==='wav'\?host\.querySelector\('#format'\):null/);
 assert.match(app,/showBitrateGuide\(converterFormat\?\.value==='mp3'\)/);
 assert.match(app,/converterFormat\.addEventListener\('change',syncBitrateGuide\)/);
 assert.match(app,/converterFormat\?\.removeEventListener\('change',syncBitrateGuide\)/);
});

test('bitrate cards use square black panels, PULSE red values and responsive layouts',()=>{
 assert.match(css,/\.pulse-bitrate-card\{[^}]*background:#191919;[^}]*color:#f5f4f0;[^}]*border-radius:0/s);
 assert.match(css,/\.pulse-bitrate-value h3\{[^}]*color:#ff2b20/s);
 assert.match(css,/\.pulse-bitrate-guide\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/@media\(max-width:580px\)/);
});
