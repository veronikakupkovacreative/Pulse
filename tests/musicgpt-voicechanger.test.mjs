import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pulse-musicgpt.js';
import {readFileSync} from 'node:fs';
const envs=['MUSICGPT_API_KEY','PULSE_PUBLIC_CLOUD_ENABLED'];
function response(){return {code:200,payload:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.payload=v;return this;}};}
async function run(body,route='?charge=1',method='POST'){
 const res=response();
 await handler({method,body,url:'/api/pulse-musicgpt'+(body?.action==='submit'?route:''),headers:{origin:'https://pulse.example',host:'pulse.example'}},res);
 return res;
}
async function withEnv(callback){
 const saved=Object.fromEntries(envs.map(x=>[x,process.env[x]])),old=global.fetch;
 try{
  process.env.MUSICGPT_API_KEY='server-only-mock-key';
  process.env.PULSE_PUBLIC_CLOUD_ENABLED='true';
  await callback();
 }finally{
  for(const name of envs)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];
  global.fetch=old;
 }
}
const voiceId='e0bb585f-b798-4bac-ac4e-de7fff38f9d75',conversionId='e3631817-165d-4f17-a7e2-7008d200ff3e';
const file={name:'voice.wav',base64:Buffer.alloc(2048,1).toString('base64')};
test('MusicGPT API secrets remain server-only and paid-route protection rejects bypasses',async()=>{
 await withEnv(async()=>{
  let calls=0;global.fetch=async()=>{calls++;throw Error('Should not call provider');};
  const get=await run(null,'', 'GET');
  assert.equal(get.code,200);assert.equal(get.payload.configured,true);
  assert.doesNotMatch(JSON.stringify(get.payload),/server-only-mock-key/);
  const denied=await run({action:'submit',consent:true,authorizedVoice:true,voiceId,file,pitch:0},'');
  assert.equal(denied.code,403);assert.equal(denied.payload.error,'CREDIT_PROTECTION_REQUIRED');
  const consent=await run({action:'submit',consent:false,authorizedVoice:true,voiceId,file});
  assert.equal(consent.code,400);
  assert.equal(calls,0);
 });
});
test('public may browse provider voices without exposing the MusicGPT API key',async()=>{
 await withEnv(async()=>{
  let captured;
  global.fetch=async(url,opt)=>{
   captured={url,opt};
   return new Response(JSON.stringify({success:true,voices:[{voice_id:voiceId,voice_name:'Licensed demo'},{voice_id:'not-a-voice!@',voice_name:'bad'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const result=await run({action:'voices'});
  assert.equal(result.code,200);
  assert.deepEqual(result.payload.voices,[{id:voiceId,label:'Licensed demo'}]);
  assert.match(captured.url,/\/api\/public\/v1\/getAllVoices\?limit=20&page=0$/);
  assert.equal(captured.opt.headers.Authorization,'server-only-mock-key');
  assert.doesNotMatch(JSON.stringify(result.payload),/server-only-mock-key/);
 });
});
test('consented MusicGPT VoiceChanger submits real multipart audio, pitch and rights flag',async()=>{
 await withEnv(async()=>{
  let captured;
  global.fetch=async(url,opt)=>{
   captured={url,opt};
   return new Response(JSON.stringify({success:true,task_id:conversionId,conversion_id:conversionId,eta:22}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const result=await run({action:'submit',consent:true,authorizedVoice:true,voiceId,file,removeBackground:true,pitch:0});
  assert.equal(result.code,200);assert.equal(result.payload.conversionId,conversionId);
  assert.match(captured.url,/\/api\/public\/v1\/VoiceChanger$/);
  assert.equal(captured.opt.method,'POST');
  assert.equal(captured.opt.body.get('voice_id'),voiceId);
  assert.equal(captured.opt.body.get('remove_background'),'1');
  assert.equal(captured.opt.body.get('pitch'),'0');
  assert.equal(captured.opt.body.get('audio_file').name,'voice.wav');
 });
});
test('poll VoiceChanger result by conversionType and preserve only HTTPS playback links',async()=>{
 await withEnv(async()=>{
  let captured;
  global.fetch=async(url,opt)=>{
   captured={url,opt};
   return new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',audio_url:'https://musicgpt.s3.amazonaws.com/voice.mp3',status_msg:'Conversion successful'}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const result=await run({action:'result',conversionId});
  assert.equal(result.code,200);assert.equal(result.payload.status,'complete');
  assert.match(result.payload.audioUrl,/^https:\/\//);
  assert.match(captured.url,/byId\?conversionType=VOICE_CONVERSION&conversion_id=/);
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',audio_url:'http://localhost/private.mp3'}}),{status:200});
  const rejected=await run({action:'result',conversionId});
  assert.notEqual(rejected.payload.status,'complete');
 });
});
test('insufficient credits and unauthorized voice id produce no fabricated success',async()=>{
 await withEnv(async()=>{
  global.fetch=async()=>new Response(JSON.stringify({success:false,error:'Insufficient credit balance'}),{status:402});
  const noCredits=await run({action:'submit',consent:true,authorizedVoice:true,voiceId,file,pitch:0});
  assert.equal(noCredits.code,402);assert.equal(noCredits.payload.error,'INSUFFICIENT_CREDITS');
  const invalid=await run({action:'submit',consent:true,authorizedVoice:true,voiceId:'bad !',file,pitch:0});
  assert.equal(invalid.code,400);assert.equal(invalid.payload.error,'INVALID_VOICE_ID');
 });
});
test('Vocal Studio includes MusicGPT changer as one subtool, preserves eight modules and no client API key',()=>{
 const ai=readFileSync(new URL('../source/modules/ai-v2.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../source/modules/musicgpt-voicechanger.mjs',import.meta.url),'utf8');
 assert.match(ai,/AI VOICE CHANGER/);
 assert.match(ai,/mountMusicGPTVoiceChanger/);
 assert.match(ui,/data-voice-consent/);
 assert.match(ui,/makeCloudTaggingExcerpt/);
 assert.doesNotMatch(ui,/MUSICGPT_API_KEY/);
 assert.doesNotMatch(ui,/data-voice-token|x-pulse-owner-token/);
});

test('Voice Changer searches a voice catalog by name without a browser API key',async()=>{
 await withEnv(async()=>{
  let seen='';
  global.fetch=async(url)=>{
   seen=url;
   return new Response(JSON.stringify({success:true,voices:[{voice_id:voiceId,voice_name:'Owned demo voice'}],limit:20,page:0,total:1}),{status:200});
  };
  const found=await run({action:'voices',query:'owned demo',page:0});
  assert.equal(found.code,200);
  assert.deepEqual(found.payload.voices,[{id:voiceId,label:'Owned demo voice'}]);
  assert.equal(found.payload.total,1);
  assert.match(seen,/\/searchVoices\?query=owned%20demo&limit=20&page=0$/);
 });
});
test('Voice search validates query and pagination before any network request',async()=>{
 await withEnv(async()=>{
  let calls=0;global.fetch=async()=>{calls++;return new Response('{}',{status:200});};
  const query=await run({action:'voices',query:'a'});
  assert.equal(query.code,400);
  assert.equal(query.payload.error,'INVALID_SEARCH_QUERY');
  const page=await run({action:'voices',query:'demo',page:-2});
  assert.equal(page.code,400);
  assert.equal(page.payload.error,'INVALID_PAGE');
  assert.equal(calls,0);
 });
});
