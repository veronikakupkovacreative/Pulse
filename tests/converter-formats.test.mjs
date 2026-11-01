import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_FORMATS,conversionOptions,buildConversionArgs,inferFormat} from '../source/modules/converter.mjs';
const expected=['mp3','wav','flac','aac','m4a','ogg','wma'];
test('seven formats are supported',()=>assert.deepEqual(AUDIO_FORMATS.map(x=>x.id),expected));
test('source extensions are inferred',()=>{assert.equal(inferFormat('test.WMA'),'wma');assert.equal(inferFormat('song.oga'),'ogg');});
test('each export format specifies an explicit codec and container',()=>{for(const format of expected){const args=buildConversionArgs('in.wav','out.'+format,{format});assert.ok(args.includes('-c:a'));assert.ok(args.includes('-f'));assert.equal(args.at(-1),'out.'+format);}});
test('input validation rejects invalid parameters',()=>{assert.throws(()=>conversionOptions({format:'wma',bitrate:500}));assert.throws(()=>conversionOptions({format:'bogus'}));assert.throws(()=>conversionOptions({format:'ogg',oggQuality:12}));});
