import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{config} from '../netlify/functions/pulse-api.mjs';

const host='https://pulse-studio-preview.netlify.app';
const request=(endpoint,{method='GET',body,headers={}}={})=>{
 const options={method,headers};
 if(body!==undefined){
  options.headers={'content-type':'application/json',...headers};
  options.body=typeof body==='string'?body:JSON.stringify(body);
 }
 return new Request(host+'/api/'+endpoint,options);
};

test('Netlify function declares the expected existing browser API prefix',()=>{
 assert.equal(config.path,'/api/:endpoint');
 const toml=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(toml,/publish\s*=\s*"public"/);
 assert.match(toml,/command\s*=\s*"npm run build"/);
 assert.match(toml,/node_bundler\s*=\s*"esbuild"/);
 assert.doesNotMatch(toml,/(MUSICGPT_API_KEY|PULSE_MUSICGPT_OWNER_TOKEN)\s*=/);
});

test('each of the existing seven Vercel API routes is recognized on Netlify',async()=>{
 const statuses={
  'pulse-ai':405,
  'pulse-lyrics':200,
  'pulse-mastering':200,
  'pulse-media-source':200,
  'pulse-musicgpt':200,
  'pulse-stems':405,
  'pulse-youtube':200
 };
 for(const [name,status] of Object.entries(statuses)){
  const response=await handler(request(name));
  assert.equal(response.status,status,'Route '+name+' should preserve existing public GET/method policy');
  const payload=await response.json();
  assert.ok(payload&&typeof payload==='object',name+' should return JSON');
  assert.equal(response.headers.get('cache-control'),'private, no-store',name);
 }
});

test('unrecognized routes do not reveal handler internals or secrets',async()=>{
 const response=await handler(request('api-not-registered'));
 assert.equal(response.status,404);
 assert.deepEqual(await response.json(),{error:'UNKNOWN_API_ROUTE'});
});

test('invalid client payload returns a safe 400 without calling MusicGPT',async()=>{
 const response=await handler(request('pulse-lyrics',{method:'POST',body:'{not-json'}));
 assert.equal(response.status,400);
 assert.equal((await response.json()).error,'INVALID_JSON');
});

test('Netlify forwards private owner authorization and same-origin policy to original MusicGPT handler',async()=>{
 const original=Object.fromEntries(['MUSICGPT_LYRICS_API_KEY','PULSE_MUSICGPT_OWNER_TOKEN'].map(k=>[k,process.env[k]]));
 const fetchBefore=global.fetch;
 try{
  process.env.MUSICGPT_LYRICS_API_KEY='test-key-unbillable';
  process.env.PULSE_MUSICGPT_OWNER_TOKEN='test-owner-unbillable';
  let providerCalls=0;
  global.fetch=async()=>{providerCalls++;throw Error('provider must not be contacted')};
  const body={action:'generate',prompt:'Music about hills',consent:true};
  const rejected=await handler(request('pulse-lyrics',{method:'POST',body,
    headers:{'x-pulse-owner-token':'not-the-owner'}}));
  assert.equal(rejected.status,403);
  assert.equal((await rejected.json()).error,'OWNER_AUTH_REQUIRED');
  const crossOrigin=await handler(request('pulse-lyrics',{method:'POST',body,
    headers:{origin:'https://attacker.example','x-pulse-owner-token':'test-owner-unbillable'}}));
  assert.equal(crossOrigin.status,403);
  assert.equal((await crossOrigin.json()).error,'CROSS_ORIGIN_BLOCKED');
  assert.equal(providerCalls,0);
 }finally{
  global.fetch=fetchBefore;
  for(const [key,value] of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});

test('Cloud API endpoints require POST JSON, never accept arbitrary encoded requests',async()=>{
 const response=await handler(new Request(host+'/api/pulse-mastering',{
  method:'POST',headers:{'content-type':'text/plain'},body:'hello'
 }));
 assert.equal(response.status,415);
 assert.equal((await response.json()).error,'JSON_ONLY');
});

test('oversized JSON payload is rejected before allocating provider usage',async()=>{
 const response=await handler(new Request(host+'/api/pulse-mastering',{
  method:'POST',headers:{'content-type':'application/json','content-length':'5200001'},
  body:'{}'
 }));
 assert.equal(response.status,413);
});
