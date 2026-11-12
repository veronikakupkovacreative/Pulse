/** Single-instance temporary YouTube job service.
 * Deploy in a dedicated Docker host with yt-dlp, yt-dlp-ejs, Node and FFmpeg.
 * The service is protected by PULSE_YT_SERVICE_TOKEN; downloads use random expiring tickets.
 * This is NOT a Vercel Function, CDN cache, public proxy or unrestricted scraper.
 */
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateJobRequest,processYouTubeJob} from './job-core.mjs';

const MAX_BODY=8192;
const CONTENT_TYPES={mp3:'audio/mpeg',wav:'audio/wav',mp4:'video/mp4'};
const secureEqual=(received,expected)=>{
 if(typeof received!=='string'||typeof expected!=='string'||!expected)return false;
 const x=Buffer.from(received),y=Buffer.from(expected);
 return x.length===y.length&&timingSafeEqual(x,y);
};
function reply(res,code,object){
 res.writeHead(code,{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, private',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'"
 });
 res.end(JSON.stringify(object));
}
async function readBody(req){
 let n=0,raw='';
 for await(const chunk of req){
  n+=chunk.byteLength;
  if(n>MAX_BODY)throw Error('Request body exceeds 8 KB.');
  raw+=chunk.toString('utf8');
 }
 let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Expected valid JSON.');}
 return parsed;
}
function approvedBase(raw){
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash)throw Error('Invalid public worker base URL.');
 const dev=url.hostname==='localhost'||url.hostname==='127.0.0.1';
 if(url.protocol!=='https:'&&!(dev&&url.protocol==='http:'))throw Error('Public worker URL requires HTTPS.');
 return url.origin;
}
export function createApp({
 serviceToken,publicBaseUrl,runner=processYouTubeJob,
 storageRoot=join(tmpdir(),'pulse-youtube'),
 ttlMs=15*60*1000,maxActive=1,maxQueued=2
}={}){
 if(!serviceToken||serviceToken.length<24)throw Error('PULSE_YT_SERVICE_TOKEN must be 24+ characters.');
 const base=approvedBase(publicBaseUrl||'');
 const jobs=new Map(),queue=[];
 let active=0;
 const cleanup=async()=>{
  for(const [id,job] of jobs){
   if(['queued','checking','downloading','encoding'].includes(job.status))continue;
   if(Date.now()-job.updatedAt<ttlMs)continue;
   jobs.delete(id);
   if(job.directory)await rm(job.directory,{recursive:true,force:true}).catch(()=>{});
  }
 };
 const timer=setInterval(()=>void cleanup(),60000);
 timer.unref?.();
 function status(job){
  const available=job.status==='ready'&&Date.now()-job.updatedAt<ttlMs;
  const expired=job.status==='ready'&&!available;
  return {
   id:job.id,status:expired?'expired':job.status,percent:job.percent,
   title:job.title||'',duration:job.duration||null,
   format:job.format,error:expired?'The download link has expired. Start a new job.':(job.error||null),
   errorCode:expired?'JOB_EXPIRED':(job.errorCode||null),retryable:job.retryable??null,
   bytes:available?job.bytes:null,
   downloadUrl:available?base+'/v1/jobs/'+job.id+'/download?ticket='+job.ticket:null,
   expiresInSeconds:available?Math.max(0,Math.floor((ttlMs-(Date.now()-job.updatedAt))/1000)):null
  };
 }
 function drain(){
  while(active<maxActive&&queue.length){
   const job=queue.shift();
   if(job.status!=='queued')continue;
   active++;
   job.status='checking';job.percent=2;job.updatedAt=Date.now();
   (async()=>{
    try{
     await mkdir(storageRoot,{recursive:true,mode:0o700});
     job.directory=await mkdtemp(join(storageRoot,'job-'));
     const result=await runner(job.request,{
      directory:job.directory,signal:job.abort.signal,
      progress:change=>{
       if(job.status==='cancelled'||job.abort.signal.aborted)return;
       if(change.status)job.status=change.status;
       if(Number.isFinite(change.percent))job.percent=Math.max(0,Math.min(98,change.percent));
       if(change.title)job.title=change.title;
       if(change.duration)job.duration=change.duration;
       job.updatedAt=Date.now();
      }
     });
     if(job.abort.signal.aborted)throw Error('Job cancelled.');
     const info=await stat(result.path);
     if(!info.isFile()||info.size<=0)throw Error('The converter returned no output.');
     job.filePath=result.path;job.filename=result.filename;job.bytes=info.size;
     job.title=result.title||job.title;job.duration=result.duration||job.duration;
     job.status='ready';job.percent=100;job.errorCode=null;job.retryable=null;
    }catch(error){
     job.status=job.abort.signal.aborted?'cancelled':'failed';
     job.error=job.abort.signal.aborted?'Job cancelled.':String(error.message||'Media conversion failed.').slice(0,240);
     job.errorCode=job.abort.signal.aborted?'JOB_CANCELLED':(typeof error.code==='string'&&/^[A-Z_]{3,48}$/.test(error.code)?error.code:'MEDIA_PROCESSING_FAILED');
     job.retryable=job.abort.signal.aborted?false:(error.retryable===true);
     if(job.directory){await rm(job.directory,{recursive:true,force:true}).catch(()=>{});job.directory=null;}
    }finally{
     job.updatedAt=Date.now();active--;drain();
    }
   })().catch(()=>{active--;drain();});
  }
 }
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',base);
  const method=req.method||'GET';
  if(method==='GET'&&url.pathname==='/healthz')return reply(res,200,{ok:true,service:'pulse-youtube',mode:'authorized'});
  const jobRoute=url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})(?:\/(cancel|download))?$/);
  // File URLs require only the per-job random ticket. All other APIs require the service key.
  if(method==='GET'&&jobRoute?.[2]==='download'){
   const job=jobs.get(jobRoute[1]);
   if(!job||job.status!=='ready'||Date.now()-job.updatedAt>=ttlMs||!secureEqual(url.searchParams.get('ticket'),job.ticket))
    return reply(res,404,{error:'Download unavailable or expired.'});
   let file;try{file=await stat(job.filePath);}catch{return reply(res,404,{error:'Download file expired.'});}
   res.writeHead(200,{
    'Content-Type':CONTENT_TYPES[job.format],
    'Content-Length':file.size,
    'Content-Disposition':'attachment; filename="'+job.filename+'"',
    'Cache-Control':'no-store, private',
    'X-Content-Type-Options':'nosniff'
   });
   const stream=createReadStream(job.filePath);
   stream.on('error',()=>res.destroy());
   return stream.pipe(res);
  }
  const auth=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!secureEqual(auth,serviceToken))return reply(res,401,{error:'Service authentication required.'});
  if(method==='POST'&&url.pathname==='/v1/jobs'){
   if(active+queue.length>=maxActive+maxQueued)
    return reply(res,429,{error:'The converter is busy. Try again later.'});
   let input;
   try{input=validateJobRequest(await readBody(req));}
   catch(error){return reply(res,400,{error:error.message});}
   const id=randomUUID(),ticket=randomBytes(32).toString('base64url');
   const job={id,ticket,request:input,status:'queued',format:input.format,percent:0,
    createdAt:Date.now(),updatedAt:Date.now(),abort:new AbortController(),
    error:null,bytes:null,directory:null,filePath:null,filename:null,title:null,duration:null};
   jobs.set(id,job);queue.push(job);drain();
   return reply(res,202,status(job));
  }
  if(jobRoute&&method==='GET'&&!jobRoute[2]){
   const job=jobs.get(jobRoute[1]);return job?reply(res,200,status(job)):reply(res,404,{error:'Job not found.'});
  }
  if(jobRoute&&method==='POST'&&jobRoute[2]==='cancel'){
   const job=jobs.get(jobRoute[1]);if(!job)return reply(res,404,{error:'Job not found.'});
   if(['ready','failed','cancelled'].includes(job.status))
    return reply(res,409,{error:'Job is no longer running.'});
   job.status='cancelled';job.abort.abort();job.updatedAt=Date.now();
   return reply(res,200,status(job));
  }
  return reply(res,404,{error:'Unknown endpoint.'});
 });
 return {
  server,jobs,
  async close(){
   clearInterval(timer);
   for(const job of jobs.values())job.abort.abort();
   await new Promise(resolve=>server.close(()=>resolve()));
   await Promise.all([...jobs.values()].filter(x=>x.directory)
    .map(x=>rm(x.directory,{recursive:true,force:true}).catch(()=>{})));
  }
 };
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const serviceToken=process.env.PULSE_YT_SERVICE_TOKEN;
 const publicBaseUrl=process.env.PULSE_YT_PUBLIC_BASE_URL;
 if(!serviceToken||!publicBaseUrl){
  console.error('PULSE_YT_SERVICE_TOKEN and PULSE_YT_PUBLIC_BASE_URL are required.');process.exit(1);
 }
 const app=createApp({serviceToken,publicBaseUrl});
 const port=Number(process.env.PORT||8787);
 app.server.listen(port,'0.0.0.0',()=>{
  console.log('PULSE YouTube worker listening on port '+port+' (authorized mode)');
 });
}
