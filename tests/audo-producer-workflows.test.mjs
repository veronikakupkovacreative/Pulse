import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pulse-audo.js';

const sample={name:'sample.wav',base64:Buffer.alloc(2048,31).toString('base64')};
const response=()=>({statusCode:200,result:null,headers:{},setHeader(){return this;},status(code){this.statusCode=code;return this;},json(data){this.result=data;return this;}});
async function invoke(body,{url='/api/pulse-audo?trial=1',origin='https://www.thepulsestudio.eu'}={}){
 const res=response();
 await handler({method:'POST',url,body,headers:{host:'www.thepulsestudio.eu',origin}},res);
 return res;
}
const oldFetch=globalThis.fetch;

test('Release Preflight uses the free Media Info endpoint and returns structured metadata',async()=>{
 let seen;
 try{
  globalThis.fetch=async(url,options)=>{
   seen={url:String(url),form:options.body,headers:options.headers};
   return new Response(JSON.stringify({duration_seconds:184,audio:{sample_rate:48000,channels:2,bit_rate:320000},loudness:{integrated_lufs:-14.2,true_peak_dbtp:-1.1}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const r=await invoke({action:'submit',tool:'release',file:sample,detail:'full',consent:true});
  assert.equal(r.statusCode,200);assert.equal(r.result.kind,'json');
  assert.equal(seen.url,'https://audo.ai/api/try/media-info');
  assert.equal(seen.form.get('detail'),'full');
  assert.equal(seen.form.get('free'),null);
 }finally{globalThis.fetch=oldFetch;}
});

test('Vocal Session Mapper maps transcription, lyric alignment and translation to documented endpoints',async()=>{
 const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   calls.push({url:String(url),form:options.body});
   return new Response('1\\n00:00:00,000 --> 00:00:01,500\\nHello world\\n',{status:200,headers:{'Content-Type':'text/plain'}});
  };
  let r=await invoke({action:'submit',tool:'transcribe',file:sample,format:'srt',consent:true});
  assert.equal(r.result.kind,'text');assert.match(r.result.text,/Hello world/);
  r=await invoke({action:'submit',tool:'align',file:sample,scriptText:'Hello world',format:'srt',consent:true});
  assert.equal(r.result.kind,'text');
  r=await invoke({action:'submit',tool:'translate',file:sample,targetLanguage:'cs',format:'srt',consent:true});
  assert.equal(r.result.kind,'text');
  assert.deepEqual(calls.map(x=>x.url),[
   'https://audo.ai/api/try/transcribe',
   'https://audo.ai/api/try/align-script',
   'https://audo.ai/api/try/audio-translator'
  ]);
  assert.equal(await calls[1].form.get('script').text(),'Hello world');
  assert.equal(calls[2].form.get('target_language'),'cs');
 }finally{globalThis.fetch=oldFetch;}
});

test('Sample Pack Lab and Smart Sample Finder use the expected free endpoints and validated options',async()=>{
 const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   calls.push({url:String(url),form:options.body});
   return new Response(JSON.stringify({status:'succeeded',highlights:[{start:1,end:3,title:'Hook'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  for(const [body,path] of [
   [{action:'submit',tool:'removeSilence',file:sample,consent:true},'remove-silence'],
   [{action:'submit',tool:'loudness',file:sample,target:'streaming',consent:true},'loudness'],
   [{action:'submit',tool:'convert',file:sample,format:'flac',consent:true},'convert'],
   [{action:'submit',tool:'cut',file:sample,mode:'keep',ranges:[[0,1],[2,3]],consent:true},'cut'],
   [{action:'submit',tool:'join',files:[sample,{...sample,name:'second.wav'}],consent:true},'join'],
   [{action:'submit',tool:'highlights',file:sample,count:5,consent:true},'find-highlights']
  ]){
   const r=await invoke(body);assert.equal(r.statusCode,200,path);
   assert.ok(calls.at(-1).url.endsWith('/api/try/'+path),path);
  }
  assert.equal(calls[1].form.get('target'),'streaming');
  assert.equal(calls[2].form.get('format'),'flac');
  assert.equal(calls[3].form.get('ranges'),'[[0,1],[2,3]]');
  assert.equal(calls[4].form.getAll('file').length,2);
  assert.equal(calls[5].form.get('count'),'5');
 }finally{globalThis.fetch=oldFetch;}
});

test('public HTTPS file URLs work for full-file jobs while private and insecure URLs fail closed',async()=>{
 let seen;
 try{
  globalThis.fetch=async(url,options)=>{
   seen={url:String(url),form:options.body};
   return new Response(JSON.stringify({duration_seconds:900}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  let r=await invoke({action:'submit',tool:'release',fileUrl:'https://cdn.example.test/master.wav',consent:true});
  assert.equal(r.statusCode,200);assert.equal(seen.form.get('url'),'https://cdn.example.test/master.wav');
  r=await invoke({action:'submit',tool:'release',fileUrl:'http://127.0.0.1/master.wav',consent:true});
  assert.equal(r.statusCode,400);assert.equal(r.result.error,'INVALID_PUBLIC_URL');
  r=await invoke({action:'submit',tool:'release',fileUrl:'https://localhost/master.wav',consent:true});
  assert.equal(r.statusCode,400);
 }finally{globalThis.fetch=oldFetch;}
});

test('Audo is forced to free mode when a server key is present; paid fallbacks and billing links are never returned',async()=>{
 const previous=process.env.AUDO_API_KEY;process.env.AUDO_API_KEY='server-only-audo-test-key';
 let seen;
 try{
  globalThis.fetch=async(_url,options)=>{
   seen=options;
   return new Response(JSON.stringify({error:'free_limit_reached',finishUrl:'https://audo.ai/checkout',priceCredits:100}),{status:429,headers:{'Content-Type':'application/json'}});
  };
  const r=await invoke({action:'submit',tool:'release',file:sample,consent:true});
  assert.equal(seen.body.get('free'),'true');
  assert.equal(seen.body.get('max_credits'),null);
  assert.equal(seen.headers.Authorization,'Bearer server-only-audo-test-key');
  assert.equal(r.statusCode,429);assert.equal(r.result.error,'AUDO_FREE_LIMIT');
  assert.equal(JSON.stringify(r.result).includes('checkout'),false);
  assert.equal(JSON.stringify(r.result).includes('100'),false);
 }finally{globalThis.fetch=oldFetch;if(previous===undefined)delete process.env.AUDO_API_KEY;else process.env.AUDO_API_KEY=previous;}
});

test('new submissions require the exact free-trial route and explicit consent',async()=>{
 let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});};
  let r=await invoke({action:'submit',tool:'release',file:sample,consent:true},{url:'/api/pulse-audo'});
  assert.equal(r.statusCode,403);assert.equal(r.result.error,'AUDO_RATE_GATE_REQUIRED');
  r=await invoke({action:'submit',tool:'release',file:sample,consent:false});
  assert.equal(r.statusCode,400);assert.equal(r.result.error,'CLOUD_CONSENT_REQUIRED');
  assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;}
});
