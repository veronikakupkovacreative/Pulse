import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {inspectAudioMetadata,inspectTextMarkers} from '../source/modules/watermark-cleaner-core.mjs';
import {mountWatermarkCleaner} from '../source/modules/watermark-cleaner.mjs';

const textEncoder=new TextEncoder();
const join=(parts)=>{const n=parts.reduce((a,p)=>a+p.length,0),o=new Uint8Array(n);let pos=0;for(const p of parts){o.set(p,pos);pos+=p.length;}return o;};
function chunk(name,payload){
 const out=new Uint8Array(8+payload.length+(payload.length%2));
 out.set(textEncoder.encode(name),0);new DataView(out.buffer).setUint32(4,payload.length,true);
 out.set(payload,8);return out;
}
function wav(parts){
 const body=join(parts);const out=new Uint8Array(12+body.length);
 out.set(textEncoder.encode('RIFF'));new DataView(out.buffer).setUint32(4,out.length-8,true);
 out.set(textEncoder.encode('WAVE'),8);out.set(body,12);return out;
}
function tag3(header,payload){
 const out=new Uint8Array(4+payload.length);
 out[0]=header;out[1]=0;out[2]=0;out[3]=payload.length;
 out.set(payload,4);return out;
}
test('WAV removes INFO and BEXT metadata without modifying audio chunk bytes',()=>{
 const audio=new Uint8Array([1,2,3,4,255,128]);
 const input=wav([chunk('fmt ',new Uint8Array(16)),chunk('LIST',join([textEncoder.encode('INFO'),new Uint8Array([1,2,3,4])])),chunk('bext',new Uint8Array(11)),chunk('data',audio)]);
 const result=inspectAudioMetadata(input);
 assert.equal(result.format,'wav');assert.equal(result.changed,true);assert.equal(result.findings.length,2);
 const expected=wav([chunk('fmt ',new Uint8Array(16)),chunk('data',audio)]);
 assert.deepEqual(result.bytes,expected);
 assert.equal(result.cleanedBytes,expected.length);
 assert.deepEqual(inspectAudioMetadata(expected).findings,[]);
});
test('MP3 removes ID3v2 and ID3v1 while retaining encoded frames exactly',()=>{
 const v2=new Uint8Array(14);v2.set(textEncoder.encode('ID3'));v2[3]=4;v2[9]=4;
 const frames=new Uint8Array([255,251,144,100,1,2,3,4,5,6]);
 const v1=new Uint8Array(128);v1.set(textEncoder.encode('TAG'));
 const result=inspectAudioMetadata(join([v2,frames,v1]));
 assert.equal(result.format,'mp3');assert.deepEqual(result.findings.map(f=>f.name),['ID3v2','ID3v1']);
 assert.deepEqual(result.bytes,frames);
 assert.equal(inspectAudioMetadata(frames).changed,false);
});
test('FLAC strips comments and pictures, preserves STREAMINFO and audio frames',()=>{
 const streamInfo=new Uint8Array(34);
 const audio=new Uint8Array([255,248,1,2,3,4]);
 const file=join([textEncoder.encode('fLaC'),tag3(0,streamInfo),tag3(4,new Uint8Array([1,2,3])),tag3(128|6,new Uint8Array([4,5])),audio]);
 const result=inspectAudioMetadata(file);
 assert.equal(result.format,'flac');assert.deepEqual(result.findings.map(f=>f.name),['VORBIS COMMENT','PICTURE']);
 assert.deepEqual(result.bytes,join([textEncoder.encode('fLaC'),tag3(128,streamInfo),audio]));
});
test('bad audio containers fail closed rather than returning a fake clean file',()=>{
 assert.throws(()=>inspectAudioMetadata(new Uint8Array([1,2,3,4])),/MP3/);
 const invalid=wav([chunk('fmt ',new Uint8Array(16)),chunk('LIST',textEncoder.encode('INFO'))]);
 assert.throws(()=>inspectAudioMetadata(invalid),/fmt and data/);
 const broken=new Uint8Array([73,68,51,4,0,0,127,127,127,127,0,0]);
 assert.throws(()=>inspectAudioMetadata(broken),/Truncated ID3/);
});
test('text cleaning removes invisible carriers but preserves meaningful ZWJ',()=>{
 const src='Alpha\u200BBeta \u202EABC \u{E0001} family:\u{1F469}\u200D\u{1F4BB}';
 const result=inspectTextMarkers(src);
 assert.equal(result.removed,3);assert.equal(result.preservedJoiners,1);
 assert.ok(!result.cleaned.includes('\u200B'));assert.ok(!result.cleaned.includes('\u202E'));
 assert.ok(result.cleaned.includes('\u{1F469}\u200D\u{1F4BB}'));
 assert.deepEqual(inspectTextMarkers('plain').found,[]);
});
test('Watermark Cleaner mounts with audio and text tabs and no cloud upload',()=>{
 const old=globalThis.document;
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 globalThis.document=document;
 try{
  const host=document.getElementById('host');
  const cleanup=mountWatermarkCleaner({host});
  assert.ok(host.querySelector('[data-wm-file]'));
  assert.ok(host.querySelector('[data-wm-text-input]'));
  assert.equal(host.querySelector('[data-wm-panel="text"]').hidden,true);
  assert.equal(host.querySelector('[data-wm-download-audio]').disabled,true);
  assert.match(host.textContent,/does not detect or remove acoustic AI watermarks/);
  cleanup();assert.equal(host.children.length,0);
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
