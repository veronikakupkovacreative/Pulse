/** Owner-only Audial mastering adapter. Preview cloud transport for SHORT clips.
 * Real full-song upload needs direct-to-provider transport or an approved upload relay,
 * since Vercel functions have a much smaller ingress-body limit than Audial's 100 MB.
 * All provider credentials remain server-side. No audio sent without an explicit action.
 */
import {timingSafeEqual} from 'node:crypto';
const ENDPOINT='https://api.audialmusic.ai/api/functions/run/mastering';
const MAX_TOTAL_BYTES=2_700_000;
const MAX_B64_LENGTH=3_700_000;
const MAX_FILE_BYTES=2_700_000;
const safeEqual=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
const send=(res,code,payload)=>res.status(code).json(payload);
const envReady=()=>Boolean(process.env.AUDIAL_API_KEY&&process.env.AUDIAL_USER_ID&&process.env.PULSE_AUDIAL_OWNER_TOKEN);
const safeName=name=>String(name||'track.wav').replace(/[^a-z0-9._ -]/gi,'_').slice(0,90);
function parseFile(raw){
 if(!raw||typeof raw!=='object'||typeof raw.base64!=='string'||raw.base64.length>MAX_B64_LENGTH||
  !/^[a-z0-9+/]+={0,2}$/i.test(raw.base64)||raw.base64.length%4!==0)
  throw Error('Invalid audio payload.');
 const name=safeName(raw.name);
 if(!/\.(wav|mp3|flac|ogg|m4a|aac|aiff)$/i.test(name))throw Error('Unsupported cloud audio format.');
 const buffer=Buffer.from(raw.base64,'base64');
 if(!buffer.length||buffer.length>MAX_FILE_BYTES)throw Error('Cloud preview supports short audio files under 2.7 MB.');
 return {buffer,name,type:typeof raw.type==='string'&&/^audio\/[a-z0-9.+-]+$/i.test(raw.type)?raw.type:'application/octet-stream'};
}
function collectOutputs(data){
 const output=[];
 const visited=new Set();
 function walk(node,depth=0){
  if(depth>6||!node||typeof node!=='object'||visited.has(node))return;
  visited.add(node);
  for(const [k,v] of Object.entries(node)){
   if(typeof v==='string'&&/^https:\/\//i.test(v)&&/(url|link|download|file|audio|master)/i.test(k)){
    if(v.length<=2048)output.push({label:k,url:v});
   }else if(v&&typeof v==='object')walk(v,depth+1);
  }
 }
 walk(data);
 return output.slice(0,5);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return send(res,200,{
  configured:envReady(),maxBytes:MAX_FILE_BYTES,provider:'Audial',
  note:'Cloud mode is owner-gated and uploads audio only after explicit consent. Limited short-clip preview.'
 });
 if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!envReady())return send(res,503,{error:'AUDIAL_NOT_CONFIGURED'});
 if(!safeEqual(req.headers['x-pulse-owner-token'],process.env.PULSE_AUDIAL_OWNER_TOKEN))
  return send(res,403,{error:'OWNER_AUTH_REQUIRED'});
 let payload=req.body;
 if(typeof payload==='string'){try{payload=JSON.parse(payload)}catch{return send(res,400,{error:'INVALID_JSON'});}}
 if(payload?.consent!==true)return send(res,400,{error:'EXPLICIT_AUDIO_UPLOAD_CONSENT_REQUIRED'});
 let original,reference;
 try{
  original=parseFile(payload.original);
  if(payload.reference)reference=parseFile(payload.reference);
  if(original.buffer.length+(reference?.buffer.length||0)>MAX_TOTAL_BYTES)
   throw Error('Cloud preview supports up to 2.7 MB total across the mix and reference.');
 }catch(err){return send(res,413,{error:err.message||'INVALID_AUDIO_INPUT'});}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),52000);
 try{
  const form=new FormData();
  form.append('userId',process.env.AUDIAL_USER_ID);
  form.append('original',new Blob([original.buffer],{type:original.type}),original.name);
  if(reference)form.append('reference',new Blob([reference.buffer],{type:reference.type}),reference.name);
  const response=await fetch(ENDPOINT,{
   method:'POST',headers:{'X-API-Key':process.env.AUDIAL_API_KEY,'X-User-ID':process.env.AUDIAL_USER_ID},
   body:form,signal:controller.signal
  });
  const contentType=response.headers.get('content-type')||'';
  if(!response.ok){
   // Do not forward upstream raw body, which may contain private data.
   const error=response.status===402?'SUBSCRIPTION_REQUIRED':
    response.status===401||response.status===403?'AUDIAL_AUTH_FAILED':
    response.status===429?'AUDIAL_RATE_LIMITED':'AUDIAL_API_ERROR';
   return send(res,response.status>=400&&response.status<500?response.status:502,{error,status:response.status});
  }
  if(contentType.startsWith('audio/')||contentType.includes('octet-stream')){
   const data=Buffer.from(await response.arrayBuffer());
   if(data.length>3_000_000)return send(res,202,{status:'submitted',message:'Mastered file is larger than the preview response limit. Check your Audial account.'});
   return send(res,200,{status:'complete',audio:{base64:data.toString('base64'),type:contentType},message:'Audial returned audio directly.'});
  }
  const json=await response.json().catch(()=>null);
  if(!json)return send(res,502,{error:'UNSUPPORTED_PROVIDER_RESPONSE'});
  return send(res,200,{
   status:json.status||json.state||'submitted',
   links:collectOutputs(json),
   message:json.message?String(json.message).slice(0,280):'Request accepted by Audial. See your Audial account if no download URL was returned.'
  });
 }catch(error){
  return send(res,502,{error:error.name==='AbortError'?'AUDIAL_TIMEOUT':'AUDIAL_CONNECTION_ERROR'});
 }finally{clearTimeout(timeout);}
}
