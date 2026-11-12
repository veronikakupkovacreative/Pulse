import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import handler from '../api/pulse-mastering.js';
import {makeMasteringPreview} from '../source/modules/musicgpt-mastering.mjs';
const envKeys=['MUSICGPT_MASTERING_API_KEY','PULSE_MUSICGPT_OWNER_TOKEN'];
const cloudKey='mock-server-mastering-key',owner='private-test-owner';
const conversionId='5b82ca4f-64ae-49ab-a825-8523e6049d25';
const localFile={name:'input.wav',base64:Buffer.from(Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(2030,1)])).toString('base64')};
const res=()=>({code:null,data:null,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
async function run(body,token=owner,method='POST'){
 const response=res();
 await handler({method,headers:{'x-pulse-owner-token':token,host:'pulse.test'},body},response);
 return response;
}
async function configured(callback){
 const values=Object.fromEntries(envKeys.map(k=>[k,process.env[k]])),old=global.fetch;
 process.env.MUSICGPT_MASTERING_API_KEY=cloudKey;
 process.env.PULSE_MUSICGPT_OWNER_TOKEN=owner;
 try{await callback();}finally{
  global.fetch=old;
  for(const k of envKeys)if(values[k]===undefined)delete process.env[k];else process.env[k]=values[k];
 }
}
test('MusicGPT mastering is configured only server side, rejects missing owner and consent without provider calls',async()=>{
 await configured(async()=>{
  let calls=0;global.fetch=async()=>{calls++;throw Error('should not fetch');};
  const status=await run(null,'','GET');
  assert.equal(status.code,200);assert.equal(status.data.configured,true);
  assert.equal(status.data.referenceRequired,true);assert.doesNotMatch(JSON.stringify(status.data),/mock-server-mastering-key/);
  const denied=await run({action:'submit',consent:true,original:{file:localFile},reference:{file:localFile}},'bad');
  assert.equal(denied.code,403);assert.equal(denied.data.error,'OWNER_AUTH_REQUIRED');
  const consent=await run({action:'submit',consent:false});
  assert.equal(consent.code,400);assert.equal(consent.data.error,'AUDIO_UPLOAD_CONSENT_REQUIRED');
  const noRef=await run({action:'submit',consent:true,original:{file:localFile}});
  assert.equal(noRef.code,400);assert.equal(noRef.data.error,'AUDIO_OR_REFERENCE_REQUIRED');
  assert.equal(calls,0);
 });
});
test('MusicGPT audio_mastering receives correct form fields, output and header; not Audial',async()=>{
 await configured(async()=>{
  let captured;
  global.fetch=async(url,options)=>{
   captured={url,options};
   return new Response(JSON.stringify({success:true,task_id:'tasktest',conversion_id:conversionId,
    credit_estimate:150.75,eta:300}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const result=await run({action:'submit',consent:true,original:{file:localFile},reference:{file:localFile},outputExtension:'wav'});
  assert.equal(result.code,200);assert.equal(result.data.conversionId,conversionId);assert.equal(result.data.creditEstimate,150.75);
  assert.equal(captured.url,'https://api.musicgpt.com/api/public/v1/audio_mastering');
  assert.equal(captured.options.headers.Authorization,cloudKey);
  assert.equal(captured.options.method,'POST');
  assert.equal(captured.options.body.get('output_extension'),'wav');
  assert.equal(captured.options.body.get('audio_file').name,'input.wav');
  assert.equal(captured.options.body.get('reference_audio_file').name,'input.wav');
  assert.equal(captured.options.body.has('audio_url'),false);
  assert.equal(captured.options.body.has('reference_audio_url'),false);
  assert.doesNotMatch(JSON.stringify(result.data),/mock-server-mastering-key/);
 });
});
test('full-length source/reference HTTPS URLs are forwarded without downloading audio into PULSE backend',async()=>{
 await configured(async()=>{
  let captured;
  global.fetch=async(url,opts)=>{
   captured={url,opts};
   return new Response(JSON.stringify({success:true,conversion_id:'conv456'}),{status:200});
  };
  const r=await run({action:'submit',consent:true,
   original:{url:'https://cdn.example.com/full-song.wav'},
   reference:{url:'https://cdn.example.com/reference.wav'},
   outputExtension:'flac'});
  assert.equal(r.code,200);
  assert.equal(captured.opts.body.get('audio_url'),'https://cdn.example.com/full-song.wav');
  assert.equal(captured.opts.body.get('reference_audio_url'),'https://cdn.example.com/reference.wav');
  assert.equal(captured.opts.body.has('audio_file'),false);
  assert.equal(captured.opts.body.get('output_extension'),'flac');
 });
});
test('strict file size and public HTTPS URL validations run before spending provider credits',async()=>{
 await configured(async()=>{
  let calls=0;global.fetch=async()=>{calls++;throw Error('must not call provider');};
  const malformed=[
   {action:'submit',consent:true,original:{url:'http://example.com/music.wav'},reference:{file:localFile}},
   {action:'submit',consent:true,original:{url:'https://localhost/private.wav'},reference:{file:localFile}},
   {action:'submit',consent:true,original:{url:'https://192.168.1.1/private.wav'},reference:{file:localFile}},
   {action:'submit',consent:true,original:{url:'https://user:pass@example.com/path.wav'},reference:{file:localFile}},
   {action:'submit',consent:true,original:{file:localFile},reference:{url:'http://example.com/reference'}},
   {action:'submit',consent:true,original:{file:localFile},reference:{file:localFile},outputExtension:'exe'},
   {action:'submit',consent:true,original:{file:{name:'large.wav',base64:Buffer.alloc(2_610_000,3).toString('base64')}},reference:{file:localFile}}
  ];
  for(const data of malformed){const r=await run(data);assert.ok(r.code>=400,'should reject '+JSON.stringify(data).slice(0,100));}
  assert.equal(calls,0);
 });
});
test('completed job polling by AUDIO_MASTERING conversion id emits only HTTPS playback URL',async()=>{
 await configured(async()=>{
  let path;
  global.fetch=async(url,options)=>{
   path=url;
   assert.equal(options.headers.Authorization,cloudKey);
   return new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',
    conversion_path:'https://audio.musicgpt.com/master.wav',conversion_cost:123.4}}),{status:200});
  };
  const r=await run({action:'result',conversionId});
  assert.equal(r.code,200);assert.equal(r.data.status,'complete');
  assert.equal(r.data.audioUrl,'https://audio.musicgpt.com/master.wav');
  assert.equal(r.data.cost,123.4);
  assert.match(path,/\/byId\?conversionType=AUDIO_MASTERING&conversion_id=/);
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'PROCESSING'}}),{status:200});
  assert.equal((await run({action:'result',conversionId})).data.status,'processing');
  global.fetch=async()=>new Response(JSON.stringify({success:true,conversion:{status:'COMPLETED',audio_url:'http://127.0.0.1/master'}}),{status:200});
  assert.notEqual((await run({action:'result',conversionId})).data.status,'complete');
 });
});
test('provider 402 insufficient credits produces real error, never fabricated master',async()=>{
 await configured(async()=>{
  global.fetch=async()=>new Response(JSON.stringify({success:false,error:'Insufficient credits'}),{status:402});
  const r=await run({action:'submit',consent:true,original:{file:localFile},reference:{file:localFile}});
  assert.equal(r.code,402);assert.equal(r.data.error,'INSUFFICIENT_CREDITS');
 });
});
test('browser preview encodes true stereo RIFF WAV, bounded to 6 seconds',async()=>{
 const rate=44100,seconds=12,length=rate*seconds;
 const left=Float32Array.from({length},(_,i)=>Math.sin(2*Math.PI*440*i/rate)*.25);
 const right=Float32Array.from({length},(_,i)=>Math.sin(2*Math.PI*330*i/rate)*.2);
 const audio={sampleRate:rate,length,duration:seconds,numberOfChannels:2,
  getChannelData:i=>i?right:left};
 const x=await makeMasteringPreview(audio);
 assert.equal(x.seconds,6);
 const bytes=Buffer.from(x.file.base64,'base64');
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.readUInt16LE(22),2);
 assert.equal(bytes.readUInt32LE(24),44100);
 assert.equal(bytes.byteLength,44+6*44100*4);
 assert.ok(bytes.byteLength<1_100_000);
 const selected=await makeMasteringPreview(audio,{selection:{start:2,end:5}});
 assert.equal(selected.seconds,3);assert.equal(selected.start,2);
});
test('MusicGPT mastering is only cloud option; old Audial backend is gone',()=>{
 const ui=readFileSync(new URL('../source/modules/mastering-ui.mjs',import.meta.url),'utf8');
 const cloud=readFileSync(new URL('../source/modules/musicgpt-mastering.mjs',import.meta.url),'utf8');
 const vercel=readFileSync(new URL('../vercel.json',import.meta.url),'utf8');
 assert.match(ui,/02 \/ MUSICGPT MASTERING/);assert.match(ui,/data-master-engine="local"/);
 assert.match(cloud,/data-master-cloud-consent/);
 assert.match(cloud,/data-mg-source-method/);
 assert.match(cloud,/data-mg-ref-method/);
 assert.match(cloud,/STOP WAITING/);
 assert.doesNotMatch(ui,/Audial|audial|pulse-audial/);
 assert.doesNotMatch(cloud,/Audial|audial|pulse-audial/);
 assert.doesNotMatch(vercel,/pulse-audial/);
 assert.equal(existsSync(new URL('../api/pulse-audial.js',import.meta.url)),false);
});
