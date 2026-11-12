/** PULSE / YouTube Worker — strict inputs and subprocess plan.
 * Handles single public videos that the user has a valid right to download.
 * Does not use accounts, cookies, DRM workarounds, or private network URLs.
 */
import {spawn} from 'node:child_process';
import {readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';

export const MAX_DURATION_SECONDS=600;
export const MAX_SOURCE_BYTES=100*1024*1024;
export const MAX_OUTPUT_BYTES=150*1024*1024;
const VIDEO_ID=/^[a-zA-Z0-9_-]{11}$/;
const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com',
  'youtu.be','www.youtu.be','www.youtube-nocookie.com','youtube-nocookie.com']);
export const FORMATS=Object.freeze(['mp3','wav','mp4']);

export function canonicalYouTubeUrl(raw){
 if(typeof raw!=='string'||raw.length>2048)throw Error('Invalid YouTube URL.');
 let u;try{u=new URL(raw.trim());}catch{throw Error('Enter a complete YouTube URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||
  !HOSTS.has(u.hostname.toLowerCase()))throw Error('Only HTTPS YouTube video URLs are supported.');
 const host=u.hostname.toLowerCase();
 let id=null;
 if(host==='youtu.be'||host==='www.youtu.be'){
  const match=u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);if(match)id=match[1];
 }else if(u.pathname==='/watch'||u.pathname==='/watch/'){
  id=u.searchParams.get('v');
 }else{
  const match=u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/);
  if(match)id=match[1];
 }
 if(!VIDEO_ID.test(id||''))throw Error('The link does not contain a valid single video.');
 return {id,url:'https://www.youtube.com/watch?v='+id};
}
export function validateJobRequest(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Expected a request.');
 if(raw.rightsConfirmed!==true)throw Error('Confirm that you own the content or are authorized to download it.');
 const {id,url}=canonicalYouTubeUrl(raw.url);
 const format=String(raw.format||'').toLowerCase();
 if(!FORMATS.includes(format))throw Error('Choose MP3, WAV or MP4.');
 const bitrate=Number(raw.bitrate??192);
 if(format==='mp3'&&![128,192,256,320].includes(bitrate))throw Error('Invalid MP3 bitrate.');
 return {id,url,format,bitrate:format==='mp3'?bitrate:undefined};
}
export function metadataArgs(url){
 return ['--ignore-config','--no-playlist','--no-cache-dir','--no-warnings',
  '--skip-download','--dump-single-json','--socket-timeout','15',
  '--retries','2',url];
}
export function downloadArgs(url,directory,format){
 const selection=format==='mp4'?
  'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]':
  'bestaudio[ext=m4a]/bestaudio/best';
 const args=['--ignore-config','--no-playlist','--no-cache-dir','--no-warnings',
  '--no-write-info-json','--no-write-thumbnail','--no-write-subs',
  '--no-write-auto-subs','--no-write-comments',
  '--socket-timeout','15','--retries','2','--fragment-retries','2',
  '--max-filesize','100M','--newline','--format',selection,
  '-o',join(directory,'source.%(ext)s')];
 if(format==='mp4')args.push('--merge-output-format','mp4','--remux-video','mp4');
 return [...args,url];
}
export function audioEncodeArgs(input,output,format,bitrate=192){
 const common=['-nostdin','-hide_banner','-loglevel','error','-y','-i',input,
  '-vn','-map','0:a:0','-ar','44100','-ac','2'];
 if(format==='mp3')return [...common,'-c:a','libmp3lame','-b:a',bitrate+'k',output];
 if(format==='wav')return [...common,'-c:a','pcm_s16le',output];
 throw Error('Only MP3 and WAV require audio encoding.');
}
export function checkMetadata(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Video metadata unavailable.');
 const duration=Number(raw.duration);
 if(!Number.isFinite(duration)||duration<=0||duration>MAX_DURATION_SECONDS)
  throw Error('Only non-live videos up to 10 minutes are supported.');
 if(raw.is_live||raw.live_status==='is_live'||raw.live_status==='is_upcoming')
  throw Error('Live videos are not supported.');
 return {title:String(raw.title||'YouTube video').slice(0,120),duration};
}
export function parseProgress(line){
 const match=String(line).match(/(?:\[download\]\s+)?(\d+(?:\.\d+)?)%/);
 return match?Math.max(0,Math.min(100,Number(match[1]))):null;
}

/** Convert provider/encoder failures into safe, actionable public errors.
 * Never forward raw extractor stderr (which may contain internal URLs or options).
 * Verification challenges are not retryable from the same server.
 */
export function classifyProcessingFailure(command,output,exitCode=1){
 const details=String(output||'');
 const issue=(code,message,retryable=false)=>{
  const error=new Error(message);
  error.code=code;
  error.retryable=retryable;
  return error;
 };
 if(command==='yt-dlp'){
  if(/sign in to confirm you(?:['’]re| are) not a bot|cookies-from-browser|captcha|verify you(?:['’]re| are) not a bot/i.test(details))
   return issue('YOUTUBE_VERIFICATION_REQUIRED',
    'YouTube is requesting account verification from the download server. PULSE cannot access this video through Render. If this is your own upload, download the MP4 from YouTube Studio, then import it under Video to Audio.');
  if(/private video|members.only|sign in to confirm your age|age.restricted/i.test(details))
   return issue('YOUTUBE_ACCESS_RESTRICTED','This video requires private or age-restricted access. PULSE cannot retrieve it from the server.');
  if(/video unavailable|this video is unavailable|not available in your country|removed by the uploader/i.test(details))
   return issue('YOUTUBE_VIDEO_UNAVAILABLE','This YouTube video is unavailable to the server. Check the video and its access permissions.');
  return issue('YOUTUBE_DOWNLOAD_FAILED',
   'YouTube did not provide an accessible video stream to PULSE. Try an authorized local MP4 file or direct HTTPS media file instead.');
 }
 return issue('MEDIA_CONVERSION_FAILED',
  'Audio/video conversion failed. Check that your source has a supported media stream.');
}

/** No shell, no stdin, bounded logs, controllable timeout. */
export function execBinary(command,args,{timeoutMs=300000,signal,onOutput=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('Job cancelled.'));
  const child=spawn(command,args,{shell:false,stdio:['ignore','pipe','pipe'],
   env:{...process.env,NO_COLOR:'1'}});
  let settled=false,stdout='',stderr='';
  const append=(stream,bytes)=>{
   const value=String(bytes);
   if(stream==='stdout')stdout=(stdout+value).slice(-1048576);
   else stderr=(stderr+value).slice(-6000);
   for(const line of value.split(/\r?\n/))if(line.trim())onOutput(line.trim());
  };
  child.stdout.on('data',bytes=>append('stdout',bytes));
  child.stderr.on('data',bytes=>append('stderr',bytes));
  const stop=()=>child.kill('SIGKILL');
  const timer=setTimeout(stop,timeoutMs);
  signal?.addEventListener('abort',stop,{once:true});
  const finish=(error)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   signal?.removeEventListener('abort',stop);
   error?reject(error):resolve(stdout);
  };
  child.once('error',finish);
  child.once('close',code=>{
   if(signal?.aborted)return finish(Error('Job cancelled.'));
   if(code!==0)return finish(classifyProcessingFailure(command,stderr||stdout,code));
   finish(null);
  });
 });
}
async function findSource(directory,format){
 const names=(await readdir(directory)).filter(name=>/^source\.[a-zA-Z0-9]{2,8}$/.test(name)&&
  !name.endsWith('.part'));
 if(format==='mp4'){
  const name=names.find(n=>n.toLowerCase()==='source.mp4');
  if(!name)throw Error('MP4 unavailable for this video. Try MP3 or WAV.');
  return join(directory,name);
 }
 for(const name of names){
  const file=join(directory,name);
  if((await stat(file)).size>0)return file;
 }
 throw Error('Could not locate a downloaded audio stream.');
}
export async function processYouTubeJob(request,{directory,signal,progress=()=>{},run=execBinary}){
 const metaRaw=await run('yt-dlp',metadataArgs(request.url),{
  timeoutMs:35000,signal,onOutput:()=>{}});
 let info;
 try{info=checkMetadata(JSON.parse(metaRaw));}
 catch(error){if(error instanceof SyntaxError)throw Error('Could not read YouTube video metadata.');throw error;}
 progress({status:'downloading',percent:8,title:info.title,duration:info.duration});
 await run('yt-dlp',downloadArgs(request.url,directory,request.format),{
  timeoutMs:240000,signal,onOutput:line=>{
   const p=parseProgress(line);if(p!==null)progress({status:'downloading',percent:Math.round(8+p*.68)});
  }
 });
 const input=await findSource(directory,request.format);
 if((await stat(input)).size>MAX_SOURCE_BYTES)
  throw Error('The original file exceeds 100 MB.');
 const filename='pulse-youtube-'+request.id+'.'+request.format;
 const output=join(directory,filename);
 if(request.format==='mp4'){
  // yt-dlp downloaded/merged an MP4; use the canonical output filename.
  const {copyFile}=await import('node:fs/promises');
  await copyFile(input,output);
 }else{
  progress({status:'encoding',percent:80});
  await run('ffmpeg',audioEncodeArgs(input,output,request.format,request.bitrate),{
   timeoutMs:120000,signal,onOutput:()=>{}});
 }
 const target=await stat(output);
 if(target.size===0||target.size>MAX_OUTPUT_BYTES)
  throw Error('Output is empty or exceeds the 150 MB download limit.');
 return {path:output,filename,bytes:target.size,title:info.title,duration:info.duration};
}
