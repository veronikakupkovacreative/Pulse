import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/pulse-youtube.js';
import {youtubeJobRequest,waitForYoutubeJob} from '../source/modules/youtube-client.mjs';

const ID='dQw4w9WgXcQ',JOB='ce4b5d54-c0b5-47fb-a933-c56b1c571814';
const ACCESS='c'.repeat(32),SERVICE='s'.repeat(40);
const worker='https://worker.example.org';
function response(){return {
 statusCode:null,headers:{},body:null,
 setHeader(name,value){this.headers[name]=value;return this;},
 status(code){this.statusCode=code;return this;},
 json(body){this.body=body;return this;}
};}
const setEnv=(values)=>{const before={};for(const [key,val] of Object.entries(values)){
 before[key]=process.env[key];
 if(val===undefined)delete process.env[key];else process.env[key]=val;
}return()=>{for(const [key,val] of Object.entries(before)){
 if(val===undefined)delete process.env[key];else process.env[key]=val;
}};};
test('Vercel downloader gateway defaults to disabled until worker and owner access are configured',async()=>{
 const restore=setEnv({PULSE_YT_WORKER_URL:undefined,PULSE_YT_SERVICE_TOKEN:undefined,PULSE_YT_OWNER_TOKEN:undefined});
 try{
  const res=response();await handler({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.configured,false);
  const blocked=response();await handler({method:'POST',headers:{},body:{action:'create'}},blocked);
  assert.equal(blocked.statusCode,503);
 }finally{restore();}
});
test('owner access, same-origin checks and worker secret are enforced at the gateway',async()=>{
 const restore=setEnv({PULSE_YT_WORKER_URL:worker,PULSE_YT_SERVICE_TOKEN:SERVICE,PULSE_YT_OWNER_TOKEN:ACCESS});
 const before=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,init)=>{
  seen.push({url,init});
  return new Response(JSON.stringify({id:JOB,status:'queued',percent:0}),{
   status:202,headers:{'Content-Type':'application/json'}
  });
 };
 const base={method:'POST',headers:{host:'pulse-test.vercel.app',origin:'https://pulse-test.vercel.app','x-pulse-owner':ACCESS}};
 try{
  const capability=response();await handler({method:'GET',headers:{}},capability);
  assert.equal(capability.body.configured,true);
  assert.equal(JSON.stringify(capability.body).includes(SERVICE),false);
  const bad=response();await handler({...base,headers:{...base.headers,'x-pulse-owner':'wrong'},body:{action:'create'}},bad);
  assert.equal(bad.statusCode,401);
  const cross=response();await handler({...base,headers:{...base.headers,origin:'https://evil.example'},body:{action:'create'}},cross);
  assert.equal(cross.statusCode,403);
  const invalid=response();await handler({...base,body:{action:'create',rightsConfirmed:false,url:'https://youtube.com',format:'mp3'}},invalid);
  assert.equal(invalid.statusCode,400);
  const good=response();await handler({...base,body:{action:'create',rightsConfirmed:true,url:'https://www.youtube.com/watch?v='+ID,format:'mp3',bitrate:192}},good);
  assert.equal(good.statusCode,202);
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,worker+'/v1/jobs');
  assert.equal(seen[0].init.headers.Authorization,'Bearer '+SERVICE);
  assert.ok(!JSON.stringify(good.body).includes(SERVICE));
  const status=response();await handler({...base,body:{action:'status',id:JOB}},status);
  assert.equal(seen.at(-1).url,worker+'/v1/jobs/'+JOB);
  assert.equal(seen.at(-1).init.method,'GET');
  const cancel=response();await handler({...base,body:{action:'cancel',id:JOB}},cancel);
  assert.equal(seen.at(-1).url,worker+'/v1/jobs/'+JOB+'/cancel');
 }finally{globalThis.fetch=before;restore();}
});
test('client polling yields signed download URL and fails on worker errors',async()=>{
 const id=JOB,owner=ACCESS;
 let calls=0;
 const fetchImpl=async(_,opts)=>{
  const body=JSON.parse(opts.body);calls++;
  if(body.action==='status'){
   const data=calls===1?{id,status:'downloading',percent:44}:{
    id,status:'ready',percent:100,downloadUrl:worker+'/v1/jobs/'+id+'/download?ticket=secure-one-time-ticket'};
   return {ok:true,json:async()=>data};
  }
  return {ok:false,status:400,json:async()=>({error:'bad action'})};
 };
 const progress=[];
 const done=await waitForYoutubeJob(id,owner,{fetchImpl,onProgress:x=>progress.push(x.percent),pause:async()=>{}});
 assert.equal(done.status,'ready');
 assert.deepEqual(progress,[44,100]);
 await assert.rejects(()=>youtubeJobRequest('',{action:'create'},{fetchImpl}),/access code/);
 const badWorker=async()=>({ok:true,json:async()=>({id,status:'ready',downloadUrl:'javascript:alert(1)'})});
 await assert.rejects(()=>waitForYoutubeJob(id,owner,{fetchImpl:badWorker}),/Unsafe download URL/);
});
