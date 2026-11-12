import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import lyricsHandler from '../api/pulse-lyrics.js';
import {composeLyricsPrompt,mountLyricsGenerator} from '../source/modules/musicgpt-lyrics.mjs';
import {aiV2Modules} from '../source/modules/ai-v2.mjs';
const envs=['MUSICGPT_LYRICS_API_KEY','PULSE_MUSICGPT_OWNER_TOKEN'];
const samplePrompt='Write original English lyrics about the last train home.';
const mockedKey='server-only-lyrics-credential';
const fakeResponse=()=>({
 statusCode:200,result:null,headers:{},
 setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
 status(value){this.statusCode=value;return this;},
 json(value){this.result=value;return this;}
});
async function call({method='POST',body={},token='test-owner',origin=null,host='test.local'}={}){
 const res=fakeResponse();
 await lyricsHandler({
  method,body,headers:{'x-pulse-owner-token':token,...(origin?{origin,host}:{})}
 },res);
 return res;
}
async function withProvider(run){
 const before=Object.fromEntries(envs.map(name=>[name,process.env[name]]));
 const previousFetch=global.fetch;
 process.env.MUSICGPT_LYRICS_API_KEY=mockedKey;
 process.env.PULSE_MUSICGPT_OWNER_TOKEN='test-owner';
 try{await run();}finally{
  global.fetch=previousFetch;
  for(const name of envs){
   if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];
  }
 }
}
test('Lyrics Generator is registered as a separate ninth AI Studio tool',()=>{
 assert.equal(aiV2Modules.length,9);
 const item=aiV2Modules.find(x=>x.id==='ai2-lyrics');
 assert.ok(item);assert.equal(item.category,'ai');
 assert.equal(typeof item.mount,'function');assert.equal(item.mount,mountLyricsGenerator);
 const registry=readFileSync(new URL('../source/modules/index.mjs',import.meta.url),'utf8');
 assert.match(registry,/musicgpt-lyrics\.css/);
 const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
 assert.match(html,/data-open-tool="ai2-lyrics"/);
});
test('UI composes a natural-language prompt below MusicGPT 1000-character limit',()=>{
 const prompt=composeLyricsPrompt({
  theme:'A track about city lights and leaving the city',
  genre:'Trap',mood:'Dark',language:'Czech',
  structure:'Hook / Verse / Hook',keywords:'night rain, last train'
 });
 assert.ok(prompt.includes('Czech'));
 assert.ok(prompt.includes('Trap'));
 assert.ok(prompt.includes('Dark'));
 assert.ok(prompt.includes('Hook / Verse / Hook'));
 assert.ok(prompt.includes('night rain'));
 assert.ok(prompt.length<=1000);
 assert.throws(()=>composeLyricsPrompt({theme:''}),/song theme/i);
 assert.throws(()=>composeLyricsPrompt({theme:'x'.repeat(751)}),/750 characters/);
 assert.throws(()=>composeLyricsPrompt({theme:'x'.repeat(740),keywords:'y'.repeat(160)}),/1,000 characters/);
});
test('owner authorization and explicit consent prevent paid API calls',async()=>{
 await withProvider(async()=>{
  let calls=0;global.fetch=async()=>{calls++;throw Error('Must not reach MusicGPT');};
  const config=await call({method:'GET'});
  assert.equal(config.statusCode,200);
  assert.equal(config.result.configured,true);
  assert.doesNotMatch(JSON.stringify(config.result),/server-only-lyrics-credential/);
  const forbidden=await call({body:{action:'generate',consent:true,prompt:samplePrompt},token:'wrong'});
  assert.equal(forbidden.statusCode,403);
  assert.equal(forbidden.result.error,'OWNER_AUTH_REQUIRED');
  const consent=await call({body:{action:'generate',consent:false,prompt:samplePrompt}});
  assert.equal(consent.statusCode,400);
  const empty=await call({body:{action:'generate',consent:true,prompt:' '}});
  assert.equal(empty.statusCode,400);
  const oversized=await call({body:{action:'generate',consent:true,prompt:'p'.repeat(1001)}});
  assert.equal(oversized.statusCode,400);
  const origin=await call({body:{action:'generate',consent:true,prompt:samplePrompt},origin:'https://other-host.test',host:'test.local'});
  assert.equal(origin.statusCode,403);
  assert.equal(calls,0);
 });
});
test('MusicGPT request uses GET prompt query and server-only Authorization',async()=>{
 await withProvider(async()=>{
  let captured;
  global.fetch=async(url,options)=>{
   captured={url:String(url),options};
   return new Response(JSON.stringify({success:true,lyrics:'[Verse]\nA new direction\n\n[Chorus]\nStart again',task_id:'task-lyrics-124',credit_estimate:10}),{
    status:200,headers:{'Content-Type':'application/json'}
   });
  };
  const prompt="A hopeful R&B song about rain & fresh starts";
  const response=await call({body:{action:'generate',consent:true,prompt}});
  assert.equal(response.statusCode,200);
  assert.match(response.result.lyrics,/\[Chorus\]/);
  assert.equal(response.result.creditEstimate,10);
  assert.equal(response.result.taskId,'task-lyrics-124');
  assert.equal(captured.options.method,'GET');
  assert.equal(captured.options.headers.Authorization,mockedKey);
  assert.equal(new URL(captured.url).searchParams.get('prompt'),prompt);
  assert.equal(new URL(captured.url).pathname,'/api/public/v1/prompt_to_lyrics');
  assert.doesNotMatch(JSON.stringify(response.result),/server-only-lyrics-credential/);
  assert.equal(response.headers['cache-control'],'private, no-store, max-age=0');
 });
});
test('Lyrics Generator surfaces provider credits, auth and malformed results without invented lyrics',async()=>{
 await withProvider(async()=>{
  global.fetch=async()=>new Response(JSON.stringify({success:false,error:'Insufficient balance'}),{status:402});
  let r=await call({body:{action:'generate',consent:true,prompt:samplePrompt}});
  assert.equal(r.statusCode,402);assert.equal(r.result.error,'INSUFFICIENT_CREDITS');
  global.fetch=async()=>new Response(JSON.stringify({success:false,error:'Wrong API key'}),{status:401});
  r=await call({body:{action:'generate',consent:true,prompt:samplePrompt}});
  assert.equal(r.result.error,'MUSICGPT_LYRICS_AUTH_FAILED');
  global.fetch=async()=>new Response(JSON.stringify({success:true,lyrics:''}),{status:200});
  r=await call({body:{action:'generate',consent:true,prompt:samplePrompt}});
  assert.equal(r.statusCode,502);assert.equal(r.result.error,'INVALID_PROVIDER_RESPONSE');
 });
});
