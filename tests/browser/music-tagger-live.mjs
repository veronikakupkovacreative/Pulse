/** Optional real ONNX inference smoke. Downloads actual CLAP weights in CI on first run. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,join,sep,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('public');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
 '.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml'};
function wav(rate=48000,seconds=6){
 const frames=rate*seconds,bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
 bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
 bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);
 bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++){
  const t=i/rate,signal=.22*Math.sin(t*2*Math.PI*440)+.18*Math.sin(t*2*Math.PI*220)+
   ((i%12000<450)?(.18*Math.sin(t*2*Math.PI*65)*Math.exp(-(i%12000)/180)):0);
  bytes.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(signal*32767))),44+i*2);
 }
 return bytes;
}
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);return res.end('Forbidden');}
  if(file===root)file=join(root,'index.html');
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(error){res.writeHead(404);res.end(String(error.code||error));}
});
async function run(){
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const badRequests=[],workerLogs=[];
  page.on('pageerror',e=>workerLogs.push(e.message));
  page.on('request',req=>{
   if(req.url().includes('audialmusic.ai')||req.url().includes('/api/pulse-tags'))badRequests.push(req.url());
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-tool="music-tagger"]').click();
  await page.locator('#audio-file').setInputFiles({name:'real-clap.wav',mimeType:'audio/wav',buffer:wav()});
  await page.waitForFunction(()=>document.querySelector('#audio-meta')?.textContent?.includes('real-clap'),{timeout:15000});
  await page.locator('[data-tag-action="ai-run"]').click();
  await page.waitForFunction(()=>{
   const s=document.querySelector('[data-ai-stage]')?.textContent;
   return s==='COMPLETE'||s==='ERROR';
  },null,{timeout:780000});
  const stage=(await page.locator('[data-ai-stage]').innerText()).trim();
  const status=await page.locator('[data-ai-status]').innerText();
  assert.equal(stage,'COMPLETE','Full pretrained CLAP inference failed: '+status+' // '+workerLogs.join('; '));
  assert.equal(await page.locator('[data-ai-results]').isVisible(),true);
  const output=await page.locator('[data-ai-results]').innerText();
  for(const heading of ['GENRES','MOODS','INSTRUMENTS'])assert.ok(output.includes(heading),'Missing '+heading);
  assert.deepEqual(badRequests,[]);
  console.log('LIVE MODEL PASS: actual quantized CLAP weights downloaded and inferred in Chromium. '+status);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error('LIVE MODEL FAIL:',error);process.exitCode=1;});
