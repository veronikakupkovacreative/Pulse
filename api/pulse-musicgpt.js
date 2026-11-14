/**
 * PULSE MusicGPT Voice Changer — public, rate-limited Vercel gateway.
 * Audio files and API credentials are sent only after explicit user consent.
 * Do not expose MUSICGPT_API_KEY to the browser.
 */
import {cloudConfigured,checkCloudOrigin,checkBillableRoute} from './_pulse-cloud-guard.js';
const BASE='https://api.musicgpt.com/api/public/v1';
const MAX_BYTES=2_400_000,MAX_BODY=3_300_000;
const idPattern=/^[a-zA-Z0-9_-]{3,100}$/;
const convertPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ready=()=>cloudConfigured(process.env.MUSICGPT_API_KEY);
const respond=(res,code,data)=>res.status(code).json(data);
function validateFile(file){
 if(!file||typeof file.name!=='string'||typeof file.base64!=='string'||file.base64.length>MAX_BODY||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)||file.base64.length%4)throw Error('INVALID_AUDIO');
 const name=file.name.replace(/[^a-z0-9._-]/gi,'-').slice(0,96);
 if(!/\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(name))throw Error('INVALID_FORMAT');
 const bytes=Buffer.from(file.base64,'base64');
 if(bytes.byteLength<1000||bytes.byteLength>MAX_BYTES)throw Error('AUDIO_SIZE_LIMIT');
 return {bytes,name,type:name.toLowerCase().endsWith('.wav')?'audio/wav':'application/octet-stream'};
}
function validUrl(raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||url.hostname.endsWith('.local')||url.hostname.length>255||url.href.length>2048)return null;
  return url.href;
 }catch{return null;}
}
function parseBody(raw){
 const data=typeof raw==='string'?JSON.parse(raw):raw;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_JSON');
 return data;
}
async function upstream(path,{method='GET',body,signal}={}){
 const response=await fetch(BASE+path,{method,headers:{Authorization:process.env.MUSICGPT_API_KEY},body,signal});
 const data=await response.json().catch(()=>null);
 if(!response.ok||data?.success===false){
  const code=response.status===402?'INSUFFICIENT_CREDITS':response.status===401||response.status===403?'MUSICGPT_AUTH_FAILED':
   response.status===429?'RATE_LIMITED':response.status===400||response.status===422?'INVALID_PROVIDER_REQUEST':'MUSICGPT_PROVIDER_ERROR';
  return {ok:false,status:response.status,error:code};
 }
 if(!data||typeof data!=='object')return {ok:false,status:502,error:'INVALID_PROVIDER_RESPONSE'};
 return {ok:true,data};
}
const sanitizeVoices=raw=>(Array.isArray(raw?.voices)?raw.voices:[]).filter(v=>v&&idPattern.test(v.voice_id)&&typeof v.voice_name==='string')
 .slice(0,50).map(v=>({id:v.voice_id,label:v.voice_name.slice(0,80)}));
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return respond(res,200,{configured:ready(),maxFileBytes:MAX_BYTES,provider:'MusicGPT',requiresExplicitConsent:true});
 if(req.method!=='POST')return respond(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!ready())return respond(res,503,{error:'MUSICGPT_NOT_CONFIGURED'});
 const originError=checkCloudOrigin(req);
 if(originError)return respond(res,403,{error:originError});
 let payload;
 try{payload=parseBody(req.body);}catch{return respond(res,400,{error:'INVALID_JSON'});}
 if(!['voices','submit','result'].includes(payload.action))return respond(res,400,{error:'UNKNOWN_ACTION'});
 if(payload.action==='submit'&&(payload.consent!==true||payload.authorizedVoice!==true))return respond(res,400,{error:'VOICE_RIGHTS_CONFIRMATION_REQUIRED'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),51000);
 try{
  if(payload.action==='voices'){
   const query=typeof payload.query==='string'?payload.query.trim():'';
   if(query.length>80||query.length===1)return respond(res,400,{error:'INVALID_SEARCH_QUERY'});
   const page=Number(payload.page??0);
   if(!Number.isInteger(page)||page<0||page>100)return respond(res,400,{error:'INVALID_PAGE'});
   const endpoint=query?'/searchVoices?query='+encodeURIComponent(query)+'&limit=20&page='+page:
    '/getAllVoices?limit=20&page='+page;
   const result=await upstream(endpoint,{signal:controller.signal});
   if(!result.ok)return respond(res,result.status>=400&&result.status<500?result.status:502,{error:result.error});
   return respond(res,200,{voices:sanitizeVoices(result.data),page,total:Number.isInteger(result.data.total)?result.data.total:undefined,query});
  }
  if(payload.action==='submit'){
   const voiceId=typeof payload.voiceId==='string'?payload.voiceId.trim():'';
   if(!idPattern.test(voiceId))return respond(res,400,{error:'INVALID_VOICE_ID'});
   const pitch=Number(payload.pitch??0);
   if(!Number.isInteger(pitch)||pitch<-12||pitch>12)return respond(res,400,{error:'INVALID_PITCH'});
   let audio;try{audio=validateFile(payload.file);}catch(error){return respond(res,400,{error:error.message});}
   const guard=checkBillableRoute(req);
   if(guard)return respond(res,403,{error:guard});
   const form=new FormData();
   form.append('voice_id',voiceId);
   form.append('remove_background',payload.removeBackground===true?'1':'0');
   form.append('pitch',String(pitch));
   form.append('audio_file',new Blob([audio.bytes],{type:audio.type}),audio.name);
   const result=await upstream('/VoiceChanger',{method:'POST',body:form,signal:controller.signal});
   if(!result.ok)return respond(res,result.status>=400&&result.status<500?result.status:502,{error:result.error});
   const {task_id,conversion_id,eta}=result.data;
   if(!convertPattern.test(conversion_id))return respond(res,502,{error:'CONVERSION_ID_MISSING'});
   return respond(res,200,{status:'submitted',conversionId:conversion_id,taskId:convertPattern.test(task_id)?task_id:null,eta:Number.isFinite(eta)?eta:null});
  }
  if(!convertPattern.test(payload.conversionId))return respond(res,400,{error:'INVALID_CONVERSION_ID'});
  const path='/byId?conversionType=VOICE_CONVERSION&conversion_id='+encodeURIComponent(payload.conversionId);
  const result=await upstream(path,{signal:controller.signal});
  if(!result.ok)return respond(res,result.status>=400&&result.status<500?result.status:502,{error:result.error});
  const conversion=result.data.conversion||{};
  const state=typeof conversion.status==='string'?conversion.status.toUpperCase():'PROCESSING';
  const url=state==='COMPLETED'?validUrl(conversion.audio_url||conversion.conversion_path):null;
  return respond(res,200,{status:state==='COMPLETED'&&url?'complete':state==='FAILED'||state==='ERROR'?'failed':'processing',
   audioUrl:url,conversionId:payload.conversionId,message:typeof conversion.status_msg==='string'?conversion.status_msg.slice(0,180):''});
 }catch(error){return respond(res,502,{error:error?.name==='AbortError'?'MUSICGPT_TIMEOUT':'MUSICGPT_CONNECTION_ERROR'});}
 finally{clearTimeout(timer);}
}
