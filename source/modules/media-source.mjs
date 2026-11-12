/** Browser-only import of directly accessible media files.
 * It DOES NOT download from video platforms or bypass source authorization.
 * Supports user-owned HTTPS objects/CDN links that permit CORS.
 */
const MAX_BYTES=100*1024*1024;
const EXTENSIONS=new Set(['mp4','mov','webm','mkv','m4v','3gp','ts',
 'wav','wave','mp3','flac','aac','m4a','ogg','oga','wma','asf','aif','aiff']);
const VIDEO_PLATFORM=/(\.|^)(youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com|ytimg\.com)$/i;
export const REMOTE_MEDIA_MAX_BYTES=MAX_BYTES;
export function validateDirectMediaUrl(raw,{checkExtension=true}={}){
 if(typeof raw!=='string'||!raw.trim()||raw.length>2048)throw Error('Enter a direct HTTPS media-file URL.');
 let url;try{url=new URL(raw.trim());}catch{throw Error('Enter a complete HTTPS media-file URL.');}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||
  !host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
  host.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.startsWith('[')||
  VIDEO_PLATFORM.test(host))
  throw Error('Use an authorized public HTTPS media file, not a video page, private host or YouTube stream.');
 const name=decodeURIComponent(url.pathname.split('/').pop()||'').split(/[?#]/)[0]||'';
 const extension=name.includes('.')?name.split('.').pop().toLowerCase():'';
 if(checkExtension&&!EXTENSIONS.has(extension))
  throw Error('The URL must end in a media filename (.mp4, .mov, .webm, .mp3, .wav, etc.). Sharing pages are not direct files.');
 return {url:url.href,name:name.replace(/[^a-z0-9._ -]/gi,'_').slice(0,110)||'imported-audio.mp4',extension};
}
function ensureMime(value){
 const mime=String(value||'').split(';')[0].trim().toLowerCase();
 if(/^(text\/|application\/(json|xml|xhtml\+xml|javascript))/.test(mime))
  throw Error('The link returned a page or document, not a media file.');
 return mime||'application/octet-stream';
}
export async function fetchAuthorizedMedia(raw,{signal,onProgress=()=>{},fetchImpl=globalThis.fetch}={}){
 const source=validateDirectMediaUrl(raw);
 if(signal?.aborted)throw signal.reason||Error('Import cancelled.');
 if(typeof fetchImpl!=='function')throw Error('Browser download is unavailable.');
 const ctrl=new AbortController(),cancel=()=>ctrl.abort();
 signal?.addEventListener('abort',cancel,{once:true});
 const timeout=setTimeout(()=>ctrl.abort(),120000);
 let response;
 try{
  // credentials: omit — never send browser cookies or credentials to external origins.
  // redirect: error — signed direct file URL must not bounce to an unapproved host.
  response=await fetchImpl(source.url,{
   method:'GET',mode:'cors',credentials:'omit',redirect:'error',
   referrerPolicy:'no-referrer',signal:ctrl.signal
  });
  if(!response?.ok)throw Error('Could not retrieve media file (HTTP '+(response?.status||'unknown')+').');
  ensureMime(response.headers?.get('content-type'));
  const length=Number(response.headers?.get('content-length')||0);
  if(Number.isFinite(length)&&length>MAX_BYTES)
   throw Error('Remote source exceeds the 100 MB import limit.');
  const chunks=[];let received=0;
  if(response.body?.getReader){
   const reader=response.body.getReader();
   try{
    while(true){
     const {value,done}=await reader.read();if(done)break;
     if(ctrl.signal.aborted)throw Error('Import cancelled.');
     received+=value.byteLength;
     if(received>MAX_BYTES)throw Error('Remote media exceeds the 100 MB limit.');
     chunks.push(value);
     onProgress({received,total:length||null});
    }
   }finally{if(ctrl.signal.aborted)await reader.cancel().catch(()=>{});}
  }else{
   const binary=await response.arrayBuffer();
   received=binary.byteLength;
   if(received>MAX_BYTES)throw Error('Remote media exceeds the 100 MB limit.');
   chunks.push(binary);onProgress({received,total:length||received});
  }
  if(!received)throw Error('The remote media file is empty.');
  const result=new Blob(chunks,{type:ensureMime(response.headers?.get('content-type'))});
  Object.defineProperty(result,'name',{value:source.name,enumerable:true});
  return result;
 }catch(error){
  if(ctrl.signal.aborted)throw Error('Import was cancelled or timed out.');
  if(error instanceof TypeError)throw Error('Could not fetch the remote file. Its host must allow CORS for PULSE; otherwise download it yourself and upload the file.');
  throw error;
 }finally{
  clearTimeout(timeout);signal?.removeEventListener('abort',cancel);
 }
}
