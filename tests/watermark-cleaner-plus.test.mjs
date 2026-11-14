import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {inspectAudioMetadata,inspectTextMarkers} from '../source/modules/watermark-cleaner-core.mjs';
import {mountWatermarkCleaner} from '../source/modules/watermark-cleaner.mjs';

const ascii=s=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)));
const join=pieces=>{
 const n=pieces.reduce((v,p)=>v+p.length,0),out=new Uint8Array(n);let offset=0;
 for(const item of pieces){out.set(item,offset);offset+=item.length;}
 return out;
};
function box(type,bytes){
 const out=new Uint8Array(8+bytes.length);
 new DataView(out.buffer).setUint32(0,out.length,false);
 out.set(ascii(type),4);out.set(bytes,8);
 return out;
}
function fixture({tagged=true,moovFirst=true}={}){
 const ftyp=box('ftyp',join([ascii('M4A '),new Uint8Array(4)]));
 const music=new Uint8Array([0x11,0x12,0x00,0x22,0x33,0xab,0xcc,0x12]);
 const mdat=box('mdat',music);
 const hdlr=box('hdlr',new Uint8Array(24));
 const tags=box('ilst',ascii('ARTIST=Personal Test'));
 const keys=box('keys',ascii('MetadataKey'));
 const meta=box('meta',join([new Uint8Array(4),hdlr,...tagged?[tags,keys]:[]]));
 const moov=box('moov',box('udta',meta));
 return {input:join([ftyp,...moovFirst?[moov,mdat]:[mdat,moov]]),ftyp,moov,mdat,tags,keys,music};
}
test('M4A neutralizes iTunes tags while preserving mdat and file byte offsets',()=>{
 const {input,ftyp,moov,mdat,tags,keys}=fixture();
 const result=inspectAudioMetadata(input);
 assert.equal(result.format,'m4a');
 assert.equal(result.extension,'m4a');
 assert.equal(result.changed,true);
 assert.deepEqual(result.findings.map(x=>x.name),['M4A TAGS (ilst)','M4A KEYS']);
 assert.equal(result.bytes.length,input.length,'No atom-size changes, so sample offsets remain valid');
 assert.equal(result.metadataBytesRemoved,0);
 assert.equal(result.neutralizedBytes,tags.length-8+keys.length-8);
 assert.deepEqual(result.bytes.subarray(ftyp.length+moov.length),mdat,'Encoded audio is unchanged');
 const raw=new TextDecoder('latin1').decode(result.bytes);
 assert.ok(raw.includes('free'));assert.ok(!raw.includes('Personal Test'));
 assert.equal(inspectAudioMetadata(result.bytes).changed,false,'Cleaning again is idempotent');
});
test('M4A metadata patch also preserves audio when moov comes after mdat',()=>{
 const {input,ftyp,mdat}=fixture({moovFirst:false});
 const result=inspectAudioMetadata(input);
 assert.equal(result.changed,true);
 assert.deepEqual(result.bytes.subarray(0,ftyp.length+mdat.length),input.subarray(0,ftyp.length+mdat.length));
});
test('Clean M4A is reported unchanged, and malformed atom sizes fail closed',()=>{
 const {input}=fixture({tagged:false});
 const result=inspectAudioMetadata(input);
 assert.equal(result.changed,false);assert.deepEqual(result.bytes,input);
 const bad=input.slice();
 new DataView(bad.buffer).setUint32(0,bad.length+999,false);
 assert.throws(()=>inspectAudioMetadata(bad),/atom size/i);
});
test('Opt-in text normalization repairs mixed-script confusables only',()=>{
 const source='PАY Αθήνα Café \u200B 😊\u200D💻';
 const unchanged=inspectTextMarkers(source);
 assert.ok(unchanged.cleaned.includes('PАY'));
 assert.ok(unchanged.cleaned.includes('Αθήνα'));
 const cleaned=inspectTextMarkers(source,{homoglyphs:true});
 assert.ok(cleaned.cleaned.includes('PAY'));
 assert.ok(cleaned.cleaned.includes('Αθήνα'),'Greek-only words must be preserved');
 assert.ok(cleaned.cleaned.includes('Café'),'Accents must be preserved');
 assert.ok(cleaned.cleaned.includes('😊\u200D💻'),'Emoji joiners must be preserved');
 assert.equal(cleaned.removed,1);
 assert.equal(cleaned.normalizations.homoglyphs,1);
});
test('Opt-in space, typography, NFKC transforms are separately controlled',()=>{
 const raw='„Hello“ — café\u00A0１２';
 assert.equal(inspectTextMarkers(raw).cleaned,raw);
 const typ=inspectTextMarkers(raw,{typography:true});
 assert.ok(typ.cleaned.includes('"Hello" -'));
 assert.ok(typ.cleaned.includes('\u00A0１２'));
 const combined=inspectTextMarkers(raw,{typography:true,spaces:true,nfkc:true});
 assert.equal(combined.cleaned,'"Hello" - café 12');
 assert.ok(combined.normalizations.typography>0);
 assert.ok(combined.normalizations.spaces>0);
 assert.equal(combined.normalizations.nfkc,1);
});
test('PULSE uses shared SOURCE AUDIO for metadata and preserves optional text normalization controls',()=>{
 const old=globalThis.document;
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 globalThis.document=document;
 try{
  const host=document.getElementById('host');
  const cleanup=mountWatermarkCleaner({host});
  assert.ok(host.querySelector('[data-wm-scan-audio]'));
  assert.equal(host.querySelector('[data-wm-file]'),null);
  const opts=[...host.querySelectorAll('[data-wm-option]')];
  assert.deepEqual(opts.map(x=>x.dataset.wmOption),['homoglyphs','typography','spaces','nfkc']);
  assert.ok(opts.every(x=>!x.checked),'Visible content must not be modified without opt-in');
  assert.match(host.textContent,/acoustic AI watermarks/);
  cleanup();
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
