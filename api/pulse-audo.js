import {checkCloudOrigin} from './_pulse-cloud-guard.js';

export const MAX_AUDIO_BYTES=2_400_000;
export const MAX_JSON_BYTES=3_650_000;
export const MAX_RESULT_BYTES=3_000_000;
const BASE='https://audo.ai';
const OPTIONS={redirect:'error',cache:'no-store'};
const EXT=/\.(wav|mp3|m4a|aac|flac|ogg|opus|webm|aiff)$/i;
const MIME={wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',webm:'audio/webm',opus:'audio/ogg',aiff:'audio/aiff'};
const ROUTES=Object.freeze({
 cleanup:['remove-noise','enhance-voice'],
 crosscheck:['key-bpm'],
 sfx:['sound-effect-generator'],
 release:['media-info'],
 transcribe:['transcribe'],
 align:['align-script'],
 translate:['audio-translator'],
 removeSilence:['remove-silence'],
 loudness:['loudness'],
 convert:['convert'],
 cut:['cut'],
 join:['join'],
 highlights:['find-highlights']
});
const reply=(res,status,data)=>res.status(status).json(data);
const cleanText=(value,max)=>{
 if(typeof value!=='string')return null;
 const text=value.trim();
 return text.length>0&&text.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)?text:null;
};
function parseBody(raw){
 try{
  if(typeof raw==='string'){if(raw.length>MAX_JSON_BYTES)return null;raw=JSON.parse(raw);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(JSON.stringify(raw).length>MAX_JSON_BYTES)return null;
  return raw;
 }catch{return null;}
}
export function decodeAudoFile(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_AUDIO');
 const name=typeof raw.name==='string'?raw.name.replace(/[^a-z0-9._-]/gi,'-').slice(0,90):'';
 if(!EXT.test(name)||typeof raw.base64!=='string'||raw.base64.length>Math.ceil(MAX_AUDIO_BYTES*4/3)+8||
  raw.base64.length<1400||raw.base64.length%4!==0||
  !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.base64))throw Error('INVALID_AUDIO');
 const bytes=Buffer.from(raw.base64,'base64');
 if(bytes.length<1024||bytes.length>MAX_AUDIO_BYTES)throw Error('AUDIO_SIZE_LIMIT');
 const ext=name.split('.').pop().toLowerCase();
 return {name,bytes,type:MIME[ext]||'application/octet-stream'};
}
function safeAudoUrl(raw){
 if(typeof raw!=='string'||raw.length>1800)return null;
 try{
  const url=new URL(raw,BASE);
  if(url.protocol!=='https:'||url.username||url.password||url.port||
   !(url.hostname==='audo.ai'||url.hostname.endsWith('.audo.ai'))||
   url.hostname.includes('..'))return null;
  return url.href;
 }catch{return null;}
}
export function statusUrl(raw){
 const url=safeAudoUrl(raw);
 if(!url)return null;
 try{
  const parsed=new URL(url);
  if(!/^\/api\/try\/jobs\/[A-Za-z0-9_-]{4,160}$/.test(parsed.pathname)||
   !/^[A-Za-z0-9._~-]{8,500}$/.test(parsed.searchParams.get('t')||'')||
   [...parsed.searchParams.keys()].some(key=>key!=='t'))return null;
  return url;
 }catch{return null;}
}
function getStatusUrl(data,headers){
 const candidates=[data?.statusUrl,data?.status_url,data?.job?.statusUrl,data?.job?.status_url,
  data?.links?.status,headers?.get?.('location')];
 for(const candidate of candidates){const valid=statusUrl(candidate);if(valid)return valid;}
 return null;
}
function getOutput(data){
 const root=data?.result??data?.output??data?.data??data;
 const outputs=Array.isArray(root?.outputs)?root.outputs:Array.isArray(data?.outputs)?data.outputs:[];
 const candidates=[
  root?.downloadUrl,root?.download_url,root?.audioUrl,root?.audio_url,root?.fileUrl,root?.file_url,
  root?.url,root?.file?.downloadUrl,root?.file?.url,root?.files?.[0]?.downloadUrl,
  root?.files?.[0]?.url,outputs[0]?.downloadUrl,outputs[0]?.download_url,outputs[0]?.url,
  outputs[0]?.download_url
 ];
 for(const candidate of candidates){const url=publicHttpsUrl(candidate);if(url)return {url,name:outputs[0]?.name||root?.filename||null,mime:outputs[0]?.mime||outputs[0]?.contentType||null};}
 return null;
}
function processedSeconds(data,headers){
 const value=Number(data?.processedSeconds??data?.processed_seconds??headers?.get?.('audo-processed-seconds'));
 return Number.isFinite(value)&&value>=0&&value<=36000?value:null;
}
function stripBilling(value,depth=0){
 if(depth>10||value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.slice(0,100).map(item=>stripBilling(item,depth+1));
 const out={};
 for(const [key,item] of Object.entries(value)){
  if(/finishurl|finishprice|fullprice|credits?|billing|payment|checkout/i.test(key))continue;
  out[key]=stripBilling(item,depth+1);
 }
 return out;
}
function errorFromProvider(status,body){
 const code=body?.error?.code??body?.error??body?.code;
 if(status===429||code==='free_limit_reached'||code==='free_budget_exhausted')return {status:429,error:'AUDO_FREE_LIMIT'};
 if(status===402||code==='insufficient_balance'||code==='free_disabled')return {status:429,error:'AUDO_FREE_LIMIT'};
 if(status===413||code==='file_too_large')return {status:413,error:'AUDIO_SIZE_LIMIT'};
 if(status===400||code==='bad_request'||code==='unsupported_format'||code==='wrong_file_type')return {status:400,error:'AUDO_INVALID_INPUT'};
 if(status===401||status===403)return {status:502,error:'AUDO_PROVIDER_AUTH'};
 return {status:502,error:'AUDO_PROVIDER_ERROR'};
}
function publicHttpsUrl(raw){
 if(typeof raw!=='string'||raw.length>3000)return null;
 try{
  const url=new URL(raw),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
   host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
   /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)||
   host.includes(':'))return null;
  return url.href;
 }catch{return null;}
}
function makeForm(body,tool){
 const form=new FormData();
 if(tool==='sound-effect-generator'){
  const text=cleanText(body.text,450),duration=Number(body.duration);
  if(!text||!Number.isFinite(duration)||duration<.5||duration>10||Math.round(duration*2)!==duration*2)throw Error('INVALID_SOUND_EFFECT');
  form.append('text',text);
  form.append('duration_seconds',String(duration));
  if(['mp3','wav'].includes(body.format))form.append('output_format',body.format);
  if(body.loop===true)form.append('loop','true');
  return form;
 }
 const fileUrls=tool==='join'?(Array.isArray(body.fileUrls)?body.fileUrls:[]):body.fileUrl?[body.fileUrl]:[];
 const files=tool==='join'?(Array.isArray(body.files)?body.files:[]):body.file?[body.file]:[];
 if(tool==='join'&&(files.length+fileUrls.length<2||files.length+fileUrls.length>20))throw Error('INVALID_JOIN_FILES');
 if(files.length&&fileUrls.length)throw Error('MIXED_JOIN_INPUTS');
 if(files.length){
  if(tool!=='join'&&files.length!==1)throw Error('INVALID_AUDIO');
  let total=0;
  for(const raw of files){
   const audio=decodeAudoFile(raw);total+=audio.bytes.length;
   if(total>MAX_AUDIO_BYTES)throw Error('AUDIO_SIZE_LIMIT');
   form.append('file',new Blob([audio.bytes],{type:audio.type}),audio.name);
  }
 }else if(fileUrls.length){
  if(tool!=='join'&&fileUrls.length!==1)throw Error('INVALID_AUDIO');
  for(const raw of fileUrls){const url=publicHttpsUrl(raw);if(!url)throw Error('INVALID_PUBLIC_URL');form.append('url',url);}
 }else throw Error('INVALID_AUDIO');
 if(tool==='media-info')form.append('detail',body.detail==='full'?'full':'concise');
 if(tool==='transcribe'){
  const format=body.format||'srt';
  if(!['json','srt','vtt','txt'].includes(format))throw Error('INVALID_TRANSCRIPT_FORMAT');
  form.append('format',format);
 }
 if(tool==='align-script'){
  const text=cleanText(body.scriptText,20000),format=body.format||'srt';
  if(!text)throw Error('INVALID_SCRIPT');
  if(!['json','srt','vtt'].includes(format))throw Error('INVALID_ALIGNMENT_FORMAT');
  form.append('script',new Blob([text],{type:'text/plain'}),'pulse-lyrics.txt');form.append('format',format);
 }
 if(tool==='audio-translator'){
  const language=cleanText(body.targetLanguage,40),format=body.format||'srt';
  if(!language||!/^[a-z]{2,3}(?:-[A-Z]{2})?$/i.test(language))throw Error('INVALID_LANGUAGE');
  if(!['srt','vtt','txt'].includes(format))throw Error('INVALID_TRANSLATION_FORMAT');
  form.append('target_language',language);form.append('format',format);
 }
 if(tool==='loudness'){
  const target=body.target||'streaming';
  if(!['podcast','streaming','broadcast','audiobook','custom'].includes(target))throw Error('INVALID_LOUDNESS_TARGET');
  form.append('target',target);
  if(target==='custom'){
   const value=Number(body.customLufs);
   if(!Number.isFinite(value)||value< -30||value> -5)throw Error('INVALID_CUSTOM_LUFS');
   form.append('custom_lufs',String(value));
  }
 }
 if(tool==='convert'){
  const format=body.format||'wav';
  if(!['mp3','wav','flac','m4a','aac','ogg'].includes(format))throw Error('INVALID_CONVERT_FORMAT');
  form.append('format',format);
 }
 if(tool==='cut'){
  const mode=body.mode||'keep',ranges=body.ranges;
  if(!['keep','remove'].includes(mode)||!Array.isArray(ranges)||!ranges.length||ranges.length>30)throw Error('INVALID_CUT_RANGES');
  const clean=ranges.map(range=>{
   if(!Array.isArray(range)||range.length!==2)throw Error('INVALID_CUT_RANGES');
   const start=Number(range[0]),end=Number(range[1]);
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>36000)throw Error('INVALID_CUT_RANGES');
   return [start,end];
  });
  form.append('mode',mode);form.append('ranges',JSON.stringify(clean));
  const crossfade=Number(body.crossfadeMs??0);
  if(!Number.isInteger(crossfade)||crossfade<0||crossfade>1000)throw Error('INVALID_CROSSFADE');
  form.append('crossfade_ms',String(crossfade));
 }
 if(tool==='find-highlights'){
  const count=Number(body.count??5);
  if(!Number.isInteger(count)||count<1||count>10)throw Error('INVALID_HIGHLIGHT_COUNT');
  form.append('count',String(count));
 }
 if(tool==='remove-noise'||tool==='enhance-voice'){
  const amount=Number(body.strength??100);
  if(!Number.isInteger(amount)||amount<10||amount>100)throw Error('INVALID_REDUCTION');
  form.append('noise_reduction',String(amount));
  form.append('auto_volume',body.autoVolume===false?'false':'true');
  form.append('output_format',['same','wav','mp3','m4a','flac'].includes(body.outputFormat)?body.outputFormat:'same');
 }
 // If a server-only key exists, explicitly force Audo's free path. Never send free=false or max_credits.
 if(process.env.AUDO_API_KEY)form.append('free','true');
 return form;
}
function contentName(headers,tool){
 const disposition=headers.get('content-disposition')||'';
 const match=disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
 const name=match?.[1]?.replace(/["']/g,'')||null;
 return name&&/^[a-z0-9._-]{1,120}$/i.test(name)?name:'pulse-'+tool;
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
 const type=(upstream.headers.get('content-type')||'').toLowerCase();
 const processed=processedSeconds(null,upstream.headers);
 if(upstream.status===429)return {code:429,data:{error:'AUDO_FREE_LIMIT'}};
 if(!upstream.ok){
  const body=type.includes('json')?await upstream.json().catch(()=>null):null;
  const failure=errorFromProvider(upstream.status,body);
  return {code:failure.status,data:{error:failure.error}};
 }
 if(upstream.status===202||type.includes('json')){
  const body=await upstream.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body))return {code:502,data:{error:'INVALID_AUDO_RESPONSE'}};
  const clean=stripBilling(body);
  const state=String(body.status??body.state??body.job?.status??'').toLowerCase();
  const pending=['pending','queued','running','processing','started','created'].includes(state)||upstream.status===202;
  const poll=getStatusUrl(body,upstream.headers);
  if(pending){
   if(!poll)return {code:502,data:{error:'MISSING_AUDO_STATUS_URL'}};
   return {code:200,data:{status:'processing',statusUrl:poll,processedSeconds:processed??processedSeconds(body,null)}};
  }
  if(['failed','cancelled','canceled','error'].includes(state))return {code:502,data:{error:'AUDO_PROCESSING_FAILED'}};
  const current=tool==='key-bpm'?normalizeAudoAnalysis(body):null;
  if(current&&(current.bpm!==null||current.key!==null||current.camelot!==null))
   return {code:200,data:{status:'complete',kind:'analysis',analysis:current,processedSeconds:processed??processedSeconds(body,null)}};
  const output=getOutput(body);
  if(output){
   const audio=/\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i.test(output.name||'')||String(output.mime||'').startsWith('audio/');
   return {code:200,data:{status:'complete',kind:audio?'audio-link':'file-link',url:output.url,name:output.name||'pulse-output',mime:output.mime||null,processedSeconds:processed??processedSeconds(body,null)}};
  }
  const result=clean.result??clean.analysis??clean.data??clean;
  const transcript=typeof result==='string'?result:
   typeof result?.text==='string'?result.text:
   typeof result?.transcript==='string'?result.transcript:
   typeof result?.srt==='string'?result.srt:
   typeof result?.vtt==='string'?result.vtt:null;
  if(transcript!==null&&['transcribe','align-script','audio-translator'].includes(tool))
   return {code:200,data:{status:'complete',kind:'text',text:transcript,format:tool==='audio-translator'?'srt':null,processedSeconds:processed??processedSeconds(body,null)}};
  return {code:200,data:{status:'complete',kind:'json',result,processedSeconds:processed??processedSeconds(body,null)}};
 }
 if(type.startsWith('text/')||type.includes('subrip')||type.includes('vtt')||type.includes('json')){
  const text=await upstream.text();
  if(text.length>MAX_RESULT_BYTES)return {code:413,data:{error:'AUDO_OUTPUT_TOO_LARGE'}};
  return {code:200,data:{status:'complete',kind:'text',text,processedSeconds:processed}};
 }
 if(type.startsWith('audio/')||type.includes('octet-stream')||type.includes('application/zip')){
  const declared=Number(upstream.headers.get('content-length'));
  if(declared>MAX_RESULT_BYTES)return {code:413,data:{error:'AUDO_OUTPUT_TOO_LARGE'}};
  const bytes=Buffer.from(await upstream.arrayBuffer());
  if(bytes.length<100||bytes.length>MAX_RESULT_BYTES)return {code:413,data:{error:'AUDO_OUTPUT_TOO_LARGE'}};
  return {code:200,data:{status:'complete',kind:'audio',mime:type.split(';')[0]||'application/octet-stream',
   name:contentName(upstream.headers,tool),base64:bytes.toString('base64'),processedSeconds:processed}};
 }
 return {code:502,data:{error:'UNSUPPORTED_AUDO_OUTPUT'}};
}
function routeFor(body){
 if(ROUTES.cleanup.includes(body.tool))return body.tool;
 if(body.tool==='cleanup')return ROUTES.cleanup.includes(body.mode)?body.mode:null;
 if(body.tool==='crosscheck')return ROUTES.crosscheck[0];
 if(body.tool==='sfx')return ROUTES.sfx[0];
 return ROUTES[body.tool]?.[0]||null;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return reply(res,200,{configured:true,freeOnly:true,maxFileBytes:MAX_AUDIO_BYTES,
  tools:Object.keys(ROUTES),apiKeyRequired:false});
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
   const headers={'User-Agent':'PULSE-Studio/1.0','Accept':'*/*'};
   if(process.env.AUDO_API_KEY)headers.Authorization='Bearer '+process.env.AUDO_API_KEY;
   const upstream=await fetch(url,{method:'GET',headers,signal:controller.signal,...OPTIONS});
   const result=await interpret(upstream,body.tool==='crosscheck'?'key-bpm':routeFor({tool:body.tool})||'media-info');
   return reply(res,result.code,result.data);
  }catch{return reply(res,502,{error:'AUDO_STATUS_UNAVAILABLE'});}
  finally{clearTimeout(timer);}
 }
 if(body.action!=='submit')return reply(res,400,{error:'UNKNOWN_ACTION'});
 if(req.url?.split('?')[1]!=='trial=1')return reply(res,403,{error:'AUDO_RATE_GATE_REQUIRED'});
 if(body.consent!==true)return reply(res,400,{error:'CLOUD_CONSENT_REQUIRED'});
 const tool=routeFor(body);
 if(!tool)return reply(res,400,{error:'INVALID_TOOL'});
 let form;
 try{form=makeForm(body,tool);}catch(error){return reply(res,400,{error:error.message||'INVALID_INPUT'});}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
 const headers={'User-Agent':'PULSE-Studio/1.0','Accept':'*/*'};
 if(process.env.AUDO_API_KEY)headers.Authorization='Bearer '+process.env.AUDO_API_KEY;
 try{
  const upstream=await fetch(BASE+'/api/try/'+tool,{method:'POST',body:form,headers,signal:controller.signal,...OPTIONS});
  const result=await interpret(upstream,tool);
  return reply(res,result.code,result.data);
 }catch(error){return reply(res,502,{error:error?.name==='AbortError'?'AUDO_REQUEST_TIMEOUT':'AUDO_CONNECTION_ERROR'});}
 finally{clearTimeout(timer);}
}
