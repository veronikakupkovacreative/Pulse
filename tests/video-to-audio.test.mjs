import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {parseYouTubeLink,validateVideoFile,videoToAudioOptions,mountVideoToAudio,videoToAudioModule} from '../source/modules/video-audio-tool.mjs';
import {buildConversionArgs,convertMediaFile} from '../source/modules/converter.mjs';
import {visibleToolModules} from '../source/modules/index.mjs';

const ID='dQw4w9WgXcQ';

test('YouTube links are validated with strict hostname + video ID parsing',()=>{
 const valid=[
  'https://www.youtube.com/watch?v='+ID+'&t=15',
  'https://music.youtube.com/watch?v='+ID,
  'youtube.com/shorts/'+ID,
  'https://youtu.be/'+ID+'?si=abc',
  'https://www.youtube.com/live/'+ID,
  'https://www.youtube-nocookie.com/embed/'+ID
 ];
 for(const url of valid){
  const result=parseYouTubeLink(url);
  assert.equal(result.id,ID);
  assert.equal(result.embedUrl,'https://www.youtube-nocookie.com/embed/'+ID+'?rel=0');
  assert.equal(result.watchUrl,'https://www.youtube.com/watch?v='+ID);
 }
 for(const url of [
  'https://youtube.com.evil.test/watch?v='+ID,
  'https://youtube.com@evil.test/watch?v='+ID,
  'https://www.youtube.com/playlist?list=PL123',
  'javascript:alert(1)',
  'https://youtu.be/not-a-video',
  'https://youtube.com/watch?v=%3Cscript%3E',
  'https://www.youtube.com:9090/watch?v='+ID,
  '',
  'https://www.youtube.com/watch?v='+ID.slice(1)
 ])assert.throws(()=>parseYouTubeLink(url),Error,'Should reject '+url);
});
test('local video validation limits size and input media types',()=>{
 const good=validateVideoFile({name:'OWN_TRACK.MP4',size:42*1024*1024});
 assert.equal(good.extension,'mp4');
 assert.equal(good.isVideo,true);
 assert.equal(validateVideoFile({name:'demo.webm',size:800}).isVideo,true);
 assert.equal(validateVideoFile({name:'demo.wav',size:800}).isVideo,false);
 assert.throws(()=>validateVideoFile({name:'video.mp4',size:101*1024*1024}),/100 MB/);
 assert.throws(()=>validateVideoFile({name:'bad.exe',size:1}),/Unsupported/);
 assert.throws(()=>validateVideoFile(null),/Choose a video/);
});
test('local extraction uses real codecs and disables video streams in FFmpeg',async()=>{
 const mp3=videoToAudioOptions('mp3',{bitrate:'192',sampleRate:'48000'});
 const args=buildConversionArgs('clip.mp4','out.mp3',mp3);
 assert.ok(args.includes('-vn'));
 assert.deepEqual(args.slice(args.indexOf('-map'),args.indexOf('-map')+2),['-map','0:a:0']);
 assert.ok(args.includes('libmp3lame'));
 assert.ok(args.includes('192k'));
 assert.ok(args.includes('48000'));
 const wav=videoToAudioOptions('wav',{wavBits:'24',sampleRate:'original'});
 assert.ok(buildConversionArgs('clip.mov','out.wav',wav).includes('pcm_s24le'));
 const flac=videoToAudioOptions('flac');
 assert.equal(flac.format,'flac');
 for(const format of ['flac','aac','m4a','ogg'])assert.equal(videoToAudioOptions(format).format,format);
 assert.throws(()=>videoToAudioOptions('mp4'),/Choose MP3/);
 await assert.rejects(()=>convertMediaFile({name:'bad.exe',size:123,arrayBuffer:async()=>new ArrayBuffer(123)},{format:'mp3'}),/Unsupported/);
 await assert.rejects(()=>convertMediaFile({name:'clip.mp4',size:102*1024*1024,arrayBuffer:async()=>new ArrayBuffer(3)},{format:'mp3'}),/100 MB/);
});
test('Video to Audio mounts within Export with permission and no fake URL-to-audio action',()=>{
 const {window,document}=parseHTML('<html><body><div id="host"></div></body></html>');
 const before=globalThis.document;
 globalThis.document=document;
 try{
  const host=document.getElementById('host');
  const cleanup=mountVideoToAudio({host});
  assert.equal(videoToAudioModule.category,'export');
  assert.ok(visibleToolModules.some(tool=>tool.id==='video-to-audio'));
  assert.ok(host.querySelector('.pulse-video-audio'));
  assert.equal(host.querySelectorAll('[data-video-format]').length,6);
  assert.equal(host.querySelector('[data-video-convert]').disabled,true);
  const url=host.querySelector('[data-video-url]');
  url.value='https://youtu.be/'+ID;
  host.querySelector('[data-video-preview]').click();
  assert.ok(host.querySelector('iframe').src.includes(ID));
  assert.equal(host.querySelector('[data-video-preview-frame]').hidden,false);
  assert.equal(host.querySelector('[data-video-convert]').disabled,true);
  const fileInput=host.querySelector('[data-video-file]');
  Object.defineProperty(fileInput,'files',{configurable:true,value:[{name:'owned-session.mp4',size:500_000}]});
  fileInput.dispatchEvent(new window.Event('change'));
  assert.equal(host.querySelector('[data-video-convert]').disabled,true,'Permission required');
  const rights=host.querySelector('[data-video-rights]');
  rights.checked=true;rights.onchange();
  assert.equal(host.querySelector('[data-video-convert]').disabled,false);
  host.querySelector('[data-video-format="wav"]').click();
  assert.equal(host.querySelector('[data-video-wav-field]').hidden,false);
  assert.equal(host.querySelector('[data-video-bitrate-field]').hidden,true);
  assert.equal(host.querySelector('[data-video-format="wav"]').getAttribute('aria-pressed'),'true');
  cleanup();
 }finally{if(before===undefined)delete globalThis.document;else globalThis.document=before;}
});
test('red / black system includes Video to Audio and navigates from Export',()=>{
 const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
 const html=read('index.html'),css=read('modules/pulse-design-system.css');
 assert.match(html,/data-open-tool="video-to-audio"/);
 assert.match(css,/\.pulse-video-audio/);
 assert.match(css,/\.pulse-video-convert/);
 assert.match(css,/\.pulse-video-formats button\[aria-pressed="true"\]/);
 assert.match(css,/\.pulse-video-preview\[hidden\]/);
 assert.match(css,/\.pulse-video-privacy/);
 const mods=visibleToolModules.filter(m=>m.category==='export');
 assert.deepEqual(mods.map(m=>m.id),['wav','video-to-audio']);
});
