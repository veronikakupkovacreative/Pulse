import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import handler from '../api/pulse-sound-generator.js';
import {mountSoundGenerator} from '../source/modules/musicgpt-sound-generator.mjs';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';

const KEY='fake-test-soundgenerator-api-key';
const OWNER='fake-owner-token';
const CONVERSION='f94c0221-116f-4d40-bc12-c3c6d90a569e';
const res=()=>({code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
async function testHandler(req={}) {
 const response=res();
 await handler({method:req.method||'POST',headers:{host:'pulse.test','x-pulse-owner-token':OWNER,...req.headers},body:req.body},response);
 return response;
}
async function fixture(fn){
 const old={key:process.env.MUSICGPT_SOUND_GENERATOR_API_KEY,owner:process.env.PULSE_MUSICGPT_OWNER_TOKEN,fetch:globalThis.fetch};
 try{process.env.MUSICGPT_SOUND_GENERATOR_API_KEY=KEY;process.env.PULSE_MUSICGPT_OWNER_TOKEN=OWNER;await fn();}
 finally{
  for(const [key,value] of [['MUSICGPT_SOUND_GENERATOR_API_KEY',old.key],['PULSE_MUSICGPT_OWNER_TOKEN',old.owner]]){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  globalThis.fetch=old.fetch;
 }
}
const input={action:'generate',consent:true,prompt:'An airy cinematic forest with passing wind and birdsong',audioLength:30,generateAlbumCover:false};
test('sound generator route reports configured state without revealing credentials',async()=>{
 await fixture(async()=>{const r=await testHandler({method:'GET'});assert.equal(r.code,200);assert.equal(r.body.configured,true);assert.equal(r.body.maxLength,60);assert.ok(!JSON.stringify(r.body).includes(KEY));});
});
test('Sound Generator requires owner access and explicit paid credits',async()=>{
 await fixture(async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should never reach provider');};
  let r=await testHandler({body:input,headers:{'x-pulse-owner-token':'bad'}});
  assert.equal(r.code,403);
  r=await testHandler({body:input,headers:{origin:'https://evil.example'}});
  assert.equal(r.code,403);
  r=await testHandler({body:{...input,consent:false}});
  assert.equal(r.code,400);
  r=await testHandler({body:{...input,audioLength:61}});
  assert.equal(r.code,400);
  r=await testHandler({body:{...input,prompt:'abc'}});
  assert.equal(r.code,400);
  assert.equal(calls,0);
 });
});
test('Sound Generator submits one URL encoded provider request and safely returns conversion ID',async()=>{
 await fixture(async()=>{
  let upstream=[];
  globalThis.fetch=async(url,options)=>{
   upstream.push({url:String(url),options});
   return new Response(JSON.stringify({success:true,conversion_id:CONVERSION,eta:61,credit_estimate:4.5}),{status:200});
  };
  const r=await testHandler({body:input});
  assert.equal(r.code,200);assert.equal(r.body.conversionId,CONVERSION);
  assert.equal(upstream.length,1);
  assert.equal(upstream[0].url,'https://api.musicgpt.com/api/public/v1/sound_generator');
  assert.equal(upstream[0].options.headers.Authorization,KEY);
  assert.equal(upstream[0].options.body.get('prompt'),input.prompt);
  assert.equal(upstream[0].options.body.get('audio_length'),'30');
  assert.equal(upstream[0].options.body.get('generate_album_cover'),'false');
  assert.ok(!JSON.stringify(r.body).includes(KEY));
 });
});
test('Sound Generator result polls by SOUND_GENERATOR and returns HTTPS audio',async()=>{
 await fixture(async()=>{
  let upstream=[];
  globalThis.fetch=async(url,options)=>{
   upstream.push({url:String(url),method:options.method});
   return new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',conversion_path:'https://cdn.example.org/sfx.mp3'}}),{status:200});
  };
  const r=await testHandler({body:{action:'result',conversionId:CONVERSION}});
  assert.equal(r.code,200);assert.equal(r.body.status,'complete');assert.equal(r.body.audioUrl,'https://cdn.example.org/sfx.mp3');
  assert.match(upstream[0].url,/conversionType=SOUND_GENERATOR&conversion_id=/);
  assert.equal(upstream[0].method,'GET');
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',conversion_path:'javascript:alert(1)'}}),{status:200});
  const safe=await testHandler({body:{action:'result',conversionId:CONVERSION}});
  assert.notEqual(safe.body.status,'complete');
 });
});
test('Sound Generator UI registers, mounts and exposes explicit consent',()=>{
 const {document}=parseHTML('<html><body><main id="host"></main></body></html>');
 const previous=globalThis.document;globalThis.document=document;
 try{
  const root=document.getElementById('host');const cleanup=mountSoundGenerator({host:root});
  assert.ok(root.querySelector('[data-sfx-form]'));
  assert.ok(root.querySelector('[data-sfx-consent]'));
  assert.ok(root.querySelector('[data-sfx-prompt]'));
  assert.ok(root.querySelector('[data-sfx-length]'));
  assert.ok(aiV2Modules.some(m=>m.id==='ai2-soundgen'));
  cleanup();
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
