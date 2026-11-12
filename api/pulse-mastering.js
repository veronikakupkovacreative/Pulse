/** MusicGPT Audio Mastering. Owner-only HTTPS gateway with explicit audio upload consent.
 * Audio inputs must include both source and a mastering reference.
 * Each "submit" may spend credits; never retry a submission automatically.
 */
import {timingSafeEqual} from 'node:crypto';
const API='https://api.musicgpt.com/api/public/v1';
export const MAX_TOTAL_BYTES=2_600_000; // Keep JSON+base64 safely below Vercel request ingress limits.
const MAX_B64=3_500_000;
const OUTPUTS=new Set(['mp3','wav','flac','ogg','aac','webm']);
const send=(res,code,data)=>res.status(code).json(data);
const ready=()=>Boolean(process.env.MUSICGPT_MASTERING_API_KEY&&process.env.PULSE_MUSICGPT_OWNER_TOKEN);
function equal(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function publicHttps(value){
 if(typeof value!=='string'||value.length>2000)return null;
 try{
  const u=new URL(value.trim()),h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||h==='localhost'||h.endsWith('.local')||
   h.endsWith('.internal')||h==='0.0.0.0'||h==='127.0.0.1'||h==='::1'||h.startsWith('127.')||
   h.startsWith('10.')||h.startsWith('192.168.')||h.startsWith('169.254.')||
   /^172\.(1[6-9]|2\d|3[01])\./.test(h)||h.startsWith('fc')&&h.includes(':')||
   h.startsWith('fd')&&h.includes(':')||h.includes('[')&&h.includes(']')||h==='[::1]')return null;
  return u.href;
 }catch{return null;}
}
function file(raw){
 if(!raw||typeof raw!=='object'||typeof raw.name!=='string'||typeof raw.base64!=='string'||
  raw.base64.length>MAX_B64||!raw.base64.length||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.base64)||raw.base64.length%4!==0)throw Error('INVALID_AUDIO_FILE');
 const name=raw.name.replace(/[^A-Za-z0-9._-]/g,'-').slice(0,90);
 if(!/\.(wav|mp3|m4a|flac|aac|ogg|webm)$/i.test(name))throw Error('INVALID_AUDIO_FORMAT');
 const bytes=Buffer.from(raw.base64,'base64');
 if(bytes.length<1000||bytes.length>MAX_TOTAL_BYTES)throw Error('AUDIO_TOO_LARGE');
 return {bytes,name};
}
function parseAsset(asset){
 if(!asset||typeof asset!=='object'||Array.isArray(asset))throw Error('AUDIO_OR_REFERENCE_REQUIRED');
 const hasFile=asset.file!=null,hasUrl=asset.url!=null;
 if(hasFile===hasUrl)throw Error('CHOOSE_ONE_AUDIO_SOURCE');
 if(hasUrl){const url=publicHttps(asset.url);if(!url)throw Error('INVALID_HTTPS_AUDIO_URL');return {url};}
 return {file:file(asset.file)};
}
function parseBody(req){
 if(!req.body)return null;
 if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return null;}}
 return req.body;
}
async function provider(path,{method='GET',body,signal}={}){
 const resp=await fetch(API+path,{method,body,headers:{Authorization:process.env.MUSICGPT_MASTERING_API_KEY,
  Accept:'application/json'},redirect:'error',signal});
 const json=await resp.json().catch(()=>null);
 if(!resp.ok||json?.success===false){
  let status=resp.status,error='MUSICGPT_PROVIDER_ERROR';
  if(status===402||/credit/i.test(json?.error||'')){status=402;error='INSUFFICIENT_CREDITS';}
  else if(status===401||status===403)error='MUSICGPT_AUTH_FAILED';
  else if(status===429)error='RATE_LIMITED';
  else if(status===400||status===422)error='INVALID_PROVIDER_REQUEST';
  return {ok:false,status:status>=400&&status<500?status:502,error};
 }
 if(!json||typeof json!=='object')return {ok:false,status:502,error:'INVALID_PROVIDER_RESPONSE'};
 return {ok:true,data:json};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return send(res,200,{configured:ready(),provider:'MusicGPT',referenceRequired:true,
  maxTotalFileBytes:MAX_TOTAL_BYTES,requiresExplicitConsent:true});
 if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!ready())return send(res,503,{error:'MUSICGPT_MASTERING_NOT_CONFIGURED'});
 if(!equal(req.headers?.['x-pulse-owner-token'],process.env.PULSE_MUSICGPT_OWNER_TOKEN))
  return send(res,403,{error:'OWNER_AUTH_REQUIRED'});
 if(req.headers?.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
  catch{return send(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
 }
 const p=parseBody(req);
 if(!p||typeof p!=='object'||Array.isArray(p))return send(res,400,{error:'INVALID_JSON'});
 if(p.action!=='submit'&&p.action!=='result')return send(res,400,{error:'UNKNOWN_ACTION'});
 if(p.action==='submit'&&p.consent!==true)return send(res,400,{error:'AUDIO_UPLOAD_CONSENT_REQUIRED'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50_000);
 try{
  if(p.action==='submit'){
   let source,reference;
   try{source=parseAsset(p.original);reference=parseAsset(p.reference);}
   catch(error){return send(res,400,{error:error.message});}
   const total=(source.file?.bytes.length||0)+(reference.file?.bytes.length||0);
   if(total>MAX_TOTAL_BYTES)return send(res,413,{error:'AUDIO_TOO_LARGE'});
   const format=typeof p.outputExtension==='string'?p.outputExtension:'wav';
   if(!OUTPUTS.has(format))return send(res,400,{error:'INVALID_OUTPUT_FORMAT'});
   const form=new FormData();form.append('output_extension',format);
   if(source.url)form.append('audio_url',source.url);
   else form.append('audio_file',new Blob([source.file.bytes],{type:'audio/wav'}),source.file.name);
   if(reference.url)form.append('reference_audio_url',reference.url);
   else form.append('reference_audio_file',new Blob([reference.file.bytes],{type:'audio/wav'}),reference.file.name);
   const result=await provider('/audio_mastering',{method:'POST',body:form,signal:controller.signal});
   if(!result.ok)return send(res,result.status,{error:result.error});
   const conversionId=result.data.conversion_id,taskId=result.data.task_id;
   if(typeof conversionId!=='string'||!/^[a-zA-Z0-9_-]{3,128}$/.test(conversionId))
    return send(res,502,{error:'CONVERSION_ID_MISSING'});
   return send(res,200,{status:'submitted',conversionId,
    taskId:typeof taskId==='string'&&taskId.length<129?taskId:null,
    creditEstimate:Number.isFinite(result.data.credit_estimate)?result.data.credit_estimate:null,
    eta:Number.isFinite(result.data.eta)?result.data.eta:null});
  }
  if(typeof p.conversionId!=='string'||!/^[a-zA-Z0-9_-]{3,128}$/.test(p.conversionId))
   return send(res,400,{error:'INVALID_CONVERSION_ID'});
  const path='/byId?conversionType=AUDIO_MASTERING&conversion_id='+encodeURIComponent(p.conversionId);
  const result=await provider(path,{signal:controller.signal});
  if(!result.ok)return send(res,result.status,{error:result.error});
  const data=result.data.conversion??{};
  const state=String(data.status??'PROCESSING').toUpperCase();
  const completed=['COMPLETED','SUCCESS','SUCCEEDED'].includes(state);
  const failed=['FAILED','ERROR','CANCELED'].includes(state);
  const audioUrl=completed?publicHttps(data.audio_url||data.conversion_path_wav||data.conversion_path):null;
  return send(res,200,{status:failed?'failed':completed&&audioUrl?'complete':'processing',
   audioUrl,conversionId:p.conversionId,
   message:typeof data.status_msg==='string'?data.status_msg.slice(0,160):null,
   cost:Number.isFinite(data.conversion_cost)?data.conversion_cost:null});
 }catch(error){
  return send(res,502,{error:error?.name==='AbortError'?'MUSICGPT_TIMEOUT':'MUSICGPT_CONNECTION_ERROR'});
 }finally{clearTimeout(timer);}
}
