/** MusicGPT Lyrics Generator — server-only API key; consent-gated and owner protected.
 * Public docs: GET /api/public/v1/prompt_to_lyrics?prompt=...
 * Provider bills per request. Do not auto-generate or retry POST requests.
 */
import {timingSafeEqual} from 'node:crypto';
const ENDPOINT='https://api.musicgpt.com/api/public/v1/prompt_to_lyrics';
const respond=(res,status,payload)=>res.status(status).json(payload);
const ready=()=>Boolean(process.env.MUSICGPT_LYRICS_API_KEY&&process.env.PULSE_MUSICGPT_OWNER_TOKEN);
const matches=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length&&timingSafeEqual(left,right);
};
const validPrompt=prompt=>typeof prompt==='string'&&prompt.trim().length>=1&&prompt.trim().length<=1000&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(prompt);
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return respond(res,200,{configured:ready(),provider:'MusicGPT',input:'text',promptLimit:1000,requiresConsent:true});
 if(req.method!=='POST')return respond(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!ready())return respond(res,503,{error:'MUSICGPT_LYRICS_NOT_CONFIGURED'});
 if(!matches(req.headers?.['x-pulse-owner-token'],process.env.PULSE_MUSICGPT_OWNER_TOKEN))
  return respond(res,403,{error:'OWNER_AUTH_REQUIRED'});
 if(req.headers?.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return respond(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
  catch{return respond(res,403,{error:'CROSS_ORIGIN_BLOCKED'});}
 }
 let payload=req.body;
 if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch{return respond(res,400,{error:'INVALID_JSON'});}}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return respond(res,400,{error:'INVALID_JSON'});
 if(payload.action!=='generate')return respond(res,400,{error:'INVALID_ACTION'});
 if(payload.consent!==true)return respond(res,400,{error:'TEXT_UPLOAD_CONSENT_REQUIRED'});
 if(!validPrompt(payload.prompt))return respond(res,400,{error:'INVALID_PROMPT',message:'Prompt must contain 1–1000 characters.'});
 const apiKey=process.env.MUSICGPT_LYRICS_API_KEY;
 const url=new URL(ENDPOINT);url.searchParams.set('prompt',payload.prompt.trim());
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
 try{
  const response=await fetch(url,{method:'GET',headers:{Authorization:apiKey,Accept:'application/json'},
   redirect:'error',signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.success===false){
   const error=response.status===402?'INSUFFICIENT_CREDITS':
    response.status===401||response.status===403?'MUSICGPT_LYRICS_AUTH_FAILED':
    response.status===429?'MUSICGPT_RATE_LIMITED':
    response.status===400||response.status===422?'MUSICGPT_INVALID_PROMPT':'MUSICGPT_LYRICS_PROVIDER_ERROR';
   return respond(res,response.status>=400&&response.status<500?response.status:502,{error});
  }
  if(typeof result?.lyrics!=='string'||!result.lyrics.trim())
   return respond(res,502,{error:'INVALID_PROVIDER_RESPONSE'});
  return respond(res,200,{
   lyrics:result.lyrics.slice(0,30000),
   taskId:typeof result.task_id==='string'?result.task_id.slice(0,128):null,
   creditEstimate:typeof result.credit_estimate==='number'&&Number.isFinite(result.credit_estimate)?
    Math.max(0,result.credit_estimate):null,
   provider:'MusicGPT'
  });
 }catch(error){return respond(res,502,{error:error?.name==='AbortError'?'MUSICGPT_LYRICS_TIMEOUT':'MUSICGPT_LYRICS_CONNECTION_ERROR'});}
 finally{clearTimeout(timer);}
}
