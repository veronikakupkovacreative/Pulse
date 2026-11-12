import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDirectMediaUrl,fetchAuthorizedMedia} from '../source/modules/media-source.mjs';
import mediaHandler from '../api/pulse-media-source.js';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountVideoToAudio} from '../source/modules/video-audio-tool.mjs';

test('only public direct HTTPS media files pass the URL validator',()=>{
 const ok=validateDirectMediaUrl('https://files.example.net/recording.mp4?expires=123&token=secret');
 assert.equal(ok.name,'recording.mp4');
 assert.ok(ok.url.includes('token=secret'));
 for(const bad of [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://rr3.googlevideo.com/videoplayback.mp4',
  'http://files.example.net/song.mp3',
  'https://127.0.0.1/a.wav',
  'https://192.168.1.2/private.mp4',
  'https://localhost/audio.wav',
  'https://media.local/media.wav',
  'https://files.example.net/playlist',
  'https://files.example.net:9443/audio.mp3',
  'https://user:pass@files.example.net/a.mp3',
  'https://files.example.net/share.html'
 ])assert.throws(()=>validateDirectMediaUrl(bad),Error,bad);
});
test('CORS-enabled direct media imports are streamed locally and preserve file name',async()=>{
 const content=new TextEncoder().encode('RIFF permitted user audio');
 let actual;
 const file=await fetchAuthorizedMedia('https://cdn.example.com/permitted-sample.wav?sig=xyz',{
  fetchImpl:async(url,opts)=>{
   actual={url,opts};
   return new Response(content,{status:200,headers:{'Content-Type':'audio/wav','Content-Length':String(content.length)}});
  }
 });
 assert.equal(file.name,'permitted-sample.wav');
 assert.equal(file.size,content.length);
 assert.equal(actual.opts.credentials,'omit');
 assert.equal(actual.opts.mode,'cors');
 assert.equal(actual.opts.redirect,'error');
 assert.equal(actual.opts.referrerPolicy,'no-referrer');
 assert.equal(new TextDecoder().decode(await file.arrayBuffer()),'RIFF permitted user audio');
});
test('reject oversized streams and non-media pages, with no arbitrary cloud fetch',async()=>{
 const source='https://media.example.org/clip.mp4';
 await assert.rejects(()=>fetchAuthorizedMedia(source,{fetchImpl:async()=>new Response('no',{headers:{'Content-Type':'text/html'}})}),/not a media file/);
 await assert.rejects(()=>fetchAuthorizedMedia(source,{fetchImpl:async()=>new Response('video',{headers:{'Content-Type':'video/mp4','Content-Length':String(105000000)}})}),/100 MB/);
 await assert.rejects(()=>fetchAuthorizedMedia(source,{fetchImpl:async()=>{throw TypeError('CORS blocked');}}),/CORS/);
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(()=>fetchAuthorizedMedia(source,{signal:ctrl.signal,fetchImpl:async()=>{throw Error('should not fetch');}}),/cancel|abort/i);
});
function mockRes(){return {
 code:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
 status(code){this.code=code;return this;},json(data){this.data=data;return this;}
};}
test('provider gateway is allowlisted metadata only, not an SSRF/open proxy',async()=>{
 const prior=process.env.PULSE_MEDIA_ALLOWED_HOSTS;
 try{
  delete process.env.PULSE_MEDIA_ALLOWED_HOSTS;
  let res=mockRes();await mediaHandler({method:'GET'},res);
  assert.equal(res.code,200);assert.equal(res.data.configured,false);
  res=mockRes();await mediaHandler({method:'POST',body:{url:'https://cdn.example.org/x.wav',consent:true}},res);
  assert.equal(res.code,503);
  process.env.PULSE_MEDIA_ALLOWED_HOSTS='cdn.example.org,media.example.org';
  res=mockRes();await mediaHandler({method:'POST',body:{url:'https://cdn.evil.example.org/x.wav',consent:true}},res);
  assert.equal(res.code,403);
  res=mockRes();await mediaHandler({method:'POST',body:{url:'https://cdn.example.org/x.wav',consent:false}},res);
  assert.equal(res.code,400);
  res=mockRes();await mediaHandler({method:'POST',body:{url:'https://cdn.example.org/x.wav?sig=secret',consent:true}},res);
  assert.equal(res.code,200);assert.equal(res.data.transport,'browser-cors');
  assert.ok(res.data.downloadUrl.startsWith('https://cdn.example.org/x.wav'));
 }finally{if(prior===undefined)delete process.env.PULSE_MEDIA_ALLOWED_HOSTS;else process.env.PULSE_MEDIA_ALLOWED_HOSTS=prior;}
});
test('Video to Audio mounts direct URL import separate from YouTube preview',()=>{
 const {document}=parseHTML('<html><body><div id="host"></div></body></html>');
 const original=globalThis.document;globalThis.document=document;
 try{
  const host=document.getElementById('host'),cleanup=mountVideoToAudio({host});
  assert.ok(host.querySelector('[data-video-preview]'));
  assert.ok(host.querySelector('[data-video-direct-url]'));
  assert.ok(host.querySelector('[data-video-import-url]'));
  assert.ok(host.querySelector('[data-video-rights]'));
  host.querySelector('[data-video-direct-url]').value='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  host.querySelector('[data-video-import-url]').click();
  assert.ok(host.querySelector('[data-video-direct-status]').textContent.includes('Confirm permission'));
  cleanup();
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
test('source architecture does not include an arbitrary media proxy',()=>{
 const fn=readFileSync(new URL('../api/pulse-media-source.js',import.meta.url),'utf8');
 assert.doesNotMatch(fn,/fetch\(\s*parsed|fetch\(\s*req|https\.get\(/);
 assert.match(fn,/PULSE_MEDIA_ALLOWED_HOSTS/);
 assert.match(fn,/browser-cors/);
});
