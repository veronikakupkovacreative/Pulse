import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import handler,{safeStemFiles,STEMS,MAX_FILE_BYTES} from '../api/pulse-extraction.js';
import {mountStemExtraction} from '../source/modules/musicgpt-extraction.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';

const KEYS=['MUSICGPT_EXTRACTION_API_KEY','PULSE_MUSICGPT_OWNER_TOKEN'];
const PRIVATE='not-a-real-provider-key',OWNER='owner-test-token-1234';
const CONVERSION_ID='dded3f43-4715-4564-88e0-b66ebc00c466';
const response=()=>({code:0,data:null,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
 status(code){this.code=code;return this;},json(body){this.data=body;return this;}});
async function setup(f){
 const before=Object.fromEntries(KEYS.map(key=>[key,process.env[key]])),saved=globalThis.fetch;
 process.env.MUSICGPT_EXTRACTION_API_KEY=PRIVATE;process.env.PULSE_MUSICGPT_OWNER_TOKEN=OWNER;
 try{await f();}finally{
  globalThis.fetch=saved;
  for(const key of KEYS){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
 }
}
async function call(body,token=OWNER,method='POST',origin){
 const res=response();
 await handler({method,body,headers:{'x-pulse-owner-token':token,host:'thepulsestudio.eu',...(origin?{origin}:{})}},res);
 return res;
}
const submit={action:'submit',consent:true,rightsConfirmed:true,
 stems:['vocals','instrumental','drums'],preprocessingOptions:['Denoise','Dereverb'],ecoMode:false,
 audioUrl:'https://youtu.be/dQw4w9WgXcQ'};

test('Extraction status is read-only and does not leak credentials',async()=>{
 await setup(async()=>{
  const r=await call(null,'','GET');
  assert.equal(r.code,200);assert.equal(r.data.configured,true);
  assert.equal(r.data.apiVersion,'v2');assert.equal(r.data.maxFileBytes,MAX_FILE_BYTES);
  assert.ok(r.data.stems.includes('lead_vocal'));assert.ok(r.data.stems.includes('hi_hat'));
  assert.equal(r.headers['cache-control'],'private, no-store, max-age=0');
  assert.doesNotMatch(JSON.stringify(r.data),/not-a-real-provider-key|owner-test-token/);
 });
});
test('Owner check, same-origin and paid consent prevent unauthorized upstream traffic',async()=>{
 await setup(async()=>{
  let requests=0;globalThis.fetch=async()=>{requests++;throw Error('unexpected network call');};
  let r=await call(submit,'invalid');assert.equal(r.code,403);assert.equal(r.data.error,'OWNER_AUTH_REQUIRED');
  r=await call(submit,OWNER,'POST','https://attacker.example');assert.equal(r.code,403);
  r=await call({...submit,consent:false});assert.equal(r.code,400);
  r=await call({...submit,rightsConfirmed:false});assert.equal(r.code,400);
  r=await call({...submit,stems:[]});assert.equal(r.code,400);
  r=await call({...submit,stems:['not_a_stem']});assert.equal(r.code,400);
  r=await call({...submit,preprocessingOptions:['ShellExecute']});assert.equal(r.code,400);
  r=await call({...submit,ecoMode:'false'});assert.equal(r.code,400);
  for(const url of ['https://evil.example/watch?v=dQw4w9WgXcQ','http://www.youtube.com/watch?v=dQw4w9WgXcQ',
   'https://www.youtube.com.evil.net/watch?v=dQw4w9WgXcQ',
   'https://www.youtube.com/playlist?list=AA','https://127.0.0.1/watch?v=dQw4w9WgXcQ']){
   r=await call({...submit,audioUrl:url});assert.equal(r.code,400,url);
  }
  r=await call({...submit,file:{name:'track.mp3',base64:'AAAA'},audioUrl:'https://youtu.be/dQw4w9WgXcQ'});
  assert.equal(r.code,400);
  assert.equal(requests,0,'No credit-bearing provider requests for invalid input');
 });
});
test('MusicGPT v2 Extraction receives the correct multipart request, stems, preprocessing and consented URL',async()=>{
 await setup(async()=>{
  const requests=[];globalThis.fetch=async(url,options)=>{
   requests.push({url:String(url),options});
   return new Response(JSON.stringify({success:true,task_id:CONVERSION_ID,conversion_id:CONVERSION_ID,
    eta:147,credit_estimate:5.55}),{status:200});
  };
  const r=await call(submit);
  assert.equal(r.code,200);assert.equal(r.data.conversionId,CONVERSION_ID);
  assert.equal(r.data.creditEstimate,5.55);assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://api.musicgpt.com/api/public/v2/Extraction');
  assert.equal(requests[0].options.method,'POST');
  assert.equal(requests[0].options.headers.Authorization,PRIVATE);
  const form=requests[0].options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('audio_url'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(form.get('audio_file'),null);
  assert.deepEqual(JSON.parse(form.get('stems')),submit.stems);
  assert.deepEqual(JSON.parse(form.get('preprocessing_options')),submit.preprocessingOptions);
  assert.equal(form.get('eco_mode'),'false');
  assert.equal(form.get('webhook_url'),null);
  assert.doesNotMatch(JSON.stringify(r.data),/owner-test-token|not-a-real-provider-key/);
 });
});
test('Short file upload is multipart, and unapproved formats or oversized files are rejected',async()=>{
 await setup(async()=>{
  let body=null;globalThis.fetch=async(_url,opts)=>{
   body=opts.body;return new Response(JSON.stringify({success:true,conversion_id:CONVERSION_ID}),{status:200});
  };
  const bytes=Buffer.alloc(2000,42),file={name:'home-recording.wav',base64:bytes.toString('base64')};
  const r=await call({...submit,audioUrl:undefined,file,stems:['vocals']});
  assert.equal(r.code,200);assert.equal(body.get('audio_url'),null);
  assert.equal(body.get('audio_file').name,'home-recording.wav');
  assert.equal(body.get('audio_file').size,2000);
  let bad=await call({...submit,audioUrl:undefined,file:{...file,name:'shell.sh'}});
  assert.equal(bad.code,400);assert.equal(bad.data.error,'INVALID_AUDIO_FORMAT');
  bad=await call({...submit,audioUrl:undefined,file:{...file,base64:'A'.repeat(3_200_008)}});
  assert.equal(bad.code,400);
 });
});
test('Extraction polling uses EXTRACTION type and safely returns all available MP3/WAV stem links',async()=>{
 await setup(async()=>{
  let urlSeen='';
  globalThis.fetch=async(url,opts)=>{
   urlSeen=String(url);
   assert.equal(opts.headers.Authorization,PRIVATE);
   return new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',
    audio_url:JSON.stringify({vocals:'https://cdn.example/voice.mp3',bass:'javascript:alert(1)',
     drums:'https://cdn.example/drums.mp3'}),
    audio_url_wav:JSON.stringify({vocals:'https://cdn.example/voice.wav'})}}),{status:200});
  };
  const r=await call({action:'result',conversionId:CONVERSION_ID});
  assert.equal(r.code,200);assert.equal(r.data.status,'complete');
  assert.deepEqual(r.data.files,[
   {stem:'vocals',audioUrl:'https://cdn.example/voice.mp3',wavUrl:'https://cdn.example/voice.wav'},
   {stem:'drums',audioUrl:'https://cdn.example/drums.mp3',wavUrl:null}
  ]);
  assert.ok(urlSeen.includes('conversionType=EXTRACTION&conversion_id='));
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'PROCESSING'}}),{status:200});
  assert.equal((await call({action:'result',conversionId:CONVERSION_ID})).data.status,'processing');
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'FAILED'}}),{status:200});
  assert.equal((await call({action:'result',conversionId:CONVERSION_ID})).data.status,'failed');
  assert.deepEqual(safeStemFiles({audio_url:'javascript:alert(1)'}),[]);
  assert.ok(STEMS.length>=20);
 });
});
test('Credit, auth and timeout errors are surfaced without fabricating stems',async()=>{
 await setup(async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({success:false,error:'Insufficient credit balance'}),{status:402});
  const credit=await call(submit);assert.equal(credit.code,402);assert.equal(credit.data.error,'INSUFFICIENT_CREDITS');
  globalThis.fetch=async()=>new Response(JSON.stringify({success:false,error:'Unauthorized'}),{status:401});
  const auth=await call(submit);assert.equal(auth.code,401);assert.equal(auth.data.error,'MUSICGPT_AUTH_FAILED');
  globalThis.fetch=async()=>{throw Error('offline')};
  const err=await call(submit);assert.equal(err.code,502);assert.equal(err.data.error,'MUSICGPT_CONNECTION_ERROR');
 });
});
test('Stem Extraction UI mounts, stays in AI Studio and replaces removed video/cloud mastering',()=>{
 const old=globalThis.document;
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 globalThis.document=document;
 try{
  const host=document.getElementById('host'),cleanup=mountStemExtraction({host});
  assert.ok(host.querySelector('[data-ext-submit]'));
  assert.ok(host.querySelector('[data-ext-token][type="password"]'));
  assert.ok(host.querySelector('[data-ext-consent]'));
  assert.ok(host.querySelector('[data-ext-pre="Dereverb"]'));
  assert.equal(host.querySelectorAll('[data-ext-stem]').length,STEMS.length);
  assert.equal(visibleToolModules.filter(x=>x.category==='ai').length,12);
  assert.ok(visibleToolModules.some(x=>x.id==='ai2-extraction'));
  assert.ok(!visibleToolModules.some(x=>x.id==='video-to-audio'));
  const master=readFileSync(new URL('../source/modules/mastering-ui.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(master,/data-master-engine|MusicGPTMasteringCloud|RUN MUSICGPT MASTERING/);
  const index=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(index,/data-open-tool="video-to-audio"/);
  const base=new URL('../',import.meta.url);
  assert.equal(existsSync(new URL('api/pulse-mastering.js',base)),false);
  assert.equal(existsSync(new URL('source/modules/video-audio-tool.mjs',base)),false);
  cleanup();
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('single-url completed Extraction outputs a playable result; empty completed job exits processing',async()=>{
 await setup(async()=>{
  const direct=safeStemFiles({audio_url:'https://cdn.example/stem.mp3'});
  assert.deepEqual(direct,[{stem:'result',audioUrl:'https://cdn.example/stem.mp3',wavUrl:null}]);
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',
   audio_url:'https://cdn.example/stem.mp3'}}),{status:200});
  const ready=await call({action:'result',conversionId:CONVERSION_ID});
  assert.equal(ready.data.status,'complete');assert.equal(ready.data.files.length,1);
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED'}}),{status:200});
  const empty=await call({action:'result',conversionId:CONVERSION_ID});
  assert.equal(empty.data.status,'complete');assert.deepEqual(empty.data.files,[]);
  assert.match(empty.data.message,/no downloadable/i);
 });
});
test('double clicking Extraction while input is loading makes one paid submission',async()=>{
 const previous={document:globalThis.document,fetch:globalThis.fetch};
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 globalThis.document=document;
 let releaseFile,paid=0;
 const pendingFile=new Promise(resolve=>{releaseFile=resolve;});
 globalThis.fetch=async(_url,options)=>{
  if(!options?.method)return {ok:true,json:async()=>({configured:true})};
  const body=JSON.parse(options.body);
  if(body.action==='submit'){paid++;return {ok:true,json:async()=>({status:'submitted',conversionId:CONVERSION_ID})};}
  return {ok:true,json:async()=>({status:'complete',files:[{stem:'vocals',audioUrl:'https://cdn.example/voice.mp3',wavUrl:null}]})};
 };
 try{
  const host=document.getElementById('host'),cleanup=mountStemExtraction({host});
  const file=host.querySelector('[data-ext-file]');
  Object.defineProperty(file,'files',{configurable:true,value:[{name:'clip.mp3',size:2000,arrayBuffer:()=>pendingFile}]});
  host.querySelector('[data-ext-token]').value='only-a-test-owner-token';
  host.querySelector('[data-ext-consent]').checked=true;
  // Allow the read-only configuration check to finish before clicking.
  for(let i=0;i<6;i++)await Promise.resolve();
  const submitButton=host.querySelector('[data-ext-submit]');
  assert.equal(submitButton.disabled,false);
  submitButton.onclick();submitButton.onclick();
  assert.equal(submitButton.disabled,true,'The first click must synchronously disable the second.');
  releaseFile(new Uint8Array(2000).buffer);
  for(let i=0;i<20;i++)await Promise.resolve();
  assert.equal(paid,1,'Only one credit-bearing API submission is allowed.');
  assert.match(host.querySelector('[data-ext-status]').textContent,/stem\(s\) ready|Submitted/);
  cleanup();
 }finally{
  if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
  if(previous.fetch===undefined)delete globalThis.fetch;else globalThis.fetch=previous.fetch;
 }
});
