/** Browser-level smoke test against the built PULSE app.
 * Runs real Chromium, a real AudioContext decoder, and the real Music Tagger Web Worker.
 * No credentials or calls to Audial are required.
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
function sineWav(frequency=440,seconds=6,rate=22050){
 const count=seconds*rate,buffer=Buffer.alloc(44+count*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
 buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);
 buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(0.35*Math.sin(2*Math.PI*frequency*i/rate)*32767),44+i*2);
 return buffer;
}
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);return res.end('Forbidden');}
  if(file===root)file=join(root,'index.html');
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(data);
 }catch(error){res.writeHead(404);res.end('Not found: '+String(error.code||error.message));}
});
async function main(){
 await mkdir('test-results',{recursive:true});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url='http://127.0.0.1:'+server.address().port+'/';
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&response.url().includes('music-tagger'))network.push(response.status()+' '+response.url());});
  let cloudCalls=0,cloudPayload=null,cloudMode='unconfigured',cloudActions=[];
  await page.route('**/api/pulse-tags',route=>{
   cloudCalls++;
   const payload=route.request().method()==='POST'?route.request().postDataJSON():null;
   if(payload){cloudPayload=payload;cloudActions.push(payload.action);}
   const reply=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(cloudMode==='unconfigured')return reply(503,{error:'AUDIAL_NOT_CONFIGURED'});
   if(payload?.action==='start')return reply(200,{analysisExeId:'exe_test123456',status:'segmentation_requested'});
   if(payload?.action==='tag')return reply(200,{analysisExeId:'exe_test123456',status:'tagging_requested'});
   if(payload?.action==='result')return reply(200,{
    analysisExeId:'exe_test123456',status:'complete',
    tags:{genre:['UK Garage','Tech House'],description:'A test track driven by rhythm and synthesis.',
      song_tags:{
       full:{moods:['energetic'],instruments:['synth bass','drum machine']},
       drums:{moods:['punchy'],instruments:['drum machine']},
       bass:{moods:['dark'],instruments:['808 bass']},
       melody:{moods:['dreamy'],instruments:['synthesizer']},
       vocals:{silent:true,moods:[],instruments:[]}
      }}
   });
   return reply(400,{error:'INVALID_ACTION'});
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('[data-tool="music-tagger"]').waitFor({timeout:12000});
  await page.locator('[data-tool="music-tagger"]').click();
  await page.locator('[data-tag-action="local"]').waitFor();
  assert.equal(await page.locator('#module-music-tagger').count(),1);
  assert.ok((await page.locator('[data-tag-status]').innerText()).includes('Load'));

  await page.locator('#audio-file').setInputFiles({name:'tagger-qa-440.wav',mimeType:'audio/wav',buffer:sineWav(440)});
  await page.waitForFunction(()=>document.querySelector('#audio-meta')?.textContent?.includes('tagger-qa-440'),{timeout:12000});
  await page.locator('[data-tag-action="local"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-tag-status]')?.textContent?.includes('Local analysis complete'),{timeout:25000});
  assert.equal(await page.locator('[data-tag-results]').isVisible(),true);
  assert.match(await page.locator('[data-tag-results]').innerText(),/SPECTRAL CENTROID/);
  const exportButton=page.locator('[data-tag-action="download"]');
  assert.equal(await exportButton.isDisabled(),false);
  const firstDownloadEvent=page.waitForEvent('download');
  await exportButton.click();
  const firstFile=await firstDownloadEvent;
  const report=JSON.parse(await readFile(await firstFile.path(),'utf8'));
  assert.equal(report.ai,null);
  assert.equal(report.acoustic.silent,false);
  assert.ok(Math.abs(report.acoustic.spectralCentroidHz-440)<100,
   '440 Hz source measured as '+report.acoustic.spectralCentroidHz+' Hz');
  assert.equal(cloudCalls,0,'Local analysis must never call cloud endpoints');
  console.log('PASS: Chromium decoded 440 Hz WAV, module Worker measured spectrum, JSON export works without upload.');

  // A second source must invalidate the first report and allow a fresh analysis.
  await page.locator('#audio-file').setInputFiles({name:'tagger-qa-880.wav',mimeType:'audio/wav',buffer:sineWav(880)});
  await page.waitForFunction(()=>document.querySelector('[data-tag-status]')?.textContent?.includes('Source changed'),{timeout:12000});
  assert.equal(await exportButton.isDisabled(),true);
  await page.locator('[data-tag-action="local"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-tag-status]')?.textContent?.includes('Local analysis complete'),{timeout:25000});
  const secondDownloadEvent=page.waitForEvent('download');
  await exportButton.click();
  const secondFile=await secondDownloadEvent;
  const newReport=JSON.parse(await readFile(await secondFile.path(),'utf8'));
  assert.ok(Math.abs(newReport.acoustic.spectralCentroidHz-880)<120);
  assert.equal(cloudCalls,0);
  console.log('PASS: replacement source invalidates old analysis and Worker measures a new tone.');

  // All model classifications remain within PULSE, never navigate to provider website.
  await page.locator('[data-tag-action="cloud-run"]').click();
  assert.match(await page.locator('[data-cloud-status]').innerText(),/consent/i);
  assert.equal(cloudCalls,0,'No explicit consent means zero requests.');
  await page.locator('[data-tag-token]').fill('qa-owner-token');
  await page.locator('[data-tag-consent]').check();
  await page.locator('[data-tag-action="cloud-run"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-cloud-status]')?.textContent?.includes('not configured'),{timeout:15000});
  assert.equal(cloudCalls,1);
  assert.equal(cloudPayload.action,'start');
  assert.equal(cloudPayload.consent,true);
  assert.equal(cloudPayload.file.name,'pulse-excerpt.wav');
  const uploadedBytes=Buffer.from(cloudPayload.file.base64,'base64');
  assert.equal(uploadedBytes.toString('ascii',0,4),'RIFF');
  assert.equal(uploadedBytes.readUInt32LE(24),44100);
  assert.ok(uploadedBytes.length<2500000);
  console.log('PASS: cloud upload occurs only after consent and uses a bounded valid excerpt from SOURCE AUDIO.');

  cloudMode='success';cloudActions=[];
  await page.locator('[data-tag-action="cloud-run"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-cloud-status]')?.textContent?.includes('AI tags ready'),{timeout:15000});
  assert.deepEqual(cloudActions,['start','tag','result']);
  assert.equal(await page.locator('[data-cloud-results]').isVisible(),true);
  const rendered=await page.locator('[data-cloud-results]').innerText();
  for(const label of ['GENRES','UK Garage','Tech House','MOODS','energetic','INSTRUMENTS','808 bass','FULL MIX','DRUMS','BASS','MELODY','VOCALS'])
   assert.ok(rendered.includes(label),'Missing in-PULSE model tags: '+label);
  assert.match(rendered,/No audible vocals detected/);
  const cloudDownloadEvent=page.waitForEvent('download');
  await page.locator('[data-tag-action="download"]').click();
  const cloudDownload=await cloudDownloadEvent;
  const cloudReport=JSON.parse(await readFile(await cloudDownload.path(),'utf8'));
  assert.deepEqual(cloudReport.ai.genre,['UK Garage','Tech House']);
  assert.equal(cloudReport.ai.song_tags.vocals.silent,true);
  const startCount=cloudActions.filter(x=>x==='start').length;
  await page.locator('[data-tag-action="cloud-run"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-cloud-status]')?.textContent?.includes('AI tags ready'),{timeout:15000});
  assert.equal(cloudActions.filter(x=>x==='start').length,startCount,'Already processed job should resume without an extra upload.');
  assert.equal(new URL(page.url()).origin,new URL(url).origin,'AI tagging must not redirect outside PULSE');
  console.log('PASS: automatic AI genre/mood/instrument tagging completes in-page, shows all five stem groups, supports JSON export and resumable polling.');

  await page.screenshot({path:'test-results/music-tagger-desktop.png',fullPage:true});
  const mobile=await browser.newPage({viewport:{width:375,height:812},deviceScaleFactor:1});
  mobile.on('pageerror',error=>errors.push('mobile: '+error.message));
  await mobile.goto(url,{waitUntil:'domcontentloaded'});
  await mobile.locator('[data-tool="music-tagger"]').click();
  const box=await mobile.locator('#module-music-tagger').evaluate(el=>{
   const rect=el.getBoundingClientRect();
   return {left:rect.left,right:rect.right,width:rect.width,screen:window.innerWidth,scroll:el.scrollWidth};
  });
  assert.ok(box.right<=box.screen+4&&box.left>=-4,'Tagger panel exceeds 375px viewport: '+JSON.stringify(box));
  await mobile.screenshot({path:'test-results/music-tagger-mobile.png',fullPage:true});
  assert.deepEqual(network,[],'Music Tagger resources should load successfully');
  assert.ok(!errors.some(e=>/music.tagger|Music Tagger|music-tagger|failed to load/i.test(e)),
   'Module runtime error: '+errors.join('; '));
  console.log('PASS: narrow mobile panel fits viewport and no Music Tagger resource/runtime failures.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error('FAIL: Music Tagger real-browser QA:',error);process.exitCode=1;});
