/** PULSE STEMS / Vercel Node serverless owner-gated Replicate Demucs adapter.
 * Uses the pinned community model cjwbw/demucs version verified 2026-11.
 * Credentials: REPLICATE_API_TOKEN and PULSE_AI_GATE_TOKEN in Vercel env.
 * No model runs or payments occur unless an authorized user initiates a request.
 */
import {timingSafeEqual} from 'node:crypto';
const ENDPOINT='https://api.replicate.com/v1/predictions';
const MODEL='cjwbw/demucs:25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953';
const MAX_B64=2_400_000; // base64 chars, conservative serverless body size
const KEYS=['vocals','drums','bass','other'];
const response=(res,status,body)=>res.status(status).json(body);
const secureEqual=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
function validateAudioUrl(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Enter a public HTTPS audio URL.');
 let url; try{url=new URL(value)}catch{throw Error('Invalid audio URL.');}
 if(url.protocol!=='https:'||url.username||url.password||
   /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1)/i.test(url.hostname))
   throw Error('Only public HTTPS audio URLs are supported.');
 return url.href;
}
function inputAudio(body){
 if(typeof body.audioUrl==='string'&&body.audioUrl.trim())return validateAudioUrl(body.audioUrl.trim());
 const raw=body.audioBase64;
 if(typeof raw!=='string'||raw.length<1000||raw.length>MAX_B64||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))
   throw Error('Select a short, compressed MP3 file, or provide a public HTTPS audio URL.');
 const decoded=Buffer.from(raw,'base64');
 if(decoded.length<1024||decoded.length>1_800_000)throw Error('Direct upload limit: 1.8 MB. Use an HTTPS file URL for full tracks.');
 return 'data:audio/mpeg;base64,'+raw;
}
async function callReplicate(path,{method='GET',body=null,token}){
 const options={method,headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)};
 if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
 const result=await fetch('https://api.replicate.com'+path,options);
 let data={};try{data=await result.json()}catch{}
 if(!result.ok){const message=typeof data.detail==='string'?data.detail:'Replicate returned HTTP '+result.status;
   throw Object.assign(new Error(String(message).slice(0,220)),{httpCode:result.status});}
 return data;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return response(res,405,{error:'POST only.'});}
 const token=process.env.REPLICATE_API_TOKEN,gate=process.env.PULSE_AI_GATE_TOKEN;
 if(!token||!gate)return response(res,503,{error:'Stems backend is not configured by the project owner.'});
 if(!secureEqual(req.headers?.['x-pulse-access'],gate))return response(res,401,{error:'Invalid cloud access token.'});
 if(req.headers.origin){
   try{if(new URL(req.headers.origin).host!==req.headers.host)return response(res,403,{error:'Cross-origin request blocked.'});}
   catch{return response(res,403,{error:'Invalid Origin.'});}
 }
 try{
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Expected an input object.');
   if(JSON.stringify(body).length>MAX_B64+5000)throw Error('Request is too large.');
   const action=body.action;
   if(action==='create'){
     const audio=inputAudio(body);
     const prediction=await callReplicate('/v1/predictions',{
       method:'POST',token,body:{version:MODEL,input:{audio,model_name:'htdemucs',shifts:1,overlap:.25,output_format:'mp3',mp3_bitrate:320}}
     });
     if(!/^[a-z0-9]{10,80}$/i.test(prediction.id||''))throw Error('Provider returned an invalid job identifier.');
     return response(res,200,{id:prediction.id,status:prediction.status});
   }
   if(action==='status'||action==='cancel'){
     const id=String(body.id||'');
     if(!/^[a-z0-9]{10,80}$/i.test(id))throw Error('Invalid prediction identifier.');
     const pred=await callReplicate('/v1/predictions/'+id+(action==='cancel'?'/cancel':''),{
       method:action==='cancel'?'POST':'GET',token
     });
     const output={};
     if(pred.output&&typeof pred.output==='object')for(const k of KEYS){
       const value=pred.output[k];
       if(typeof value==='string'){
         try{const url=new URL(value);if(url.protocol==='https:')output[k]=url.href;}catch{}
       }
     }
     return response(res,200,{id,status:pred.status||'unknown',output,error:pred.error?String(pred.error).slice(0,300):null});
   }
   return response(res,400,{error:'Unknown stems action.'});
 }catch(error){
   const known=error?.httpCode;
   const status=/invalid|supported|limit|select|expect|too large|missing|short|only public/i.test(error.message||'')?400:known===429?429:502;
   return response(res,status,{error:String(error.message||'Stem separation failed.').slice(0,300)});
 }
}
