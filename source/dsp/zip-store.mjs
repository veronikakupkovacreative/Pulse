// Small standards-compliant ZIP writer (store method only), no dependencies.
const utf8=s=>new TextEncoder().encode(s);
const crcTable=Uint32Array.from({length:256},(_,n)=>{let x=n;for(let k=0;k<8;k++)x=(x&1)?0xedb88320^(x>>>1):x>>>1;return x>>>0;});
export function crc32(data){let c=0xffffffff;for(let i=0;i<data.length;i++)c=crcTable[(c^data[i])&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const writer=(bytes)=>({u16:(at,n)=>{bytes[at]=n&255;bytes[at+1]=(n>>>8)&255;},u32:(at,n)=>{bytes[at]=n&255;bytes[at+1]=(n>>>8)&255;bytes[at+2]=(n>>>16)&255;bytes[at+3]=(n>>>24)&255;}});
export async function createStoredZip(entries){
  if(!Array.isArray(entries)||!entries.length||entries.length>1000)throw Error('ZIP musí obsahovat 1–1000 souborů.');
  let position=0,total=0;const local=[],central=[],names=new Set();
  for(const entry of entries){
    const name=String(entry.name||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');
    if(!name||names.has(name))throw Error('Duplicitní nebo prázdný název souboru.');names.add(name);
    const data=entry.data instanceof Uint8Array?entry.data:new Uint8Array(await entry.data.arrayBuffer());
    total+=data.byteLength;if(total>380*1024*1024)throw Error('ZIP překročil limit 380 MB. Vyber kratší soubor.');
    const fname=utf8(name);if(fname.length>65535||data.length>0xffffffff)throw Error('Soubor je příliš velký.');
    const crc=crc32(data),a=new Uint8Array(30+fname.length),b=new Uint8Array(46+fname.length),A=writer(a),B=writer(b);
    A.u32(0,0x04034b50);A.u16(4,20);A.u16(6,0x0800);A.u32(14,crc);A.u32(18,data.length);A.u32(22,data.length);A.u16(26,fname.length);a.set(fname,30);
    B.u32(0,0x02014b50);B.u16(4,20);B.u16(6,20);B.u16(8,0x0800);B.u32(16,crc);B.u32(20,data.length);B.u32(24,data.length);B.u16(28,fname.length);B.u32(42,position);b.set(fname,46);
    position+=a.length+data.length;local.push(a,data);central.push(b);
  }
  const centerOffset=position,centerLen=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22),E=writer(end);
  E.u32(0,0x06054b50);E.u16(8,entries.length);E.u16(10,entries.length);E.u32(12,centerLen);E.u32(16,centerOffset);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
