/**
 * Conservative, lossless metadata cleanup for audio-only ISO BMFF / M4A.
 * Inspired by watermark-remover-plus (MIT, CSGonzalez22).
 *
 * Instead of shrinking moov and invalidating stco/co64 chunk offsets, selected
 * metadata-only atoms are overwritten by same-size "free" atoms. Encoded mdat
 * bytes, chunk offsets, timestamps, and sample tables remain byte-for-byte
 * unchanged. This does not remove acoustic watermarks or arbitrary C2PA boxes.
 */
const read32=(u,p)=>((u[p]*0x1000000)+(u[p+1]<<16)+(u[p+2]<<8)+u[p+3])>>>0;
const boxType=(u,p)=>String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]);
const label=(name,bytes)=>({name,bytes});
const MAX_ATOMS=8192;
const META_CHILDREN=new Set(['ilst','keys']);
const USER_DATA=new Set(['©nam','©ART','©alb','©day','©gen','©too','©wrt','©cmt','cprt','name','desc']);
const FREE=[102,114,101,101];

function* atoms(u,start,end){
 let p=start,seen=0;
 while(p<end){
  if(++seen>MAX_ATOMS)throw Error('Too many M4A atoms; file was not changed.');
  if(p+8>end)throw Error('Truncated M4A atom header; file was not changed.');
  const size32=read32(u,p),type=boxType(u,p+4);
  let header=8,size=size32;
  if(size32===1){
   if(p+16>end)throw Error('Truncated extended M4A atom.');
   const big=(BigInt(read32(u,p+8))<<32n)|BigInt(read32(u,p+12));
   if(big>BigInt(Number.MAX_SAFE_INTEGER))throw Error('M4A atom is too large.');
   size=Number(big);header=16;
  }else if(size32===0){
   size=end-p;
  }
  if(size<header||size>end-p)throw Error('Invalid M4A atom size; no changes made.');
  yield {start:p,end:p+size,type,header,size};
  p+=size;
 }
}

function collectMetadata(u,moov,edits){
 const inspectMeta=meta=>{
  // The ISO 'meta' box is a FullBox: version + flags precede its child atoms.
  if(meta.end<meta.start+meta.header+4)throw Error('Invalid M4A meta atom.');
  for(const atom of atoms(u,meta.start+meta.header+4,meta.end)){
   if(META_CHILDREN.has(atom.type)){
    edits.push({atom,name:atom.type==='ilst'?'M4A TAGS (ilst)':'M4A KEYS'});
   }
  }
 };
 const inspectUdta=udta=>{
  for(const atom of atoms(u,udta.start+udta.header,udta.end)){
   if(atom.type==='meta')inspectMeta(atom);
   else if(USER_DATA.has(atom.type))edits.push({atom,name:'USER DATA ('+atom.type+')'});
  }
 };
 for(const atom of atoms(u,moov.start+moov.header,moov.end)){
  if(atom.type==='udta')inspectUdta(atom);
  else if(atom.type==='meta')inspectMeta(atom);
 }
}

export function inspectM4aMetadata(input){
 const u=input instanceof Uint8Array?input:new Uint8Array(input);
 if(u.length<24||boxType(u,4)!=='ftyp')throw Error('Invalid M4A / MP4 header.');
 let hasMoov=false,hasMdat=false,hasFtyp=false;
 const edits=[];
 for(const box of atoms(u,0,u.length)){
  if(box.type==='ftyp'){
   if(box.start!==0||box.size<16)throw Error('Invalid M4A ftyp atom.');
   hasFtyp=true;
  }else if(box.type==='moov'){
   hasMoov=true;collectMetadata(u,box,edits);
  }else if(box.type==='mdat'){
   hasMdat=true;
  }
 }
 if(!hasFtyp||!hasMoov||!hasMdat)throw Error('M4A must contain ftyp, moov, and mdat atoms.');
 if(!edits.length)return {format:'m4a',findings:[],bytes:u.slice(),neutralizedBytes:0};
 const result=u.slice();
 for(const {atom} of edits){
  // An equally-sized free box is explicitly allowed by ISO BMFF. This preserves
  // every absolute sample offset even in fast-start files (moov before mdat).
  result.set(FREE,atom.start+4);
  result.fill(0,atom.start+atom.header,atom.end);
 }
 return {
  format:'m4a',
  findings:edits.map(({atom,name})=>label(name,atom.size)),
  neutralizedBytes:edits.reduce((n,{atom})=>n+atom.size-atom.header,0),
  bytes:result
 };
}
