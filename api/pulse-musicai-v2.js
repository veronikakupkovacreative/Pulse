/**
 * PULSE / MusicGPT Music AI (v1): owner-gated, server-only song generator.
 * POST /v1/MusicAI creates TWO paid versions. GET /v1/byId is read-only.
 * Do not retry paid submissions automatically; a timed-out job may still run.
 */
import {timingSafeEqual} from 'node:crypto';

const CREATE_URL='https://api.musicgpt.com/api/public/v1/MusicAI';
const LOOKUP_URL='https://api.musicgpt.com/api/public/v1/byId';
// Keep the existing MUSICGPT_MUSICAI_V2_API_KEY environment variable for compatibility.
const GENDERS=new Set(['','male','female','neutral']);
const ID=/^[A-Za-z0-9_-]{8,120}$/;
const errorResponse=(res,code,error)=>res.status(code).json({error});
const ready=()=>Boolean(process.env.MUSICGPT_MUSICAI_V2_API_KEY&&process.env.PULSE_MUSICGPT_OWNER_TOKEN);
function sameSecret(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function text(value,max,{required=false}={}){
 if(value==null)return required?null:'';
 if(typeof value!=='string')return null;
 const clean=value.trim();
 if((required&&!clean)||clean.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean))return null;
 return clean;
}
function httpsUrl(value){
 if(typeof value!=='string'||value.length>3000)return null;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname&&!['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname.toLowerCase())?u.href:null;
 }catch{return null;}
}
function parseRequest(value){
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{return null;}}
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 try{if(JSON.stringify(value).length>16000)return null;}catch{return null;}
 return value;
}
function providerError(status,json){
 const description=String(json?.error||json?.message||'').toLowerCase();
 if(status===402||/insufficient|credit balance|not enough credits/.test(description))
  return {status:402,error:'INSUFFICIENT_CREDITS'};
 if(status===401||status===403)return {status,error:'MUSICGPT_AUTH_FAILED'};
 if(status===429)return {status,error:'RATE_LIMITED'};
 if(status===400||status===422)return {status,error:'INVALID_PROVIDER_REQUEST'};
 return {status:502,error:'MUSICGPT_PROVIDER_ERROR'};
}
async function provider(url,options){
 const abort=new AbortController();
 const timeout=setTimeout(()=>abort.abort(),options.method==='POST'?45_000:20_000);
 try{
  const response=await fetch(url,{...options,redirect:'error',cache:'no-store',signal:abort.signal,headers:{
   Accept:'application/json',Authorization:process.env.MUSICGPT_MUSICAI_V2_API_KEY,
   ...(options.method==='POST'?{'Content-Type':'application/json'}:{})
  }});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.success===false){
   const err=providerError(response.status,result);
   return {ok:false,...err};
  }
  if(!result||typeof result!=='object')return {ok:false,status:502,error:'INVALID_PROVIDER_RESPONSE'};
  return {ok:true,body:result};
 }catch(e){
  return {ok:false,status:502,error:e?.name==='AbortError'?'MUSICGPT_TIMEOUT':'MUSICGPT_CONNECTION_ERROR'};
 }finally{clearTimeout(timeout);}
}
function buildGeneration(input){
 const mode=input.mode==='custom'?'custom':input.mode==='prompt'?'prompt':null;
 const prompt=text(input.prompt,280,{required:mode==='prompt'});
 const musicStyle=text(input.musicStyle,140,{required:mode==='custom'});
 const lyrics=text(input.lyrics,9000,{required:mode==='custom'});
 const title=text(input.title,120);
 const voiceId=text(input.voiceId,120);
 
 const gender=input.gender??'';
 const output=input.output??'full';
 if(!mode||prompt===null||musicStyle===null||lyrics===null||title===null||voiceId===null||
  !GENDERS.has(gender)||!['full','instrumental','vocals'].includes(output)||
  (voiceId&&!/^[a-zA-Z0-9_. -]+$/.test(voiceId))||
  typeof input.generateAlbumCover!=='boolean')return null;
 const data={
  prompt, music_style:musicStyle,lyrics,
  make_instrumental:output==='instrumental',
  vocal_only:output==='vocals',
  generate_album_cover:input.generateAlbumCover
 };
 if(title)data.title=title;
 if(gender)data.gender=gender;
 if(voiceId)data.voice_id=voiceId;
 return data;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return res.status(200).json({
  configured:ready(),provider:'MusicGPT',versions:2,
  apiVersion:'v1',promptMaxLength:280,creditsRequired:true,consentRequired:true
 });
 if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED');
 if(!ready())return errorResponse(res,503,'MUSICGPT_MUSICAI_NOT_CONFIGURED');
 if(!sameSecret(req.headers?.['x-pulse-owner-token'],process.env.PULSE_MUSICGPT_OWNER_TOKEN))
  return errorResponse(res,403,'OWNER_AUTH_REQUIRED');
 if(req.headers?.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return errorResponse(res,403,'CROSS_ORIGIN_BLOCKED');}
  catch{return errorResponse(res,403,'CROSS_ORIGIN_BLOCKED');}
 }
 const body=parseRequest(req.body);
 if(!body)return errorResponse(res,400,'INVALID_JSON');
 if(body.action==='generate'){
  if(body.consent!==true)return errorResponse(res,400,'CREDIT_CONSENT_REQUIRED');
  const data=buildGeneration(body);
  if(!data)return errorResponse(res,400,'INVALID_GENERATION_PARAMETERS');
  // Only one provider request for each explicit click. No automatic paid retries.
  const result=await provider(CREATE_URL,{method:'POST',body:JSON.stringify(data)});
  if(!result.ok)return errorResponse(res,result.status,result.error);
  const response=result.body;
  if(!ID.test(response.conversion_id_1||'')||!ID.test(response.conversion_id_2||''))
   return errorResponse(res,502,'MISSING_CONVERSION_IDS');
  return res.status(200).json({
   status:'submitted',provider:'MusicGPT',
   taskId:ID.test(response.task_id||'')?response.task_id:null,
   versions:[{id:response.conversion_id_1},{id:response.conversion_id_2}],
   eta:Number.isFinite(response.eta)?response.eta:null,
   creditEstimate:Number.isFinite(response.credit_estimate)?response.credit_estimate:null
  });
 }
 if(body.action==='result'){
  if(!ID.test(body.conversionId||''))return errorResponse(res,400,'INVALID_CONVERSION_ID');
  const url=new URL(LOOKUP_URL);
  url.searchParams.set('conversionType','MUSIC_AI');
  url.searchParams.set('conversion_id',body.conversionId);
  const result=await provider(url,{method:'GET'});
  if(!result.ok)return errorResponse(res,result.status,result.error);
  const c=result.body.conversion;
  if(!c||typeof c!=='object')return errorResponse(res,502,'INVALID_PROVIDER_RESPONSE');
  const rawStatus=String(c.status||'PROCESSING').toUpperCase();
  const failed=['FAILED','ERROR','CANCELLED','CANCELED'].includes(rawStatus);
  const mp3=httpsUrl(c.audio_url)||httpsUrl(c.conversion_path);
  const wav=httpsUrl(c.conversion_path_wav);
  const complete=['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(rawStatus)&&Boolean(mp3||wav);
  return res.status(200).json({
   conversionId:body.conversionId,
   status:failed?'failed':complete?'complete':'processing',
   message:typeof c.status_msg==='string'?c.status_msg.slice(0,240):null,
   title:text(c.title,140)||null,
   audioUrl:complete?mp3||wav:null,
   wavUrl:complete?wav:null,
   duration:Number.isFinite(c.conversion_duration)?c.conversion_duration:null,
   credits:Number.isFinite(c.conversion_cost)?c.conversion_cost:null
  });
 }
 return errorResponse(res,400,'UNKNOWN_ACTION');
}
