import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import handler from '../api/pulse-musicai-v2.js';
import {mountMusicAIV2} from '../source/modules/musicgpt-musicai.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';

const SECRET_KEYS=['MUSICGPT_MUSICAI_V2_API_KEY','PULSE_MUSICGPT_OWNER_TOKEN'];
const OWNER='owner-only-test-token';
const API='fake-musicai-key';
const idA='2872d9a6-4abe-4a8f-a04f-5540c4ef0a1a',idB='dda98922-d5e9-4fc9-accd-4fc1f0729234';
const response=()=>({code:0,data:null,headers:{},setHeader(key,value){this.headers[key.toLowerCase()]=value;return this;},
 status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
const call=async(body,token=OWNER,method='POST',origin)=>{
 const res=response();
 await handler({method,body,headers:{'x-pulse-owner-token':token,host:'pulse.example',...(origin?{origin}:{})}},res);
 return res;
};
const mock=async(action)=>{
 const before=Object.fromEntries(SECRET_KEYS.map(k=>[k,process.env[k]]));
 const oldFetch=global.fetch;
 process.env.MUSICGPT_MUSICAI_V2_API_KEY=API;
 process.env.PULSE_MUSICGPT_OWNER_TOKEN=OWNER;
 try{await action();}
 finally{
  global.fetch=oldFetch;
  for(const key of SECRET_KEYS){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
 }
};
const prompt={action:'generate',consent:true,mode:'prompt',prompt:'Cinematic trap with a 145 BPM rhythm',musicStyle:'Trap',
 title:'Night Drive',lyrics:'',output:'full',gender:'female',voiceId:'',generateAlbumCover:false};

test('MusicAI v1 supports two-variation discovery without exposing private keys',async()=>{
 await mock(async()=>{
  const res=await call(null,'','GET');
  assert.equal(res.code,200);
  assert.equal(res.data.configured,true);
  assert.equal(res.data.versions,2);
  assert.equal(res.data.apiVersion,'v1');
   assert.equal(res.data.promptMaxLength,280);
  assert.doesNotMatch(JSON.stringify(res.data),/fake-musicai-key|owner-only-test/);
  assert.equal(res.headers['cache-control'],'private, no-store, max-age=0');
 });
});
test('owner, same-origin and explicit credit consent gate paid MusicGPT requests',async()=>{
 await mock(async()=>{
  let count=0;global.fetch=async()=>{count++;throw Error('provider should not be reached');};
  let r=await call(prompt,'incorrect');assert.equal(r.code,403);assert.equal(r.data.error,'OWNER_AUTH_REQUIRED');
  r=await call(prompt,OWNER,'POST','https://evil.example');assert.equal(r.code,403);assert.equal(r.data.error,'CROSS_ORIGIN_BLOCKED');
  r=await call({...prompt,consent:false});assert.equal(r.code,400);assert.equal(r.data.error,'CREDIT_CONSENT_REQUIRED');
  r=await call({...prompt,prompt:'z'.repeat(281)});assert.equal(r.code,400);
  r=await call({...prompt,gender:'unknown'});assert.equal(r.code,400);
  r=await call({...prompt,output:'full;rm'});assert.equal(r.code,400);
  r=await call({...prompt,mode:'custom',lyrics:'',musicStyle:''});assert.equal(r.code,400);
  r=await call({...prompt,voiceId:'"javascript:alert(1)'});assert.equal(r.code,400);
  assert.equal(count,0);
 });
});
test('POST /v1/MusicAI creates exactly two IDs from a validated prompt',async()=>{
 await mock(async()=>{
  const calls=[];
  global.fetch=async(url,options)=>{
   calls.push({url:String(url),method:options.method,headers:options.headers,body:JSON.parse(options.body)});
   return new Response(JSON.stringify({success:true,task_id:'5b82ca4f-64ae-49ab-a825-8523e6049d25',
    conversion_id_1:idA,conversion_id_2:idB,eta:154,credit_estimate:1.25}),{status:200});
  };
  const r=await call(prompt);
  assert.equal(r.code,200);
  assert.deepEqual(r.data.versions,[{id:idA},{id:idB}]);
  assert.equal(r.data.status,'submitted');
  assert.equal(r.data.creditEstimate,1.25);
  assert.equal(calls.length,1,'paid generate should send exactly one upstream POST');
  assert.equal(calls[0].url,'https://api.musicgpt.com/api/public/v1/MusicAI');
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].headers.Authorization,API);
  assert.equal('model' in calls[0].body,false);
  assert.equal(calls[0].body.prompt,prompt.prompt);
  assert.equal(calls[0].body.make_instrumental,false);
  assert.equal(calls[0].body.vocal_only,false);
  assert.equal(calls[0].body.title,'Night Drive');
  assert.equal(calls[0].body.gender,'female');
  assert.equal(calls[0].body.generate_album_cover,false);
  assert.equal('webhook_url' in calls[0].body,false);
  assert.doesNotMatch(JSON.stringify(r.data),/fake-musicai-key/);
 });
});
test('CUSTOM LYRICS supports own lyrics, style and instrumental generation',async()=>{
 await mock(async()=>{
  let body;
  global.fetch=async(_url,options)=>{
   body=JSON.parse(options.body);
   return new Response(JSON.stringify({success:true,conversion_id_1:idA,conversion_id_2:idB}),{status:200});
  };
  const r=await call({...prompt,mode:'custom',prompt:'',musicStyle:'Dark House',lyrics:'[Verse] My original song',
   output:'instrumental',gender:'neutral',generateAlbumCover:true,voiceId:'licensed-voice'});
  assert.equal(r.code,200);
  assert.equal(body.prompt,'');
  assert.equal(body.music_style,'Dark House');
  assert.equal(body.lyrics,'[Verse] My original song');
  assert.equal(body.make_instrumental,true);
  assert.equal(body.vocal_only,false);
  assert.equal(body.voice_id,'licensed-voice');
  assert.equal('model' in body,false);
  assert.equal(body.generate_album_cover,true);
 });
});
test('get conversion result by MUSIC_AI and separate conversion_id returns safe audio output',async()=>{
 await mock(async()=>{
  let upstream;
  global.fetch=async(url,options)=>{
   upstream={url:String(url),options};
   return new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',
    conversion_id:idA,title:'Night Drive',audio_url:'https://cdn.musicgpt.example/output-a.mp3',
    conversion_path_wav:'https://cdn.musicgpt.example/output-a.wav',conversion_duration:201.3,conversion_cost:1.2}}),{status:200});
  };
  const r=await call({action:'result',conversionId:idA});
  assert.equal(r.code,200);
  assert.equal(r.data.status,'complete');
  assert.equal(r.data.audioUrl,'https://cdn.musicgpt.example/output-a.mp3');
  assert.equal(r.data.wavUrl,'https://cdn.musicgpt.example/output-a.wav');
  assert.equal(r.data.duration,201.3);
  assert.equal(upstream.options.method,'GET');
  assert.equal(upstream.options.headers.Authorization,API);
  assert.match(upstream.url,/\/api\/public\/v1\/byId\?conversionType=MUSIC_AI&conversion_id=/);
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'PROCESSING'}}),{status:200});
  assert.equal((await call({action:'result',conversionId:idB})).data.status,'processing');
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'FAILED'}}),{status:200});
  assert.equal((await call({action:'result',conversionId:idB})).data.status,'failed');
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',
   audio_url:'javascript:alert(1)'}}),{status:200});
  assert.notEqual((await call({action:'result',conversionId:idB})).data.status,'complete');
 });
});
test('credit errors, provider errors and missing conversion IDs do not generate fake tracks',async()=>{
 await mock(async()=>{
  global.fetch=async()=>new Response(JSON.stringify({success:false,error:'Insufficient credit balance'}),{status:402});
  let r=await call(prompt);assert.equal(r.code,402);assert.equal(r.data.error,'INSUFFICIENT_CREDITS');
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion_id_1:idA}),{status:200});
  r=await call(prompt);assert.equal(r.code,502);assert.equal(r.data.error,'MISSING_CONVERSION_IDS');
 });
});
test('MusicAI UI mounts with two tracks and no Video to Audio code or navigation',()=>{
 const old=globalThis.document;
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 globalThis.document=document;
 try{
  const host=document.getElementById('host');
  const cleanup=mountMusicAIV2({host});
  assert.ok(host.querySelector('[data-mai-form]'));
  assert.equal(host.querySelectorAll('[data-mai-track]').length,2);
   assert.equal(host.querySelector('[data-mai-model]'),null);
   assert.equal(host.querySelector('[data-mai-prompt]').getAttribute('maxlength'),'280');
  assert.equal(host.querySelector('[data-mai-generate]').disabled,false);
  assert.equal(visibleToolModules.filter(x=>x.category==='ai').length,11);
  assert.ok(visibleToolModules.some(x=>x.id==='ai2-musicai'));
  assert.ok(!visibleToolModules.some(x=>x.id==='video-to-audio'));
  const base=new URL('../',import.meta.url);
  assert.equal(existsSync(new URL('source/modules/video-audio-tool.mjs',base)),false);
  assert.equal(existsSync(new URL('tests/video-to-audio.test.mjs',base)),false);
  assert.doesNotMatch(readFileSync(new URL('source/index.html',base),'utf8'),/video-to-audio|Video to Audio/);
  assert.doesNotMatch(readFileSync(new URL('source/modules/tool-editorial.mjs',base),'utf8'),/video-to-audio/);
  cleanup();
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
