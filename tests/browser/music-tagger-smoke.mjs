/** Browser QA: CLAP Worker is real; runtime is mocked only for deterministic scores.
 * The actual bundled Transformers.js module is separately imported and checked.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname,join} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('public');
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
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
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(error){res.writeHead(404);res.end(String(error.message||'Not found'));}
});
const mockRuntime=[
 "export const env={allowRemoteModels:false,allowLocalModels:false,useBrowserCache:false,backends:{onnx:{wasm:{wasmPaths:'',numThreads:1}}}};",
 "export async function pipeline(task,model,options={}){",
 " if(task!=='zero-shot-audio-classification'||model!=='Xenova/clap-htsat-unfused')throw Error('Wrong model');",
 " options.progress_callback?.({status:'progress',progress:100,file:'model_quantized.onnx'});",
 " return async (audio,labels,config)=>{",
 "  if(!(audio instanceof Float32Array)||audio.length<96000||audio.length>480000)throw Error('Unexpected sample rate or duration');",
 "  if(config.hypothesis_template!=='This is a sound of {}.')throw Error('Unexpected prompt');",
 "  return labels.map((label,i)=>({label,score:i===2?.92:.02/(i+1)}));",
 " };",
 "}"
].join('\n');
async function main(){
 await mkdir('test-results',{recursive:true});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url='http://127.0.0.1:'+server.address().port+'/';
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors=[],audialCalls=[],runtimePaths=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{
   const p=request.url();
   if(p.includes('audialmusic.ai')||p.includes('/api/pulse-tags'))audialCalls.push(p);
   if(p.includes('/vendor/clap/transformers.min.js'))runtimePaths.push(p);
  });
  await page.route('**/vendor/clap/transformers.min.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:mockRuntime}));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('[data-tool="music-tagger"]').click();
  await page.locator('#audio-file').setInputFiles({name:'local-440.wav',mimeType:'audio/wav',buffer:sineWav(440)});
  await page.waitForFunction(()=>document.querySelector('#audio-meta')?.textContent?.includes('local-440'),{timeout:14000});
  await page.locator('[data-tag-action="local"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-tag-status]')?.textContent?.includes('measurements complete'),{timeout:25000});
  assert.equal(await page.locator('[data-tag-results]').isVisible(),true);
  assert.match(await page.locator('[data-tag-results]').innerText(),/CENTROID/);
  await page.locator('[data-tag-action="ai-run"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ai-status]')?.textContent?.includes('predictions ready'),{timeout:25000});
  const visible=await page.locator('[data-ai-results]').innerText();
  for(const expected of ['GENRES','MOODS','INSTRUMENTS','House','Melancholic','Drum Kit'])
   assert.ok(visible.includes(expected),'Missing: '+expected);
  assert.deepEqual(audialCalls,[]);
  assert.ok(runtimePaths.length>0,'Local runtime not requested');
  const fileEvent=page.waitForEvent('download');
  await page.locator('[data-tag-action="download"]').click();
  const file=await fileEvent,data=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(data.ai.audioUploaded,false);
  assert.equal(data.ai.device,'browser');
  assert.equal(data.ai.engine,'local-onnx-wasm');
  assert.equal(data.ai.genre[0].label,'House');
  assert.equal(data.ai.instruments[0].label,'Drum Kit');
  await page.screenshot({path:'test-results/music-tagger-desktop.png',fullPage:true});
  console.log('PASS: local FFT and CLAP Worker with mock weights classified genre mood instruments with zero Audial requests.');

  await page.locator('#audio-file').setInputFiles({name:'local-880.wav',mimeType:'audio/wav',buffer:sineWav(880)});
  await page.waitForFunction(()=>document.querySelector('[data-ai-status]')?.textContent?.includes('Source changed'),{timeout:12000});
  assert.equal(await page.locator('[data-tag-action="download"]').isDisabled(),true);
  assert.equal(await page.locator('[data-ai-results]').isVisible(),false);
  await page.locator('[data-tag-action="ai-run"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ai-status]')?.textContent?.includes('predictions ready'),{timeout:25000});
  console.log('PASS: changing SOURCE AUDIO invalidates old local tags.');

  const mobile=await browser.newPage({viewport:{width:375,height:812}});
  mobile.on('pageerror',e=>errors.push('mobile: '+e.message));
  await mobile.goto(url,{waitUntil:'domcontentloaded'});
  await mobile.locator('[data-tool="music-tagger"]').click();
  const bounds=await mobile.locator('#module-music-tagger').evaluate(el=>{
   const rect=el.getBoundingClientRect();return {left:rect.left,right:rect.right,screen:innerWidth};
  });
  assert.ok(bounds.left>=-4&&bounds.right<=bounds.screen+4,'Mobile overflow: '+JSON.stringify(bounds));
  await mobile.screenshot({path:'test-results/music-tagger-mobile.png',fullPage:true});
  console.log('PASS: mobile Music Tagger fits 375px.');

  // Validate that the actual pinned self-hosted runtime is a valid ES module.
  const runtimePage=await browser.newPage();
  await runtimePage.goto(url,{waitUntil:'domcontentloaded'});
  const runtime=await runtimePage.evaluate(async()=>{
   const lib=await import('/vendor/clap/transformers.min.js');
   return {pipeline:typeof lib.pipeline,env:typeof lib.env,onnx:!!lib.env?.backends?.onnx?.wasm};
  });
  assert.deepEqual(runtime,{pipeline:'function',env:'object',onnx:true});
  await runtimePage.close();
  console.log('PASS: real Transformers.js ESM runtime imports and exposes the local pipeline.');

  const voiceCalls=[],voicePayloads=[];
  await page.route('**/api/pulse-musicgpt',route=>{
   const payload=route.request().postDataJSON();voiceCalls.push(payload.action);voicePayloads.push(payload);
   const reply=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(payload.action==='voices')return reply({voices:[{id:'e0bb585f-b798-4bac-ac4e-de7fff38f9d75',label:'Licensed QA voice'}]});
   if(payload.action==='submit')return reply({status:'submitted',conversionId:'e3631817-165d-4f17-a7e2-7008d200ff3e'});
   return reply({status:'complete',audioUrl:'https://musicgpt.s3.amazonaws.com/fixture.mp3'});
  });
  await page.locator('[data-category="ai"]').click();
  await page.locator('[data-tool="ai2-vocals"]').click();
  await page.locator('[data-view="ai-voice-changer"]').click();
  await page.locator('[data-voice-action="submit"]').click();
  assert.match(await page.locator('[data-voice-status]').innerText(),/authorization and consent/i);
  assert.deepEqual(voiceCalls,[]);
  await page.locator('[data-voice-token]').fill('qa-owner');
  await page.locator('[data-voice-search]').fill('licensed');
  await page.locator('[data-voice-action="voices"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-voice-list]')?.options?.length===2);
  await page.locator('[data-voice-list]').selectOption('e0bb585f-b798-4bac-ac4e-de7fff38f9d75');
  await page.locator('[data-voice-consent]').check();
  await page.locator('[data-voice-action="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-voice-status]')?.textContent?.includes('Voice conversion complete'),{timeout:15000});
  assert.deepEqual(voiceCalls,['voices','submit','result']);
  assert.equal(voicePayloads[0].query,'licensed');
  assert.equal(voicePayloads[1].pitch,0);
  assert.equal(voicePayloads[1].consent,true);
  assert.equal(voicePayloads[1].authorizedVoice,true);
  const voiceWav=Buffer.from(voicePayloads[1].file.base64,'base64');
  assert.equal(voiceWav.toString('ascii',0,4),'RIFF');
  assert.ok(voiceWav.byteLength<2400000);
  assert.equal(await page.locator('[data-voice-action="submit"]').innerText(),'CONVERT AGAIN ↗');
  await page.locator('[data-voice-pitch]').fill('3');
  await page.locator('[data-voice-pitch]').press('Tab');
  assert.equal(await page.locator('[data-voice-output]').isVisible(),false,'Changed parameters must invalidate the old result.');
  await page.locator('[data-voice-action="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-voice-status]')?.textContent?.includes('Voice conversion complete'),{timeout:15000});
  assert.deepEqual(voiceCalls,['voices','submit','result','submit','result']);
  assert.equal(voicePayloads[3].pitch,3);
  console.log('PASS: MusicGPT search, consent, audio upload, result and rerun after pitch change without stale job reuse.');
  // Lyrics Generator: verify no paid request without consent, generated result and offline export.
  const lyricRequests=[];
  await page.route('**/api/pulse-lyrics',route=>{
   const body=route.request().postDataJSON();lyricRequests.push(body);
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({lyrics:'[Verse]\nCity lights keep moving\n\n[Chorus]\nNew day, new start',taskId:'task-lyrics-qa',creditEstimate:10,provider:'MusicGPT'})});
  });
  await page.locator('[data-tool="ai2-lyrics"]').click();
  assert.equal(await page.locator('[data-lyrics-theme]').count(),1);
  await page.locator('[data-lyrics-theme]').fill('Starting fresh on a late train after a concert');
  await page.locator('[data-lyrics-language]').selectOption('Czech');
  await page.locator('[data-lyrics-genre]').selectOption('Trap');
  await page.locator('[data-lyrics-keywords]').fill('night train, lights');
  await page.locator('[data-lyrics-token]').fill('test-owner-token');
  await page.locator('[data-lyrics-generate]').click();
  assert.equal(lyricRequests.length,0,'Lyrics generation must not start without consent');
  await page.locator('[data-lyrics-consent]').check();
  await page.locator('[data-lyrics-generate]').click();
  await page.waitForFunction(()=>document.querySelector('[data-lyrics-output]')?.value?.includes('[Chorus]'),{timeout:15000});
  assert.equal(lyricRequests.length,1);
  assert.equal(lyricRequests[0].action,'generate');
  assert.equal(lyricRequests[0].consent,true);
  assert.ok(lyricRequests[0].prompt.includes('Czech'));
  assert.ok(lyricRequests[0].prompt.includes('Trap'));
  assert.ok(lyricRequests[0].prompt.length<=1000);
  assert.equal(await page.locator('[data-lyrics-meta]').innerText(),'GENERATED / EST. 10 CREDITS');
  await page.locator('[data-lyrics-output]').fill('[Verse]\nEdited by the artist.');
  assert.equal(await page.locator('[data-lyrics-action="copy"]').isDisabled(),false);
  const lyricsEvent=page.waitForEvent('download');
  await page.locator('[data-lyrics-action="download"]').click();
  const lyricsFile=await lyricsEvent;
  assert.ok(lyricsFile.suggestedFilename().endsWith('.txt'));
  const exported=await readFile(await lyricsFile.path(),'utf8');
  assert.equal(exported,'[Verse]\nEdited by the artist.');
  assert.equal(lyricRequests.length,1,'Export must never call the paid API again');
  await page.screenshot({path:'test-results/musicgpt-lyrics-desktop.png',fullPage:true});
  const mobileLyrics=await browser.newPage({viewport:{width:375,height:812}});
  mobileLyrics.on('pageerror',e=>errors.push('lyrics mobile: '+e.message));
  await mobileLyrics.goto(url,{waitUntil:'domcontentloaded'});
  await mobileLyrics.locator('[data-category="ai"]').click();
  await mobileLyrics.locator('[data-tool="ai2-lyrics"]').click();
  const box=await mobileLyrics.locator('.pulse-lyrics').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,screen:innerWidth};});
  assert.ok(box.left>=-4&&box.right<=box.screen+4,'Lyrics panel exceeds mobile viewport: '+JSON.stringify(box));
  await mobileLyrics.screenshot({path:'test-results/musicgpt-lyrics-mobile.png',fullPage:true});
  console.log('PASS: MusicGPT lyrics requires consent, returns editable lyrics, exports TXT without recharging, and fits mobile.');

  assert.ok(!errors.some(e=>/music.tagger|musicgpt|Worker|Module not found/i.test(e)),errors.join('; '));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error('FAIL: Browser QA:',error);process.exitCode=1;});
