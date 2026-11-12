/** MusicGPT Sound Generator: server-only key, owner authorization, explicit paid consent.
 * POST /v1/sound_generator returns one conversion_id; GET /v1/byId polls SOUND_GENERATOR.
 */
import {timingSafeEqual} from 'node:crypto';
const ENDPOINT='https://api.musicgpt.com/api/public/v1';
const ID=/^[a-zA-Z0-9_-]{6,128}$/;
const send=(res,status,data)=>res.status(status).json(data);
const ready=()=>Boolean(process.env.MUSICGPT_SOUND_GENERATOR_API_KEY&&process.env.PULSE_MUSICGPT_OWNER_TOKEN);
function safeCompare(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
function safeHttps(raw){
 if(typeof raw!=='string'||raw.length>3000)return null;
 try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:null;}
 catch{return null;}
}
function parse(value){
 if(typeof value==='string'){try{value=JSON.parse(value)}catch{return null;}}
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 try{if(JSON.stringify(value).length>5000)return null}catch{return null;}
 return value;
}
async function callProvider(url,options){
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),options.method==='POST'?45_000:18_000);
 try{
  const response=await fetch(url,{...options,redirect:'error',cache:'no-store',signal:ctl.signal,headers:{
   Authorization:process.env.MUSICGPT_SOUND_GENERATOR_API_KEY,Accept:'application/json',
   ...(options.method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})
  }});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.success===false){
   const message=String(data?.error||data?.message||'');
   const code=response.status===402||/insufficient|not enough credits/i.test(message)?'INSUFFICIENT_CREDITS':
    [401,403].includes(response.status)?'PROVIDER_AUTH_FAILED':
    response.status===429?'RATE_LIMITED':
    [400,422].includes(response.status)?'INVALID_PROVIDER_REQUEST':'PROVIDER_ERROR';
   return {ok:false,status:code==='INSUFFICIENT_CREDITS'?402:response.status>=400&&response.status<500?response.status:502,error:code};
  }
  if(!data||typeof data!=='object')return {ok:false,status:502,error:'INVALID_PROVIDER_RESPONSE'};
  return {ok:true,data};
 }catch(e){return {ok:false,status:502,error:e.name==='AbortError'?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE'};}
 finally{clearTimeout(timeout);}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return send(res,200,{provider:'MusicGPT',configured:ready(),consentRequired:true,maxPrompt:600,maxLength:60});
 if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!ready())return send(res,503,{error:'SOUND_GENERATOR_NOT_CONFIGURED'});
 if(!safeCompare(req.headers?.['x-pulse-owner-token'],process.env.PULSE_MUSICGPT_OWNER_TOKEN))
  return send(res,403,{error:'OWNER_AUTH_REQUIRED'});
 if(req.headers?.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
  catch{return send(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
 }
 const b=parse(req.body);
 if(!b)return send(res,400,{error:'INVALID_JSON'});
 if(b.action==='generate'){
  if(b.consent!==true)return send(res,400,{error:'CREDIT_CONSENT_REQUIRED'});
  if(typeof b.prompt!=='string'||b.prompt.trim().length<4||b.prompt.trim().length>600||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.prompt))
   return send(res,400,{error:'INVALID_PROMPT'});
  if(!Number.isInteger(b.audioLength)||b.audioLength<5||b.audioLength>60)
   return send(res,400,{error:'INVALID_AUDIO_LENGTH'});
  if(typeof b.generateAlbumCover!=='boolean')return send(res,400,{error:'INVALID_COVER_OPTION'});
  const form=new URLSearchParams();
  form.set('prompt',b.prompt.trim());form.set('audio_length',String(b.audioLength));
  form.set('generate_album_cover',String(b.generateAlbumCover));
  const result=await callProvider(ENDPOINT+'/sound_generator',{method:'POST',body:form});
  if(!result.ok)return send(res,result.status,{error:result.error});
  if(!ID.test(result.data.conversion_id||''))return send(res,502,{error:'MISSING_CONVERSION_ID'});
  return send(res,200,{status:'submitted',conversionId:result.data.conversion_id,
   taskId:ID.test(result.data.task_id||'')?result.data.task_id:null,
   eta:Number.isFinite(result.data.eta)&&result.data.eta>=0?result.data.eta:null,
   creditEstimate:Number.isFinite(result.data.credit_estimate)?result.data.credit_estimate:null});
 }
 if(b.action==='result'){
  if(!ID.test(b.conversionId||''))return send(res,400,{error:'INVALID_CONVERSION_ID'});
  const url=new URL(ENDPOINT+'/byId');
  url.searchParams.set('conversionType','SOUND_GENERATOR');
  url.searchParams.set('conversion_id',b.conversionId);
  const result=await callProvider(url,{method:'GET'});
  if(!result.ok)return send(res,result.status,{error:result.error});
  const c=result.data.conversion;
  if(!c||typeof c!=='object')return send(res,502,{error:'INVALID_PROVIDER_RESPONSE'});
  const state=String(c.status||'PROCESSING').toUpperCase();
  const failed=['FAILED','ERROR','CANCELED','CANCELLED'].includes(state);
  const complete=['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state);
  const audio=complete?safeHttps(c.audio_url)||safeHttps(c.conversion_path)||safeHttps(c.conversion_path_wav):null;
  return send(res,200,{conversionId:b.conversionId,
   status:failed?'failed':complete&&audio?'complete':'processing',audioUrl:audio,
   message:typeof c.status_msg==='string'?c.status_msg.slice(0,180):null,
   creditCost:Number.isFinite(c.conversion_cost)?c.conversion_cost:null});
 }
 return send(res,400,{error:'UNKNOWN_ACTION'});
}
