/** PULSE / Video to Audio — YouTube preview and local media audio conversion.
 * No YouTube scraping, server uploads or misleading download-by-link claims.
 */
import {conversionOptions,convertMediaFile,downloadConversion} from './converter.mjs';
import {fetchAuthorizedMedia,validateDirectMediaUrl} from './media-source.mjs';
import {mountYouTubeControls} from './youtube-ui.mjs';

const ID=/^[A-Za-z0-9_-]{11}$/;
const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com',
  'youtube-nocookie.com','www.youtube-nocookie.com','youtu.be','www.youtu.be']);
const OUTPUTS=['mp3','wav','flac','aac','m4a','ogg'];
const VIDEO_EXT=['mp4','mov','webm','mkv','m4v','3gp','ts'];
const ALLOWED=new Set([...VIDEO_EXT,'wav','wave','mp3','flac','aac','m4a','ogg','oga','wma','asf','aif','aiff']);
const cleanBase=name=>String(name).replace(/\.[^.]+$/,'').replace(/[^a-z0-9 _-]/gi,'-').slice(0,80)||'converted-video';

export function parseYouTubeLink(raw){
 const str=String(raw||'').trim();
 if(!str||str.length>2048)throw Error('Enter a valid YouTube video link.');
 let parsed;
 try{parsed=new URL(/^(https?:)?\/\//i.test(str)?str:'https://'+str);}
 catch{throw Error('Enter a complete YouTube watch or short link.');}
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.port||
    !HOSTS.has(parsed.hostname.toLowerCase()))
  throw Error('Only direct YouTube video links are supported for preview.');
 const host=parsed.hostname.toLowerCase(),path=parsed.pathname;
 let id=null;
 if(host==='youtu.be'||host==='www.youtu.be'){
   if(/^\/[A-Za-z0-9_-]{11}\/?$/.test(path))id=path.slice(1).replace(/\/$/,'');
 }else if(path==='/watch'||path==='/watch/'){
   id=parsed.searchParams.get('v');
 }else{
   const match=path.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/);
   if(match)id=match[1];
 }
 if(!ID.test(id||''))throw Error('Could not find a valid YouTube video ID in that link.');
 return {
   id,watchUrl:'https://www.youtube.com/watch?v='+id,
   embedUrl:'https://www.youtube-nocookie.com/embed/'+id+'?rel=0'
 };
}

export function validateVideoFile(file){
 if(!file||typeof file.name!=='string'||!Number.isFinite(file.size)||file.size<=0)
  throw Error('Choose a video or audio file first.');
 if(file.size>100*1024*1024)throw Error('Maximum local media size is 100 MB.');
 const extension=file.name.split('.').pop().toLowerCase();
 if(!ALLOWED.has(extension))
  throw Error('Unsupported input. Choose MP4, MOV, WEBM, MKV or a compatible audio file.');
 return {name:file.name,size:file.size,extension,isVideo:VIDEO_EXT.includes(extension)};
}

export function videoToAudioOptions(format,{bitrate='320',wavBits='24',sampleRate='44100'}={}){
 if(!OUTPUTS.includes(format))throw Error('Choose MP3, WAV, FLAC, AAC, M4A or OGG.');
 return conversionOptions({
   format,bitrate,bitDepth:wavBits,sampleRate,oggQuality:'6',flacLevel:'5'
 });
}

export function mountVideoToAudio({host}={}){
 if(!host)throw Error('Video to Audio needs a host element.');
 const formatButtons=OUTPUTS.map(id=>
  '<button type="button" data-video-format="'+id+'" aria-pressed="'+String(id==='mp3')+'">'+
  id.toUpperCase()+'</button>').join('');
 host.innerHTML=
 '<section class="tool-view pulse-video-audio" aria-label="Video to Audio converter">'+
 '<div class="tool-view-header"><span>03 / VIDEO TO AUDIO</span><span>LOCAL FFmpeg / MP3 + WAV</span></div>'+
 '<h3>Just the audio.<br><span>Keep the sound.</span></h3>'+
 '<p class="tool-description">Preview YouTube videos, or import an authorized direct HTTPS media-file URL / local file. Encode MP3, WAV, FLAC, AAC, M4A or OGG in your browser.</p>'+
 '<div class="pulse-video-block">'+
 '<div class="pulse-video-section"><span>01 / YOUTUBE DOWNLOADER</span><span>PREVIEW + MP3 / WAV / MP4</span></div>'+
 '<label class="pulse-video-label" for="pulse-video-link">PASTE YOUTUBE VIDEO URL</label>'+
 '<div class="pulse-video-linkrow"><input id="pulse-video-link" type="url" inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://www.youtube.com/watch?v=..." data-video-url>'+
 '<button type="button" data-video-preview>PREVIEW VIDEO ↗</button></div>'+
 '<div class="pulse-video-preview" data-video-preview-frame hidden></div>'+
 '<p class="pulse-video-status" data-video-url-status role="status" aria-live="polite">Use PREVIEW to watch the video; the separate downloader below processes authorized MP3/WAV/MP4 requests.</p>'+
 '<p class="pulse-video-note">Only download content where the platform permits it and you have appropriate rights. For your own uploads, <a href="https://studio.youtube.com/" target="_blank" rel="noopener noreferrer">YouTube Studio ↗</a> is also an official download option. The PULSE downloader uses an external authorized worker.</p>'+
 '</div>'+
 '<div class="pulse-video-block">'+
 '<div class="pulse-video-section"><span>02 / DIRECT HTTPS FILE</span><span>CORS REQUIRED / 100 MB MAX</span></div>'+
 '<label class="pulse-video-label" for="pulse-direct-url">AUTHORIZED MEDIA FILE URL · MP4, MOV, MP3, WAV…</label>'+
 '<div class="pulse-video-linkrow"><input id="pulse-direct-url" type="url" spellcheck="false" autocomplete="off" placeholder="https://cdn.example.com/owned-video.mp4" data-video-direct-url>'+
 '<button type="button" data-video-import-url>IMPORT FILE ↗</button></div>'+
 '<p class="pulse-video-status" data-video-direct-status role="status" aria-live="polite">Use a direct HTTPS file link (including a signed storage URL), not a YouTube or sharing page. The host must allow CORS.</p>'+
 '</div>'+
 '<div class="pulse-video-block">'+
 '<div class="pulse-video-section"><span>03 / IMPORT MEDIA FILE</span><span>UP TO 100 MB</span></div>'+
 '<label class="pulse-video-upload" for="pulse-video-file"><span>CHOOSE VIDEO / AUDIO FILE</span><strong>MP4 · MOV · WEBM · MKV · M4A</strong></label>'+
 '<input id="pulse-video-file" class="pulse-video-file-input" type="file" accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.m4v,.m4a,.mp3,.wav,.flac,.ogg" data-video-file>'+
 '<p class="pulse-video-fileinfo" data-video-fileinfo>NO MEDIA FILE SELECTED</p>'+
 '</div>'+
 '<div class="pulse-video-block">'+
 '<div class="pulse-video-section"><span>04 / OUTPUT SETTINGS</span><span>ENCODE IN BROWSER</span></div>'+
 '<div class="pulse-video-formats" role="group" aria-label="Audio output format">'+formatButtons+'</div>'+
 '<div class="pulse-video-settings">'+
 '<label class="pulse-video-setting">SAMPLE RATE<select data-video-sample-rate>'+
 '<option value="44100">44.1 kHz</option><option value="48000">48 kHz</option><option value="original">ORIGINAL</option></select></label>'+
 '<label class="pulse-video-setting" data-video-bitrate-field>BITRATE<select data-video-bitrate>'+
 '<option value="128">128 kbps</option><option value="192">192 kbps</option>'+
 '<option value="256">256 kbps</option><option value="320" selected>320 kbps</option></select></label>'+
 '<label class="pulse-video-setting" data-video-wav-field hidden>WAV BIT DEPTH<select data-video-wav-bits>'+
 '<option value="16">16-bit PCM</option><option value="24" selected>24-bit PCM</option></select></label>'+
 '</div>'+
 '<label class="pulse-video-rights"><input type="checkbox" data-video-rights> I own this media or have permission to convert its audio.</label>'+
 '<button type="button" class="pulse-video-convert" data-video-convert disabled>CONVERT &amp; DOWNLOAD <span aria-hidden="true">↗</span></button>'+
 '<div class="pulse-video-progress" role="progressbar" aria-label="Video audio extraction progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>'+
 '<p class="pulse-video-status" data-video-status role="status" aria-live="polite">Choose a video file and output format to begin.</p>'+
 '</div>'+
 '<p class="pulse-video-privacy">LOCAL FILE CONVERSION STAYS IN YOUR BROWSER · YOUTUBE DOWNLOADS USE AN OPTIONAL SERVER WORKER</p>'+
 '</section>';
 const cleanupYoutube=mountYouTubeControls({host,parseYouTubeLink});
 let disposed=false,busy=false,sourceFile=null,format='mp3',remoteController=null;
 const $=selector=>host.querySelector(selector);
 const all=selector=>[...host.querySelectorAll(selector)];
 const link=$('[data-video-url]'),frame=$('[data-video-preview-frame]');
 const status=(message,error=false,target='[data-video-status]')=>{
  if(disposed)return;
  const el=$(target);el.textContent=message;el.dataset.error=String(error);
 };
 const convert=$('[data-video-convert]'),input=$('[data-video-file]');
 const remoteLoad=$('[data-video-import-url]'),remoteInput=$('[data-video-direct-url]');
 const rights=$('[data-video-rights]');
 const progress=$('.pulse-video-progress'),progressBar=progress.querySelector('i');
 function update(){
  if(disposed)return;
  convert.disabled=busy||!sourceFile||!rights.checked;
  input.disabled=busy;
  remoteLoad.disabled=busy;
  remoteInput.disabled=busy;
  rights.disabled=busy;
  all('[data-video-format],[data-video-sample-rate],[data-video-bitrate],[data-video-wav-bits]').forEach(el=>el.disabled=busy);
  $('[data-video-bitrate-field]').hidden=!['mp3','aac','m4a'].includes(format);
  $('[data-video-wav-field]').hidden=format!=='wav';
  all('[data-video-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.videoFormat===format)));
 }
 $('[data-video-preview]').onclick=()=>{
  try{
   const parsed=parseYouTubeLink(link.value);
   const embed=document.createElement('iframe');
   embed.title='YouTube video preview';
   embed.loading='lazy';
   embed.referrerPolicy='strict-origin-when-cross-origin';
   embed.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share';
   embed.allowFullscreen=true;
   embed.src=parsed.embedUrl;
   frame.replaceChildren(embed);frame.hidden=false;
   status('Preview loaded. To convert your own video, upload the downloaded source file below.',
     false,'[data-video-url-status]');
  }catch(error){
   frame.replaceChildren();frame.hidden=true;
   status(error.message||'Invalid YouTube URL.',true,'[data-video-url-status]');
  }
 };
 link.addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();$('[data-video-preview]').click();}
 });
 remoteInput.addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();remoteLoad.click();}
 });
 remoteLoad.onclick=async()=>{
  if(busy||disposed)return;
  if(!rights.checked){status('Confirm permission to convert the media below before importing.',true,'[data-video-direct-status]');return;}
  try{validateDirectMediaUrl(remoteInput.value);}
  catch(error){status(error.message,true,'[data-video-direct-status]');return;}
  const abort=new AbortController();remoteController=abort;
  busy=true;update();status('Importing your authorized direct HTTPS media file…',false,'[data-video-direct-status]');
  try{
   const media=await fetchAuthorizedMedia(remoteInput.value,{
    signal:abort.signal,onProgress:({received,total})=>{
     if(!disposed)status('Downloaded '+(received/1048576).toFixed(1)+' MB'+(total?' / '+(total/1048576).toFixed(1)+' MB':''),false,'[data-video-direct-status]');
    }
   });
   if(disposed||abort.signal.aborted)return;
   validateVideoFile(media);
   sourceFile=media;input.value='';
   $('[data-video-fileinfo]').textContent=media.name+' · '+(media.size/1048576).toFixed(1)+' MB · HTTPS';
   status('HTTPS media imported. Choose an output format and click Convert & Download.',false,'[data-video-direct-status]');
   status('Authorized media ready for local conversion.');
  }catch(error){
   if(!disposed)status(error.message||'Could not import media URL.',true,'[data-video-direct-status]');
  }finally{
   if(remoteController===abort)remoteController=null;
   if(!disposed){busy=false;update();}
  }
 };
 input.addEventListener('change',()=>{
  try{
   const selected=input.files?.[0];
   if(!selected){sourceFile=null;$('[data-video-fileinfo]').textContent='NO MEDIA FILE SELECTED';update();return;}
   const info=validateVideoFile(selected);
   sourceFile=selected;
   $('[data-video-fileinfo]').textContent=info.name+' · '+(info.size/1024/1024).toFixed(1)+' MB';
   status('File ready. Choose format, confirm permission and click Convert & Download.');
  }catch(error){
   sourceFile=null;input.value='';$('[data-video-fileinfo]').textContent='NO MEDIA FILE SELECTED';
   status(error.message,true);
  }
  update();
 });
 all('[data-video-format]').forEach(b=>b.onclick=()=>{format=b.dataset.videoFormat;update();});
 rights.onchange=update;
 const onProgress=percent=>{
  if(disposed)return;
  const progressValue=Math.min(100,Math.max(0,Number(percent)||0));
  progress.setAttribute('aria-valuenow',String(progressValue));
  progressBar.style.width=progressValue+'%';
 };
 convert.onclick=async()=>{
  if(disposed||busy)return;
  const file=sourceFile;
  try{
   validateVideoFile(file);
   if(!rights.checked)throw Error('Confirm that you have permission to convert this media.');
   const opts=videoToAudioOptions(format,{
    bitrate:$('[data-video-bitrate]').value,wavBits:$('[data-video-wav-bits]').value,
    sampleRate:$('[data-video-sample-rate]').value
   });
   busy=true;update();onProgress(0);
   status('Preparing local audio extraction. First use may download the FFmpeg engine…');
   const blob=await convertMediaFile(file,opts,txt=>status(txt),onProgress);
   if(disposed)return;
   downloadConversion(blob,cleanBase(file.name),opts.format);
   status('Downloaded '+opts.format.toUpperCase()+' · '+(blob.size/1024/1024).toFixed(2)+' MB. The video was processed locally.');
  }catch(error){status(error.message||'Video conversion failed.',true);}
  finally{busy=false;update();}
 };
 update();
 return()=>{disposed=true;cleanupYoutube();remoteController?.abort();frame.replaceChildren();sourceFile=null;};
}
export const videoToAudioModule=Object.freeze({
 id:'video-to-audio',category:'export',label:'Video to Audio',mount:mountVideoToAudio
});
