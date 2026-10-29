import test from 'node:test';
import assert from 'node:assert/strict';
import {audioFileError} from '../source/file-support.mjs';
const file=(name,type='audio/mp4',size=1024)=>({name,type,size});
test('iPhone Files M4A and AAC files are supported',()=>{
  for(const ext of ['m4a','aac','caf','aif','aiff','flac','mp3','wav','mp4']){
    assert.equal(audioFileError(file('take.'+ext,'',1024)),null,ext);
  }
});
test('MIME-based audio from Files works with extensionless names',()=>{
  assert.equal(audioFileError(file('recording','audio/x-m4a')),null);
  assert.equal(audioFileError(file('recording','audio/mp4')),null);
  assert.equal(audioFileError(file('recording','video/mp4')),null);
});
test('rejects unsupported content, unavailable iCloud placeholders and oversized files',()=>{
  assert.match(audioFileError(file('notes.pdf','application/pdf')),/Unsupported/);
  assert.match(audioFileError(file('take.m4a','audio/mp4',0)),/empty or not available/);
  assert.match(audioFileError(file('take.m4a','audio/mp4',101*1024*1024)),/100 MB/);
});
