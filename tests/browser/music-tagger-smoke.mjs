/** Headless Chromium QA for PULSE Music Tagger local AI and MusicGPT Vocal Studio.
 * The model RUNTIME is mocked for deterministic CLAP UI tests; no pretrained weights are
 * downloaded in default CI. Production worker uses the real bundled Transformers.js.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname,join} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('public');
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html',
 '.wasm':'application/wasm','.json':'application/json','.png':'image/png','.svg':'image/svg+xml',
 '.woff2':'font/woff2','.mp3':'audio/mpeg'};
function sineWav(hz=440,seconds=6,rate=22050){
 const count=seconds*rate,bytes=Buffer.alloc(44+count*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
 bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
 bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);
 bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)bytes.writeInt16LE(Math.round(.35*Math.sin(2*Math.PI*hz*i/rate)*32767),44+i*2);
 return bytes;
}
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);return res.end('Forbidden');}
  if(file===root)file=join(root,'index.html');
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(error){res.writeHead(404);res.end(String(error.message||'Not found'));}
});
const mockRuntime=String.raw