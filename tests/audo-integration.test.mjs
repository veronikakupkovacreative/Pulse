import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import handler,{decodeAudoFile,statusUrl,normalizeAudoAnalysis,MAX_AUDIO_BYTES} from '../api/pulse-audo.js';
import {compareTempos,mountAudoVocalCleanup,mountAudoSfx} from '../source/modules/audo-ui.mjs';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';
import {songAnalyzerModule} from '../source/modules/focused-tools.mjs';

const response=()=>({statusCode:200,result:null,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
 status(s){this.statusCode=s;return this;},json(x){this.result=x;return this;}});
const sample={name:'demo.wav',base64:Buffer.alloc(2048,19).toString('base64')};
async function invoke(body,{method='POST',url='/api/pulse-audo?trial=1',origin='https://www.thepulsestudio.eu'}={}){
 const res=response();
 await handler({method,url,body,headers:{origin,host:'www.thepulsestudio.eu'}},res);
 return res;
}
const oldFetch=globalThis.fetch;
test('Audo does not require or leak a browser API key and discloses its free-tier limits',async()=>{
 const r=await invoke(null,{method:'GET'});
 assert.equal(r.statusCode,200);
 assert.equal(r.result.freeOnly,true);
 assert.equal(r.result.apiKeyRequired,false);
 assert.equal(r.result.maxFileBytes,MAX_AUDIO_BYTES);
 assert.equal(r.headers['cache-control'],'private, no-store, max-age=0');
});
test('Audo submit gate, consent, format validation and origin reject before network',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('no upstream calls should run');};
 try{
  const payload={action:'submit',tool:'cleanup',mode:'remove-noise',file:sample,strength:85,autoVolume:true,consent:true};
  let r=await invoke(payload,{url:'/api/pulse-audo'});
  assert.equal(r.statusCode,403);assert.equal(r.result.error,'AUDO_RATE_GATE_REQUIRED');
  r=await invoke({...payload,consent:false});assert.equal(r.statusCode,400);
  r=await invoke(payload,{origin:'https://attacker.invalid'});assert.equal(r.statusCode,403);
  r=await invoke({...payload,file:{...sample,name:'virus.sh'}});assert.equal(r.statusCode,400);
  r=await invoke({...payload,strength:101});assert.equal(r.statusCode,400);
  r=await invoke({...payload,mode:'secret-paid-tool'});assert.equal(r.statusCode,400);
  r=await invoke({action:'submit',tool:'sfx',text:'Nice sound',duration:12,format:'wav',consent:true});assert.equal(r.statusCode,400);
  r=await invoke({action:'submit',tool:'sfx',text:'Nice sound',duration:5,format:'wav',consent:false});assert.equal(r.statusCode,400);
  assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
test('Audo forwards unkeyed free cleanup media without entering paid mode',async()=>{
 const old=globalThis.fetch,oldKey=process.env.AUDO_API_KEY;
 delete process.env.AUDO_API_KEY;let captured;
 try{
  globalThis.fetch=async(url,options)=>{
   captured={url:String(url),options};
   return new Response(new Uint8Array(600).fill(42),{status:200,headers:{'Content-Type':'audio/mpeg','Audo-Processed-Seconds':'11.5'}});
  };
  const r=await invoke({action:'submit',tool:'cleanup',mode:'remove-noise',file:sample,strength:85,autoVolume:true,consent:true});
  assert.equal(r.statusCode,200);assert.equal(r.result.kind,'audio');
  assert.equal(Buffer.from(r.result.base64,'base64').length,600);
  assert.equal(r.result.processedSeconds,11.5);
  assert.equal(captured.url,'https://audo.ai/api/try/remove-noise');
  assert.equal(captured.options.method,'POST');
  assert.equal(captured.options.body.get('noise_reduction'),'85');
  assert.equal(captured.options.body.get('free'),null);
  assert.equal(captured.options.body.get('max_credits'),null);
  assert.equal(captured.options.headers.Authorization,undefined);
  assert.equal(captured.options.body.get('file').name,'demo.wav');
 }finally{globalThis.fetch=old;if(oldKey===undefined)delete process.env.AUDO_API_KEY;else process.env.AUDO_API_KEY=oldKey;}
});
test('server-only Audo key always forces free=true, never billable default',async()=>{
 const old=globalThis.fetch,oldKey=process.env.AUDO_API_KEY;
 process.env.AUDO_API_KEY='internal-test-key-not-for-clients';let headers,body;
 try{
  globalThis.fetch=async(_url,opts)=>{
   headers=opts.headers;body=opts.body;
   return new Response(JSON.stringify({bpm:152.5,key:'G minor',camelot:'6A'}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const r=await invoke({action:'submit',tool:'crosscheck',file:sample,consent:true});
  assert.equal(r.result.analysis.bpm,152.5);
  assert.equal(r.result.analysis.camelot,'6A');
  assert.equal(headers.Authorization,'Bearer internal-test-key-not-for-clients');
  assert.equal(body.get('free'),'true');
  assert.equal(body.get('max_credits'),null);
  assert.doesNotMatch(JSON.stringify(r.result),/internal-test-key-not-for-clients/);
 }finally{globalThis.fetch=old;if(oldKey===undefined)delete process.env.AUDO_API_KEY;else process.env.AUDO_API_KEY=oldKey;}
});
test('async Audo jobs use only tokenized audo.ai status URLs and never proxy user hosts',async()=>{
 const old=globalThis.fetch;
 const valid='https://audo.ai/api/try/jobs/test-job-123?t=token_123456789';
 assert.equal(statusUrl(valid),valid);
 for(const s of ['http://audo.ai/api/try/jobs/test-job-123?t=token_123456789',
  'https://audo.ai.evil.invalid/api/try/jobs/test-job-123?t=token_123456789',
  'https://audo.ai/api/try/jobs/test-job-123',
  'https://audo.ai/api/try/jobs/test-job-123?t=token_123456789&url=http://127.0.0.1']){
  assert.equal(statusUrl(s),null,s);
 }
 let seen=0;
 try{
  globalThis.fetch=async url=>{
   seen++;
   if(seen===1)return new Response(JSON.stringify({status:'processing',statusUrl:valid}),{status:202,headers:{'Content-Type':'application/json'}});
   assert.equal(String(url),valid);
   return new Response(JSON.stringify({status:'succeeded',bpm:155,key:'C minor',camelot:'5A'}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const a=await invoke({action:'submit',tool:'crosscheck',file:sample,consent:true});
  assert.equal(a.result.status,'processing');assert.equal(a.result.statusUrl,valid);
  const b=await invoke({action:'status',tool:'crosscheck',statusUrl:a.result.statusUrl},{url:'/api/pulse-audo'});
  assert.equal(b.result.status,'complete');assert.equal(b.result.analysis.bpm,155);assert.equal(seen,2);
 }finally{globalThis.fetch=old;}
});
test('SFX calls only the documented free 10-second endpoint with explicit text',async()=>{
 const old=globalThis.fetch;let path,fields;
 try{
  globalThis.fetch=async(url,opts)=>{
   path=String(url);fields=opts.body;
   return new Response(new Uint8Array(600).fill(25),{status:200,headers:{'Content-Type':'audio/wav'}});
  };
  const out=await invoke({action:'submit',tool:'sfx',text:'Heavy impact with long dark echo',duration:4.5,format:'wav',loop:false,consent:true});
  assert.equal(out.statusCode,200);assert.equal(out.result.kind,'audio');
  assert.equal(path,'https://audo.ai/api/try/sound-effect-generator');
  assert.equal(fields.get('text'),'Heavy impact with long dark echo');
  assert.equal(fields.get('duration_seconds'),'4.5');
  assert.equal(fields.get('output_format'),'wav');
 }finally{globalThis.fetch=old;}
});
test('tempo comparison handles half and double time without mutating local BPM',()=>{
 assert.equal(compareTempos(155,155.2).label,'SAME TIME');
 assert.equal(compareTempos(155,77.5).label,'DOUBLE TIME');
 assert.equal(compareTempos(77.5,155).label,'HALF TIME');
 assert.equal(compareTempos(155,NaN),null);
 assert.deepEqual(normalizeAudoAnalysis({bpm:158.37,key:'F minor',camelot:'4A'}),{bpm:158.37,key:'F minor',camelot:'4A'});
 assert.throws(()=>decodeAudoFile({...sample,name:'foo.exe'}),/INVALID_AUDIO/);
});
test('Audo tools mount under existing Audio Repair, Smart FX and Song Analyzer; no new top-level categories',()=>{
 assert.equal(aiV2Modules.length,12);
 for(const name of ['ai2-repair','ai2-fx'])assert.equal(typeof aiV2Modules.find(t=>t.id===name)?.mount,'function');
 const source=readFileSync(new URL('../source/modules/ai-v2.mjs',import.meta.url),'utf8');
 assert.match(source,/AI VOCAL CLEANUP/);
 assert.match(source,/AI SOUND EFFECTS/);
 const song=readFileSync(new URL('../source/modules/focused-tools.mjs',import.meta.url),'utf8');
 assert.match(song,/COMPARE WITH AUDO/);
 const old=globalThis.document;
 const {document}=parseHTML('<html><body><div id="host"></div></body></html>');
 globalThis.document=document;
 try{
  const host=document.getElementById('host');
  let cleanup=mountAudoVocalCleanup({host});
  assert.ok(host.querySelector('[data-audo-run]'));
  assert.ok(host.querySelector('[data-audo-consent]'));
  assert.equal(host.querySelectorAll('[data-audo-mode] option').length,2);
  assert.doesNotMatch(host.textContent,/OWNER ACCESS TOKEN|API KEY REQUIRED/i);
  cleanup();
  cleanup=mountAudoSfx({host});
  assert.equal(host.querySelectorAll('[data-audo-preset]').length,3);
  assert.ok(host.querySelector('[data-audo-prompt]'));
  cleanup();
  const songHost=document.createElement('div');
  document.body.append(songHost);
  cleanup=songAnalyzerModule.mount({host:songHost});
  assert.ok(songHost.querySelector('[data-audo-key-run]'));
  cleanup();
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
