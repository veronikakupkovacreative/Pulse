/**
 * PULSE / MusicGPT Stem Extraction v2
 * Owner-gated, server-side-only gateway. Submission spends provider credits.
 * No automatic retry for paid submit. Results are fetched by conversion ID.
 * Documentation: https://docs.musicgpt.com/api-documentation/endpoint/extraction
 */
import {timingSafeEqual} from 'node:crypto';

const EXTRACT='https://api.musicgpt.com/api/public/v2/Extraction';
const RESULT='https://api.musicgpt.com/api/public/v1/byId';
export const MAX_FILE_BYTES=2_400_000;
const MAX_BASE64=3_200_004;
const MAX_BODY=3_300_000;
const ID=/^[A-Za-z0-9_-]{8,128}$/;
export const STEMS=Object.freeze([
 'vocals','instrumental','male_vocal','female_vocal','lead_vocal','back_vocal',
 'bass','drums','guitar','piano','keys','strings','winds','rhythm_guitar',
 'solo_guitar','acoustic_guitar','electric_guitar','kick_drum','snare_drum',
 'toms','hi_hat','ride','crash'
]);
const allowedStems=new Set(STEMS);
const allowedPre=new Set(['Denoise','Deecho','Dereverb']);
const response=(res,status,data)=>res.status(status).json(data);
const configured=()=>Boolean(process.env.MUSICGPT_EXTRACTION_API_KEY&&process.env.PULSE_MUSICGPT_OWNER_TOKEN);
function equal(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function youtubeUrl(raw){
 if(typeof raw!=='string'||raw.length>2048)return null;
 try{
  const url=new URL(raw.trim());
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return null;
  const h=url.hostname.toLowerCase();
  let id='';
  if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(h)){
   if(url.pathname!=='/watch')return null;
   id=url.searchParams.get('v')||'';
  }else if(['youtu.be','www.youtu.be'].includes(h)){
   if(url.pathname.split('/').filter(Boolean).length!==1)return null;
   id=url.pathname.slice(1);
  }else return null;
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))return null;
  // Canonical provider-supported link. No arbitrary file proxying or SSRF.
  return 'https://www.youtube.com/watch?v='+encodeURIComponent(id);
 }catch{return null;}
}
function allowedDownloadUrl(value){
 if(typeof value!=='string'||value.length>4096)return null;
 try{
  const url=new URL(value);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'
   ||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')
   ||/^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)
   ||host.includes(':'))return null;
  return url.href;
 }catch{return null;}
}
function parseBody(raw){
 try{
  if(typeof raw==='string'){
   if(raw.length>MAX_BODY)return null;
   raw=JSON.parse(raw);
  }
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(JSON.stringify(raw).length>MAX_BODY)return null;
  return raw;
 }catch{return null;}
}
function selected(values,allowed,max,required=false){
 if(!Array.isArray(values)||values.length>max||!values.every(v=>typeof v==='string'&&allowed.has(v)))return null;
 const unique=[...new Set(values)];
 return required&&unique.length===0?null:unique;
}
function audioFile(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.name!=='string'||typeof raw.base64!=='string'
   ||raw.base64.length<1368||raw.base64.length>MAX_BASE64||raw.base64.length%4!==0
   ||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.base64))
  throw Error('INVALID_AUDIO_FILE');
 const name=raw.name.replace(/[^A-Za-z0-9._-]/g,'-').slice(0,96);
 if(!/\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i.test(name))throw Error('INVALID_AUDIO_FORMAT');
 const bytes=Buffer.from(raw.base64,'base64');
 if(bytes.length<1024||bytes.length>MAX_FILE_BYTES)throw Error('AUDIO_TOO_LARGE');
 const mime=/\.wav$/i.test(name)?'audio/wav':/\.mp3$/i.test(name)?'audio/mpeg':'application/octet-stream';
 return {name,bytes,mime};
}
function providerFailure(status,json){
 const message=String(json?.error||json?.message||'').slice(0,250).toLowerCase();
 if(status===402||/insufficient|not enough credit|credit balance/.test(message))return {status:402,error:'INSUFFICIENT_CREDITS'};
 if(status===401||status===403)return {status,error:'MUSICGPT_AUTH_FAILED'};
 if(status===429)return {status:429,error:'RATE_LIMITED'};
 if(status===400||status===422)return {status:422,error:'INVALID_PROVIDER_REQUEST'};
 return {status:502,error:'MUSICGPT_PROVIDER_ERROR'};
}
async function provider(url,{method='GET',body}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),method==='POST'?48_000:22_000);
 try{
  const reply=await fetch(url,{method,body,headers:{
   Authorization:process.env.MUSICGPT_EXTRACTION_API_KEY,Accept:'application/json'
  },redirect:'error',cache:'no-store',signal:controller.signal});
  const data=await reply.json().catch(()=>null);
  if(!reply.ok||data?.success===false)return {ok:false,...providerFailure(reply.status,data)};
  if(!data||typeof data!=='object'||Array.isArray(data))return {ok:false,status:502,error:'INVALID_PROVIDER_RESPONSE'};
  return {ok:true,data};
 }catch(e){
  return {ok:false,status:502,error:e?.name==='AbortError'?'MUSICGPT_TIMEOUT':'MUSICGPT_CONNECTION_ERROR'};
 }finally{clearTimeout(timer);}
}
function normalizeMap(value){
 if(!value)return {};
 if(typeof value==='string'){
  if(value.length>40_000)return {};
  try{value=JSON.parse(value);}catch{return {};}
 }
 if(Array.isArray(value)){
  return Object.fromEntries(value.filter(x=>x&&typeof x==='object')
   .map(x=>[x.stem??x.name??x.type,x.audio_url??x.url])
   .filter(x=>typeof x[0]==='string'&&typeof x[1]==='string'));
 }
 if(!value||typeof value!=='object')return {};
 return value;
}
export function safeStemFiles(conversion){
 const data=conversion&&typeof conversion==='object'?conversion:{};
 const mp3=normalizeMap(data.audio_url??data.output?.audio_url??data.output);
 const wav=normalizeMap(data.audio_url_wav??data.output?.audio_url_wav);
 const direct=allowedDownloadUrl(data.audio_url??data.conversion_path??data.output?.audio_url);
 if(direct)return [{stem:'result',audioUrl:direct,wavUrl:allowedDownloadUrl(data.audio_url_wav??data.conversion_path_wav)}];
 const files=[];
 for(const stem of STEMS){
  const audioUrl=allowedDownloadUrl(mp3[stem]);
  const wavUrl=allowedDownloadUrl(wav[stem]);
  if(audioUrl||wavUrl)files.push({stem,audioUrl,wavUrl});
 }
 return files;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return response(res,200,{configured:configured(),apiVersion:'v2',
  maxFileBytes:MAX_FILE_BYTES,stems:STEMS,preprocessing:['Denoise','Deecho','Dereverb'],
  cloud:true,ownerAccessRequired:true,creditConsentRequired:true});
 if(req.method!=='POST')return response(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!configured())return response(res,503,{error:'MUSICGPT_EXTRACTION_NOT_CONFIGURED'});
 if(!equal(req.headers?.['x-pulse-owner-token'],process.env.PULSE_MUSICGPT_OWNER_TOKEN))
  return response(res,403,{error:'OWNER_AUTH_REQUIRED'});
 if(req.headers?.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return response(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
  catch{return response(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
 }
 const body=parseBody(req.body);
 if(!body)return response(res,400,{error:'INVALID_JSON'});
 if(body.action==='submit'){
  if(body.consent!==true||body.rightsConfirmed!==true)return response(res,400,{error:'AUDIO_CONSENT_REQUIRED'});
  if(body.ecoMode!==true&&body.ecoMode!==false)return response(res,400,{error:'INVALID_ECO_MODE'});
  const stems=selected(body.stems,allowedStems,STEMS.length,true);
  const preprocess=selected(body.preprocessingOptions??[],allowedPre,3);
  if(!stems||!preprocess)return response(res,400,{error:'INVALID_EXTRACTION_PARAMETERS'});
  if((body.audioUrl==null)===(body.file==null))return response(res,400,{error:'CHOOSE_ONE_AUDIO_SOURCE'});
  const form=new FormData();
  form.append('stems',JSON.stringify(stems));
  form.append('preprocessing_options',JSON.stringify(preprocess));
  form.append('eco_mode',String(body.ecoMode));
  if(body.audioUrl!=null){
   const url=youtubeUrl(body.audioUrl);
   if(!url)return response(res,400,{error:'INVALID_YOUTUBE_URL'});
   form.append('audio_url',url);
  }else{
   let file;
   try{file=audioFile(body.file);}catch(e){return response(res,e.message==='AUDIO_TOO_LARGE'?413:400,{error:e.message});}
   form.append('audio_file',new Blob([file.bytes],{type:file.mime}),file.name);
  }
  // One paid request per user click. Never retry automatically after timeout.
  const upstream=await provider(EXTRACT,{method:'POST',body:form});
  if(!upstream.ok)return response(res,upstream.status,{error:upstream.error});
  const data=upstream.data;
  if(!ID.test(data.conversion_id??''))return response(res,502,{error:'MISSING_CONVERSION_ID'});
  return response(res,200,{status:'submitted',conversionId:data.conversion_id,
   taskId:ID.test(data.task_id??'')?data.task_id:null,
   creditEstimate:Number.isFinite(data.credit_estimate)?data.credit_estimate:null,
   eta:Number.isFinite(data.eta)?data.eta:null});
 }
 if(body.action==='result'){
  const id=body.conversionId;
  if(typeof id!=='string'||!ID.test(id))return response(res,400,{error:'INVALID_CONVERSION_ID'});
  const upstream=await provider(RESULT+'?conversionType=EXTRACTION&conversion_id='+encodeURIComponent(id));
  if(!upstream.ok)return response(res,upstream.status,{error:upstream.error});
  const conversion=upstream.data.conversion??upstream.data.data?.conversion??{};
  const state=String(conversion.status??'PROCESSING').toUpperCase();
  const failed=['FAILED','ERROR','CANCELED','CANCELLED'].includes(state);
  const complete=['COMPLETED','COMPLETE','SUCCESS','SUCCEEDED'].includes(state);
  const files=complete?safeStemFiles(conversion):[];
  return response(res,200,{status:failed?'failed':complete?'complete':'processing',
   conversionId:id,files,
   message:complete&&!files.length?'MusicGPT completed the job but returned no downloadable output.':
     typeof conversion.status_msg==='string'?conversion.status_msg.slice(0,160):null,
   conversionCost:Number.isFinite(conversion.conversion_cost)?conversion.conversion_cost:null});
 }
 return response(res,400,{error:'UNKNOWN_ACTION'});
}
