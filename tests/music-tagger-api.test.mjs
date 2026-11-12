import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pulse-tags.js';

const SECRET_KEYS=['AUDIAL_API_KEY','AUDIAL_USER_ID','PULSE_AUDIAL_OWNER_TOKEN'];
function fakeResponse(){
 const out={code:200,headers:{},payload:null,
  setHeader(name,value){this.headers[name.toLowerCase()]=value;},
  status(code){this.code=code;return this;},
  json(data){this.payload=data;return this;}};
 return out;
}
function audioPayload(){
 const data=Buffer.alloc(60);data.write('RIFF',0);
 return {name:'sample.wav',base64:data.toString('base64')};
}
async function withEnvironment(testFn){
 const original=Object.fromEntries(SECRET_KEYS.map(k=>[k,process.env[k]])),oldFetch=global.fetch;
 try{
  process.env.AUDIAL_API_KEY='example-server-only-key';
  process.env.AUDIAL_USER_ID='testuser';
  process.env.PULSE_AUDIAL_OWNER_TOKEN='example-owner-only-token';
  await testFn();
 }finally{
  for(const k of SECRET_KEYS)if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];
  global.fetch=oldFetch;
 }
}
const call=async(method,body,token='example-owner-only-token')=>{
 const res=fakeResponse();
 await handler({method,body,headers:{'x-pulse-owner-token':token}},res);
 return res;
};
const mockFetch=(payload,status=200)=>{
 const calls=[];
 global.fetch=async(url,options)=>{
  calls.push({url,method:options.method,form:options.body,headers:options.headers});
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 return calls;
};
test('cloud tag API never transmits audio without both owner auth and consent',async()=>{
 await withEnvironment(async()=>{
  let requests=0;
  global.fetch=async()=>{requests++;throw Error('Unexpected outbound upload');};
  const unauthorized=await call('POST',{action:'start',consent:true,file:audioPayload()},'wrong-token');
  assert.equal(unauthorized.code,403);
  const noConsent=await call('POST',{action:'start',consent:false,file:audioPayload()});
  assert.equal(noConsent.code,400);
  assert.equal(requests,0);
  assert.match(JSON.stringify(unauthorized.payload),/OWNER_AUTH_REQUIRED/);
 });
});
test('Audial start -> tag -> result endpoints normalize stems and do not disclose API key',async()=>{
 await withEnvironment(async()=>{
  const calls=mockFetch({exeId:'exe_12345abcde'});
  const start=await call('POST',{action:'start',consent:true,file:audioPayload()});
  assert.equal(start.code,200);
  assert.equal(start.payload.analysisExeId,'exe_12345abcde');
  assert.match(calls[0].url,/\/api\/functions\/run\/segmentation$/);
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].form.get('userId'),'testuser');
  assert.equal(calls[0].form.get('original').name,'sample.wav');
  assert.doesNotMatch(JSON.stringify(start.payload),/example-server-only-key/);

  global.fetch=async(url,options)=>{
   calls.push({url,method:options.method,form:options.body,headers:options.headers});
   return new Response(JSON.stringify({status:'requested'}),{status:200});
  };
  const tag=await call('POST',{action:'tag',consent:true,analysisExeId:'exe_12345abcde'});
  assert.equal(tag.code,200);
  assert.equal(tag.payload.status,'tagging_requested');
  assert.match(calls[1].url,/\/api\/functions\/run\/audio-tags$/);
  assert.equal(calls[1].form.get('analysisExeId'),'exe_12345abcde');

  global.fetch=async(url,options)=>{
   calls.push({url,method:options.method});
   return new Response(JSON.stringify({song_analysis:{
    genre:['UK Garage','Tech House'],description:'A dance music test fixture.',
    song_tags:{full:{moods:['energetic'],instruments:['synth bass']},
      drums:{moods:['punchy'],instruments:['drum machine']},
      vocals:{silent:true,moods:[],instruments:[]}}
   }}),{status:200});
  };
  const result=await call('POST',{action:'result',consent:true,analysisExeId:'exe_12345abcde'});
  assert.equal(result.code,200);
  assert.equal(result.payload.status,'complete');
  assert.deepEqual(result.payload.tags.genre,['UK Garage','Tech House']);
  assert.deepEqual(result.payload.tags.song_tags.full.moods,['energetic']);
  assert.deepEqual(result.payload.tags.song_tags.drums.instruments,['drum machine']);
  assert.equal(result.payload.tags.song_tags.vocals.silent,true);
  assert.match(calls[2].url,/\/api\/db\/testuser\/execution\/exe_12345abcde\/analysis$/);
 });
});
test('Audial 409 STEMS_NOT_READY remains retryable and does not fabricate tags',async()=>{
 await withEnvironment(async()=>{
  mockFetch({error:'STEMS_NOT_READY'},409);
  const result=await call('POST',{action:'tag',consent:true,analysisExeId:'exe_12345abcde'});
  assert.equal(result.code,409);
  assert.equal(result.payload.error,'STEMS_NOT_READY');
  assert.equal(result.payload.tags,undefined);
  const invalid=await call('POST',{action:'result',consent:true,analysisExeId:'https://example.com'});
  assert.equal(invalid.code,400);
 });
});
