import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pulse-audial.js';

function res(){
 return {code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
}
const keys=['AUDIAL_API_KEY','AUDIAL_USER_ID','PULSE_AUDIAL_OWNER_TOKEN'];
function setEnv(values,fn){
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 for(const key of keys){if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];}
 return Promise.resolve().then(fn).finally(()=>{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
}
const auth={AUDIAL_API_KEY:'test-not-real',AUDIAL_USER_ID:'sample',PULSE_AUDIAL_OWNER_TOKEN:'example-owner-token'};
test('Audial endpoint reports configuration without revealing keys and rejects unauthorized calls',async()=>{
 await setEnv({},async()=>{
  const a=res();await handler({method:'GET'},a);assert.equal(a.code,200);assert.equal(a.body.configured,false);
  const b=res();await handler({method:'POST',headers:{},body:{}},b);assert.equal(b.code,503);
 });
 await setEnv(auth,async()=>{
  const a=res();await handler({method:'GET'},a);
  assert.equal(a.body.configured,true);assert.equal(JSON.stringify(a.body).includes(auth.AUDIAL_API_KEY),false);
  const b=res();await handler({method:'POST',headers:{'x-pulse-owner-token':'wrong'},body:{}},b);
  assert.equal(b.code,403);
  const c=res();await handler({method:'POST',headers:{'x-pulse-owner-token':auth.PULSE_AUDIAL_OWNER_TOKEN},body:{consent:false}},c);
  assert.equal(c.code,400);
 });
});
test('Audial request sends files only after owner authentication and explicit consent',async()=>{
 await setEnv(auth,async()=>{
  const oldFetch=globalThis.fetch;
  let seen=null;
  globalThis.fetch=async(url,options)=>{
   seen={url,options};
   return new Response(JSON.stringify({status:'success',files:{master:{download_url:'https://media.audialmusic.ai/master.wav'}}}),
    {status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
   const file={name:'track.wav',type:'audio/wav',base64:Buffer.from('RIFFabcdef').toString('base64')};
   const reply=res();
   await handler({method:'POST',headers:{'x-pulse-owner-token':auth.PULSE_AUDIAL_OWNER_TOKEN},
     body:{consent:true,original:file}},reply);
   assert.equal(reply.code,200);
   assert.equal(seen.url,'https://api.audialmusic.ai/api/functions/run/mastering');
   assert.equal(seen.options.headers['X-API-Key'],auth.AUDIAL_API_KEY);
   assert.equal(seen.options.headers['X-User-ID'],auth.AUDIAL_USER_ID);
   assert.equal(seen.options.body.get('userId'),auth.AUDIAL_USER_ID);
   assert.equal(seen.options.body.get('original').name,'track.wav');
   assert.equal(reply.body.links[0].url,'https://media.audialmusic.ai/master.wav');
  }finally{globalThis.fetch=oldFetch;}
 });
});
test('Cloud short clip is intentionally bounded to protect Vercel ingress',async()=>{
 await setEnv(auth,async()=>{
  const reply=res();
  const tooLarge=Buffer.alloc(2_800_000,1).toString('base64');
  await handler({method:'POST',headers:{'x-pulse-owner-token':auth.PULSE_AUDIAL_OWNER_TOKEN},
   body:{consent:true,original:{name:'track.wav',type:'audio/wav',base64:tooLarge}}},reply);
  assert.equal(reply.code,413);
 });
});
