/**
 * PULSE / Watermark Cleaner.
 * Local, lossless metadata inspection for WAV, MP3 and FLAC plus conservative
 * Unicode cleanup. This does NOT remove embedded acoustic watermarks.
 * Concept inspired by guillaumemeyer/watermarks-remover (MIT).
 */
export const MAX_AUDIO_BYTES=128*1024*1024;
const four=(u,o)=>String.fromCharCode(u[o],u[o+1],u[o+2],u[o+3]);
const read32=(u,o)=>(u[o]+u[o+1]*256+u[o+2]*65536+u[o+3]*16777216)>>>0;
const write32=(u,o,v)=>{u[o]=v&255;u[o+1]=(v>>>8)&255;u[o+2]=(v>>>16)&255;u[o+3]=(v>>>24)&255;};
const mime={wav:'audio/wav',mp3:'audio/mpeg',flac:'audio/flac'};
const concat=pieces=>{
 const size=pieces.reduce((n,p)=>n+p.length,0);
 const out=new Uint8Array(size);let offset=0;
 for(const p of pieces){out.set(p,offset);offset+=p.length;}
 return out;
};
const label=(name,bytes)=>({name,bytes});
function inspectWav(u){
 if(u.length<44||four(u,0)!=='RIFF'||four(u,8)!=='WAVE')throw Error('Invalid RIFF/WAVE file.');
 const declared=read32(u,4)+8;
 if(declared>u.length||declared<44)throw Error('Truncated WAV data; no file was changed.');
 let offset=12,hasFormat=false,hasAudio=false;
 const kept=[],findings=[];
 const optional=new Set(['bext','iXML','axml','XMP ','ID3 ','id3 ','DISP','C2PA','c2pa','JUMF']);
 while(offset<declared){
  if(offset+8>declared)throw Error('Damaged WAV chunk header.');
  const id=four(u,offset),length=read32(u,offset+4);
  const end=offset+8+length;
  const padded=end+(length%2);
  if(end>declared||padded>declared)throw Error('Damaged WAV chunk size.');
  if(id==='fmt ')hasFormat=true;
  if(id==='data')hasAudio=true;
  const isMetadata=optional.has(id)||(id==='LIST'&&length>=4&&four(u,offset+8)==='INFO');
  if(isMetadata)findings.push(label(id==='LIST'?'LIST / INFO':id,padded-offset));
  else kept.push(u.subarray(offset,padded));
  offset=padded;
 }
 if(!hasFormat||!hasAudio)throw Error('WAV must contain fmt and data chunks.');
 if(!findings.length)return {format:'wav',findings,bytes:u.slice()};
 const tail=u.subarray(declared);
 const size=12+kept.reduce((n,c)=>n+c.length,0);
 const header=u.slice(0,12);write32(header,4,size-8);
 return {format:'wav',findings,bytes:concat([header,...kept,tail])};
}
function inspectMp3(u){
 if(u.length<4)throw Error('Invalid MP3 file.');
 let start=0,end=u.length;const findings=[];
 if(u.length>=10&&u[0]===73&&u[1]===68&&u[2]===51){
  const ver=u[3],flags=u[5];
  if(ver<2||ver>4||[u[6],u[7],u[8],u[9]].some(b=>b>127))throw Error('Invalid ID3 header.');
  const tagSize=(u[6]<<21)|(u[7]<<14)|(u[8]<<7)|u[9];
  const footer=ver===4&&(flags&16)?10:0;
  start=10+tagSize+footer;
  if(start>=end)throw Error('Truncated ID3 tag; no file was changed.');
  findings.push(label('ID3v2',start));
 }else if(!(u[0]===255&&(u[1]&224)===224)){
  throw Error('This file is not a supported MP3 stream.');
 }
 if(end-start>=128&&u[end-128]===84&&u[end-127]===65&&u[end-126]===71){
  end-=128;findings.push(label('ID3v1',128));
 }
 return {format:'mp3',findings,bytes:(start||end!==u.length)?u.slice(start,end):u.slice()};
}
function inspectFlac(u){
 if(u.length<42||four(u,0)!=='fLaC')throw Error('Invalid FLAC file.');
 const retained=[],findings=[];let off=4,finished=false,hasStreamInfo=false,blocks=0;
 const drop=new Map([[2,'APPLICATION'],[4,'VORBIS COMMENT'],[6,'PICTURE']]);
 while(!finished){
  if(off+4>u.length||++blocks>128)throw Error('Invalid FLAC metadata blocks.');
  const flag=u[off],type=flag&127,len=(u[off+1]<<16)|(u[off+2]<<8)|u[off+3];
  const end=off+4+len;
  if(end>u.length)throw Error('Truncated FLAC metadata block.');
  if(blocks===1&&(type!==0||len!==34))throw Error('FLAC is missing a valid STREAMINFO block.');
  if(type===0)hasStreamInfo=true;
  if(drop.has(type))findings.push(label(drop.get(type),len+4));
  else retained.push(u.subarray(off,end));
  finished=Boolean(flag&128);off=end;
 }
 if(!hasStreamInfo||off>=u.length)throw Error('FLAC audio frames not found.');
 if(!findings.length)return {format:'flac',findings,bytes:u.slice()};
 const output=new Uint8Array(4+retained.reduce((n,c)=>n+c.length,0)+(u.length-off));
 output.set(u.subarray(0,4));let pos=4;
 for(let i=0;i<retained.length;i++){
  output.set(retained[i],pos);
  output[pos]=(output[pos]&127)|(i===retained.length-1?128:0);
  pos+=retained[i].length;
 }
 output.set(u.subarray(off),pos);
 return {format:'flac',findings,bytes:output};
}
export function inspectAudioMetadata(buffer){
 const u=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 if(!u.length||u.length>MAX_AUDIO_BYTES)throw Error('Choose an audio file up to 128 MB.');
 let report;
 if(u.length>=12&&four(u,0)==='RIFF'&&four(u,8)==='WAVE')report=inspectWav(u);
 else if(u.length>=4&&four(u,0)==='fLaC')report=inspectFlac(u);
 else report=inspectMp3(u);
 return {...report,changed:report.findings.length>0,originalBytes:u.length,cleanedBytes:report.bytes.length,
  metadataBytesRemoved:u.length-report.bytes.length,mime:mime[report.format],extension:report.format};
}
// Deliberately keep ZWJ/ZWNJ: they are meaningful in many scripts and emoji.
const MARKS=/[\u200B\u2060\uFEFF\u00AD\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/gu;
export function inspectTextMarkers(value){
 if(typeof value!=='string')throw TypeError('Text input must be a string.');
 const matches=[...value.matchAll(MARKS)];
 const preserved=(value.match(/[\u200C\u200D]/g)||[]).length;
 return {removed:matches.length,preservedJoiners:preserved,cleaned:value.replace(MARKS,''),
  found:matches.map(m=>'U+'+m[0].codePointAt(0).toString(16).toUpperCase())};
}
