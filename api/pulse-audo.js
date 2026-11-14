/**
 * PULSE / Audo free-tier gateway.
 * Never spends provider credits: unauthenticated requests are free-only and
 * authenticated requests always set free=true. Clients supply no API key.
 * Paid actions do not exist in this endpoint.
 */
import {checkCloudOrigin} from './_pulse-cloud-guard.js';

export const MAX_AUDIO_BYTES=2_400_000;
const MAX_JSON_BYTES=3_300_000;
const MAX_RESULT_BYTES=3_000_000;
const BASE='https://audo.ai';
const TOOLS=Object.freeze({
 'cleanup':new Set(['remove-noise','enhance-voice']),
 'crosscheck':new Set(['key-bpm']),
 'sfx':new Set(['sound-effect-generator'])
});
const AUDIO_EXT=/\.(wav|mp3|m4a|aac|flac|ogg|opus|webm|aiff)$/i;
const MIME=Object.freeze({wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',webm:'audio/webm',opus:'audio/ogg',aiff:'audio/aiff'});
const reply=(res,status,data)=>res.status(status).json(data);
const options={redirect:'error',cache:'no-store'};
function parseBody(raw){
 try{
  if(typeof raw==='string'){if(raw.length>MAX_JSON_BYTES)return null;raw=JSON.parse(raw);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(JSON.stringify(raw).length>MAX_JSON_BYTES)return null;
  return raw;
 }catch{return null;}
}
function cleanText(value,max){
 if(typeof value!=='string')return null;
 const s=value.trim();
 return s.length>0&&s.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)?s:null;
}
export function decodeAudoFile(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_AUDIO');
 const name=typeof raw.name==='string'?raw.name.replace(/[^a-z0-9._-]/gi,'-').slice(0,90):'';
 if(!AUDIO_EXT.test(name)||typeof raw.base64!=='string'||raw.base64.length>Math.ceil(MAX_AUDIO_BYTES*4/3)+8
  ||raw.base64.length<1400||raw.base64.length%4!==0
  ||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.base64))
  throw Error('INVALID_AUDIO');
 const bytes=Buffer.from(raw.base64,'base64');
 if(bytes.length<1024||bytes.length>MAX_AUDIO_BYTES)throw Error('AUDIO_SIZE_LIMIT');
 const ext=name.split('.').pop().toLowerCase();
 return {name,bytes,type:MIME[ext]||'application/octet-stream'};
}
/** Status polling must never proxy arbitrary URLs or internal addresses. */
export function statusUrl(raw){
 if(typeof raw!=='string'||raw.length>1600)return null;
 try{
  const url=new URL(raw,BASE);
  if(url.protocol!=='https:'||url.hostname!=='audo.ai'||url.username||url.password||
   url.port||!/^\/api\/try\/jobs\/[A-Za-z0-9_-]{4,160}$/.test(url.pathname)||
   !/^[A-Za-z0-9._~-]{8,500}$/.test(url.searchParams.get('t')||'')||
   [...url.searchParams.keys()].some(k=>k!=='t'))return null;
  return url.href;
 }catch{return null;}
}
function publicAudioUrl(raw){
 if(typeof raw!=='string'||raw.length>3000)return null;
 try{
  const u=new URL(raw);
  const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||h==='localhost'||h.endsWith('.local')||
   h.endsWith('.internal')||/^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(h)||
   h.includes(':'))return null;
  return u.href;
 }catch{return null;}
}
function extractStatus(data,headers){
 const url=data?.statusUrl??data?.status_url??data?.job?.statusUrl??data?.job?.status_url??
  data?.links?.status??headers?.get?.('location');
 return statusUrl(url);
}
function readAudioLink(data){
 const o=data?.result??data?.output??data;
 const candidates=[o?.downloadUrl,o?.download_url,o?.audioUrl,o?.audio_url,o?.url,
  o?.file?.downloadUrl,o?.file?.url,o?.files?.[0]?.downloadUrl,o?.files?.[0]?.url,
  o?.outputs?.[0]?.downloadUrl,o?.outputs?.[0]?.url];
 return candidates.map(publicAudioUrl).find(Boolean)||null;
}
function processedSeconds(data,headers){
 const n=Number(data?.processedSeconds??data?.processed_seconds??headers?.get?.('audo-processed-seconds'));
 return Number.isFinite(n)&&n>=0&&n<=36000?n:null;
}
export function normalizeAudoAnalysis(payload){
 const data=payload?.result??payload?.analysis??payload?.data??payload;
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const rawBpm=data.bpm??data.tempo??data.beatsPerMinute??data.tempo_bpm;
 const bpm=Number(rawBpm);
 const possibleKey=data.key??data.musicalKey??data.musical_key??data.tonality;
 const key=typeof possibleKey==='string'?possibleKey:possibleKey?.name??possibleKey?.display;
 const camelot=data.camelot??data.camelotKey??data.camelot_key??possibleKey?.camelot;
 return {
  bpm:Number.isFinite(bpm)&&bpm>=30&&bpm<=300?Math.round(bpm*100)/100:null,
  key:typeof key==='string'&&key.length<=80?key:null,
  camelot:typeof camelot==='string'&&/^(?:[1-9]|1[0-2])[AB]$/i.test(camelot)?camelot.toUpperCase():null
 };
}
async function interpret(upstream,tool){
 const ct=(upstream.headers.get('content-type')||'').toLowerCase();
 if(upstream.status===429)return {code:429,data:{error:'AUDO_FREE_LIMIT',message:'Audo free quota exhausted. Try after its daily reset.'}};
 if(!upstream.ok){
  const raw=ct.includes('json')?await upstream.json().catch(()=>null):null;
  const providerCode=typeof raw?.error?.code==='string'?raw.error.code:null;
  return {code:upstream.status===402?402:upstream.status===400?400:upstream.status===413?413:502,
   data:{error:upstream.status===402?'AUDO_FREE_ONLY':providerCode==='free_limit_reached'?'AUDO_FREE_LIMIT':'AUDO_PROVIDER_ERROR'}};
 }
 if(upstream.status===202||ct.includes('json')){
  const data=await upstream.json().catch(()=>null);
  if(!data||typeof data!=='object'||Array.isArray(data))return {code:502,data:{error:'INVALID_AUDO_RESPONSE'}};
  const state=String(data.status??data.state??data.job?.status??'').toLowerCase();
  const pending=['pending','queued','running','processing','started','created'].includes(state)||upstream.status===202;
  const pollUrl=extractStatus(data,upstream.headers);
  if(pending){
   if(!pollUrl)return {code:502,data:{error:'MISSING_AUDO_STATUS_URL'}};
   return {code:200,data:{status:'processing',statusUrl:pollUrl,processedSeconds:processedSeconds(data,upstream.headers)}};
  }
  if(['failed','cancelled','canceled','error'].includes(state))return {code:502,data:{error:'AUDO_PROCESSING_FAILED'}};
  const current=tool==='key-bpm'?normalizeAudoAnalysis(data):null;
  if(tool==='key-bpm'&&current&&(current.bpm!==null||current.key!==null||current.camelot!==null))
   return {code:200,data:{status:'complete',kind:'analysis',analysis:current,processedSeconds:processedSeconds(data,upstream.headers)}};
  const downloadUrl=readAudioLink(data);
  if(downloadUrl)return {code:200,data:{status:'complete',kind:'audio',audioUrl:downloadUrl,processedSeconds:processedSeconds(data,upstream.headers)}};
  if(pollUrl)return {code:200,data:{status:'processing',statusUrl:pollUrl,processedSeconds:processedSeconds(data,upstream.headers)}};
  return {code:502,data:{error:'UNRECOGNIZED_AUDO_OUTPUT'}};
 }
 if(!ct.startsWith('audio/')&&!ct.includes('octet-stream'))return {code:502,data:{error:'UNSUPPORTED_AUDO_OUTPUT'}};
 const declared=Number(upstream.headers.get('content-length'));
 if(declared>MAX_RESULT_BYTES)return {code:413,data:{error:'AUDO_OUTPUT_TOO_LARGE'}};
 const bytes=Buffer.from(await upstream.arrayBuffer());
 if(bytes.length<100||bytes.length>MAX_RESULT_BYTES)return {code:502,data:{error:'INVALID_AUDO_AUDIO'}};
 const format=ct.includes('wav')?'wav':ct.includes('mpeg')||ct.includes('mp3')?'mp3':ct.includes('mp4')?'m4a':'bin';
 return {code:200,data:{status:'complete',kind:'audio',mime:ct.split(';')[0],
  name:'pulse-audo-'+tool+'.'+format,base64:bytes.toString('base64'),
  processedSeconds:processedSeconds(null,upstream.headers)}};
}
const actionToTool=body=>{
 if(body.tool==='cleanup')return ['remove-noise','enhance-voice'].includes(body.mode)?body.mode:null;
 if(body.tool==='crosscheck')return 'key-bpm';
 if(body.tool==='sfx')return 'sound-effect-generator';
 return null;
};
function makeForm(body,tool){
 const form=new FormData();
 if(tool==='sound-effect-generator'){
  const text=cleanText(body.text,450),duration=Number(body.duration);
  if(!text||!Number.isFinite(duration)||duration<.5||duration>10||Math.round(duration*2)!==duration*2||
   !['mp3','wav'].includes(body.format))throw Error('INVALID_SOUND_EFFECT');
  form.append('text',text);form.append('duration_seconds',String(duration));
  form.append('output_format',body.format);form.append('loop',body.loop===true?'true':'false');
 }else{
  const audio=decodeAudoFile(body.file);
  form.append('file',new Blob([audio.bytes],{type:audio.type}),audio.name);
  if(tool==='remove-noise'||tool==='enhance-voice'){
   const amount=Number(body.strength);
   if(!Number.isInteger(amount)||amount<10||amount>100)throw Error('INVALID_REDUCTION');
   form.append('noise_reduction',String(amount));
   form.append('auto_volume',body.autoVolume===true?'true':'false');
   form.append('output_format','mp3');
  }
 }
 // Never use a paid default, even when a server-only Audo key is configured.
 if(process.env.AUDO_API_KEY)form.append('free','true');
 return form;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return reply(res,200,{configured:true,provider:'Audo Free API',freeOnly:true,
  maxFileBytes:MAX_AUDIO_BYTES,cleanupSeconds:60,sfxSeconds:10,apiKeyRequired:false});
 if(req.method!=='POST')return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
 const originError=checkCloudOrigin(req);
 if(originError)return reply(res,403,{error:originError});
 const body=parseBody(req.body);
 if(!body)return reply(res,400,{error:'INVALID_JSON'});
 if(body.action==='status'){
  const url=statusUrl(body.statusUrl);
  if(!url)return reply(res,400,{error:'INVALID_STATUS_URL'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
  try{
   const headers={'User-Agent':'PULSE-Studio-Audo-Integration/1.0','Accept':'*/*'};
   if(process.env.AUDO_API_KEY)headers.Authorization='Bearer '+process.env.AUDO_API_KEY;
   const upstream=await fetch(url,{method:'GET',headers,signal:controller.signal,...options});
   const result=await interpret(upstream,body.tool==='crosscheck'?'key-bpm':'audio');
   return reply(res,result.code,result.data);
  }catch{return reply(res,502,{error:'AUDO_STATUS_UNAVAILABLE'});}
  finally{clearTimeout(timer);}
 }
 if(body.action!=='submit')return reply(res,400,{error:'UNKNOWN_ACTION'});
 // Firewall rule only allows a low number of ?trial=1 submissions / IP.
 // If the query is omitted the call fails closed before contacting Audo.
 if(req.url?.split('?')[1]!=='trial=1')return reply(res,403,{error:'AUDO_RATE_GATE_REQUIRED'});
 if(body.consent!==true)return reply(res,400,{error:'CLOUD_CONSENT_REQUIRED'});
 const tool=actionToTool(body);
 if(!tool||!TOOLS[body.tool]?.has(tool))return reply(res,400,{error:'INVALID_TOOL'});
 let form;
 try{form=makeForm(body,tool);}catch(error){return reply(res,400,{error:error.message||'INVALID_INPUT'});}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),48000);
 const headers={'User-Agent':'PULSE-Studio-Audo-Integration/1.0','Accept':'*/*','Prefer':'respond-async'};
 if(process.env.AUDO_API_KEY)headers.Authorization='Bearer '+process.env.AUDO_API_KEY;
 try{
  const upstream=await fetch(BASE+'/api/try/'+tool,{method:'POST',body:form,headers,signal:controller.signal,...options});
  const result=await interpret(upstream,tool);
  return reply(res,result.code,result.data);
 }catch(error){return reply(res,502,{error:error?.name==='AbortError'?'AUDO_REQUEST_TIMEOUT':'AUDO_CONNECTION_ERROR'});}
 finally{clearTimeout(timer);}
}
