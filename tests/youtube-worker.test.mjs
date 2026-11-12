import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 canonicalYouTubeUrl,validateJobRequest,metadataArgs,downloadArgs,
 audioEncodeArgs,parseProgress,checkMetadata,processYouTubeJob,classifyProcessingFailure
} from '../services/youtube-worker/job-core.mjs';
import {createApp} from '../services/youtube-worker/server.mjs';

const VIDEO='dQw4w9WgXcQ';
const URL='https://www.youtube.com/watch?v='+VIDEO;
const TOKEN='a'.repeat(40);
test('strict single YouTube video validation prevents SSRF, playlists and command inputs',()=>{
 for(const url of [
  URL,'https://youtu.be/'+VIDEO,'https://youtube.com/shorts/'+VIDEO,
  'https://music.youtube.com/watch?v='+VIDEO,
  'https://www.youtube.com/live/'+VIDEO
 ])assert.equal(canonicalYouTubeUrl(url).url,URL);
 for(const invalid of [
  'http://youtube.com/watch?v='+VIDEO,
  'https://www.youtube.com.evil.example/watch?v='+VIDEO,
  'https://youtube.com@127.0.0.1/watch?v='+VIDEO,
  'https://www.youtube.com/playlist?list=PLabc',
  'https://www.youtube.com/watch?v='+VIDEO+'&evil=ignored#yes-no',
  'ftp://youtube.com/watch?v='+VIDEO,
  'https://127.0.0.1/watch?v='+VIDEO,
  'https://youtube.com:8443/watch?v='+VIDEO
 ]){
  if(invalid.includes('&evil='))assert.equal(canonicalYouTubeUrl(invalid).url,URL);
  else assert.throws(()=>canonicalYouTubeUrl(invalid));
 }
 assert.throws(()=>validateJobRequest({url:URL,format:'mp3'}),/Confirm/);
 assert.throws(()=>validateJobRequest({url:URL,format:'exe',rightsConfirmed:true}),/Choose MP3/);
 assert.throws(()=>validateJobRequest({url:URL,format:'mp3',bitrate:500,rightsConfirmed:true}),/bitrate/);
 assert.equal(validateJobRequest({url:URL,format:'wav',rightsConfirmed:true}).format,'wav');
});
test('yt-dlp and FFmpeg arguments never invoke shells and select only one media source',()=>{
 const opts=downloadArgs(URL,'/tmp/test-pulse','mp3');
 assert.ok(opts.includes('--no-playlist'));
 assert.ok(opts.includes('--no-cache-dir'));
 assert.ok(opts.includes('--max-filesize'));
 assert.ok(opts.includes('100M'));
 assert.equal(opts.at(-1),URL);
 assert.match(opts.join(' '),/source\.\%\(ext\)s/);
 const mp4=downloadArgs(URL,'/tmp/test-pulse','mp4');
 assert.ok(mp4.includes('--merge-output-format'));
 assert.ok(mp4.includes('mp4'));
 assert.deepEqual(audioEncodeArgs('src.m4a','out.mp3','mp3',256).slice(-5),
  ['-c:a','libmp3lame','-b:a','256k','out.mp3']);
 const wav=audioEncodeArgs('input.m4a','output.wav','wav');
 assert.ok(wav.includes('pcm_s16le'));assert.ok(wav.includes('-vn'));
 assert.equal(metadataArgs(URL).at(-1),URL);
});
test('duration, live restrictions and progress parsing are enforced',()=>{
 assert.throws(()=>checkMetadata({duration:601}),/10 minutes/);
 assert.throws(()=>checkMetadata({duration:0}),/10 minutes/);
 assert.throws(()=>checkMetadata({duration:99,is_live:true}),/Live/);
 assert.deepEqual(checkMetadata({title:'owned source',duration:98}),{title:'owned source',duration:98});
 assert.equal(parseProgress('[download] 45.7% of 6.9MiB'),45.7);
 assert.equal(parseProgress('[youtube] Extracting video information'),null);
});
test('job runner uses metadata -> yt-dlp -> FFmpeg and returns real file bytes (mocked downloader)',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pulse-job-core-'));
 const requests=[];let progress=[];
 try{
  const run=async(command,args)=>{
   requests.push({command,args});
   if(command==='yt-dlp'&&args.includes('--dump-single-json'))
    return JSON.stringify({title:'Original recording',duration:97,is_live:false});
   if(command==='yt-dlp'){
    await writeFile(join(directory,'source.m4a'),Buffer.from('fake audio content'));
    return '';
   }
   if(command==='ffmpeg'){
    await writeFile(args.at(-1),Buffer.from('RIFFfake audio result'));
    return '';
   }
   throw Error('Unexpected binary '+command);
  };
  const out=await processYouTubeJob({url:URL,id:VIDEO,format:'wav'},{
   directory,run,progress:value=>progress.push(value)
  });
  assert.equal(out.filename,'pulse-youtube-'+VIDEO+'.wav');
  assert.equal(out.bytes,21);
  assert.deepEqual(requests.map(x=>x.command),['yt-dlp','yt-dlp','ffmpeg']);
  assert.ok(progress.some(x=>x.status==='encoding'));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('real HTTP worker enforces auth, owner confirmation, tickets and download cleanup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pulse-youtube-http-'));
 const app=createApp({
  serviceToken:TOKEN,publicBaseUrl:'http://127.0.0.1:8787',storageRoot:root,ttlMs:120000,
  runner:async(input,{directory,progress})=>{
   progress({status:'downloading',percent:75,title:'Authorized recording',duration:44});
   const path=join(directory,'pulse-youtube-'+input.id+'.'+input.format);
   await writeFile(path,Buffer.from('media-file-bytes'));
   return {path,filename:'pulse-youtube-'+input.id+'.'+input.format,bytes:16,title:'Authorized recording',duration:44};
  }
 });
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const headers={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};
 const post=body=>fetch(base+'/v1/jobs',{method:'POST',headers,body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/healthz')).status,200);
  assert.equal((await fetch(base+'/v1/jobs',{method:'POST'})).status,401);
  assert.equal((await post({url:URL,format:'mp3',rightsConfirmed:false})).status,400);
  const created=await post({url:URL,format:'mp3',rightsConfirmed:true,bitrate:192});
  assert.equal(created.status,202);
  const createdBody=await created.json();
  assert.match(createdBody.id,/^[0-9a-f-]{36}$/);
  let job;
  for(let i=0;i<20;i++){
   job=await(await fetch(base+'/v1/jobs/'+createdBody.id,{headers})).json();
   if(job.status==='ready')break;
   await new Promise(resolve=>setTimeout(resolve,15));
  }
  assert.equal(job.status,'ready');
  assert.ok(job.downloadUrl.includes('ticket='));
  const downloadURL=new globalThis.URL(job.downloadUrl);
  const path=base+downloadURL.pathname+downloadURL.search;
  assert.equal((await fetch(base+downloadURL.pathname)).status,404);
  const result=await fetch(path);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('Content-Type'),'audio/mpeg');
  assert.equal(await result.text(),'media-file-bytes');
  assert.equal((await fetch(base+'/v1/jobs/'+createdBody.id+'/cancel',{method:'POST',headers})).status,409);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});


test('yt-dlp account verification is a safe non-retryable error, not an FFmpeg failure',()=>{
 const actual=classifyProcessingFailure('yt-dlp',
  "ERROR: [youtube] Rw3ekit855g: Sign in to confirm you’re not a bot. Use --cookies-from-browser",1);
 assert.equal(actual.code,'YOUTUBE_VERIFICATION_REQUIRED');
 assert.equal(actual.retryable,false);
 assert.match(actual.message,/YouTube is requesting account verification/);
 assert.match(actual.message,/YouTube Studio/);
 assert.doesNotMatch(actual.message,/cookies-from-browser|yt-dlp, code 1|Rw3ekit855g/);
 assert.equal(classifyProcessingFailure('yt-dlp','ERROR: private video',1).code,'YOUTUBE_ACCESS_RESTRICTED');
 assert.equal(classifyProcessingFailure('yt-dlp','ERROR: video unavailable',1).code,'YOUTUBE_VIDEO_UNAVAILABLE');
 const generic=classifyProcessingFailure('yt-dlp','ERROR: Some internal debugging details that must not leak',1);
 assert.equal(generic.code,'YOUTUBE_DOWNLOAD_FAILED');
 assert.doesNotMatch(generic.message,/internal debugging/);
 assert.equal(classifyProcessingFailure('ffmpeg','Failed transcoding',1).code,'MEDIA_CONVERSION_FAILED');
});

test('real HTTP job state reports a structured verification error without raw yt-dlp output',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pulse-youtube-denied-'));
 const app=createApp({serviceToken:TOKEN,publicBaseUrl:'http://127.0.0.1:8787',
  storageRoot:directory,runner:async()=>{throw classifyProcessingFailure('yt-dlp',"ERROR: [youtube] Rw3ekit855g: Sign in to confirm you're not a bot. --cookies-from-browser",1);}
 });
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const headers={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};
 try{
  const created=await fetch(base+'/v1/jobs',{method:'POST',headers,
   body:JSON.stringify({url:URL,format:'mp3',rightsConfirmed:true})});
  assert.equal(created.status,202);
  const id=(await created.json()).id;
  let result;
  for(let attempt=0;attempt<25;attempt++){
   result=await(await fetch(base+'/v1/jobs/'+id,{headers})).json();
   if(result.status==='failed')break;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(result.status,'failed');
  assert.equal(result.errorCode,'YOUTUBE_VERIFICATION_REQUIRED');
  assert.equal(result.retryable,false);
  assert.match(result.error,/YouTube Studio/);
  assert.doesNotMatch(JSON.stringify(result),/cookies-from-browser|Rw3ekit855g/);
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
