/** PULSE / Vercel-only control-plane proxy for the external yt-dlp Docker worker.
 * No remote video or converted media bytes flow through Vercel Functions.
 * Owner access is mandatory until proper user sessions, quotas and abuse protection exist.
 */
import {timingSafeEqual} from 'node:crypto';
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formats=new Set(['mp3','wav','mp4']);
const reply=(res,code,body)=>res.status(code).json(body);
const equal=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
function configuration(){
 const endpoint=process.env.PULSE_YT_WORKER_URL||'';
 const secret=process.env.PULSE_YT_SERVICE_TOKEN||'';
 const owner=process.env.PULSE_YT_OWNER_TOKEN||'';
 if(!secret||secret.length<24||!owner||owner.length<16)return null;
 let uri;try{uri=new URL(endpoint);}catch{return null;}
 if(uri.protocol!=='https:'||uri.username||uri.password||uri.search||uri.hash)return null;
 return {endpoint:uri.origin,secret,owner};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return reply(res,200,{
  configured:!!configuration(),ownerOnly:true,formats:['mp3','wav','mp4'],
  maxDurationSeconds:600,maxOutputBytes:150*1024*1024,
  message:configuration()?'Owner-authorized YouTube worker is configured.':
    'YouTube downloader requires the external yt-dlp worker and owner access configuration.'
 });
 if(req.method!=='POST')return reply(res,405,{error:'POST only.'});
 const config=configuration();
 if(!config)return reply(res,503,{error:'The YouTube worker is not configured by the project owner.'});
 if(!equal(req.headers?.['x-pulse-owner'],config.owner))
  return reply(res,401,{error:'Owner access code is incorrect.'});
 // Browser calls must originate from this Vercel hostname; no third-party JS API.
 const origin=req.headers?.origin,host=req.headers?.host;
 if(origin){
  let source;
  try{source=new URL(origin);}catch{return reply(res,403,{error:'Invalid origin.'});}
  if(source.host!==host||source.protocol!=='https:')
   return reply(res,403,{error:'Cross-origin requests are blocked.'});
 }
 let body=req.body||{};
 if(typeof body==='string'){if(body.length>4096)return reply(res,413,{error:'Request too large.'});
  try{body=JSON.parse(body);}catch{return reply(res,400,{error:'Invalid JSON.'});}
 }
 if(!body||typeof body!=='object'||Array.isArray(body))
  return reply(res,400,{error:'Expected a JSON object.'});
 let endpoint,method='POST',payload;
 if(body.action==='create'){
  if(body.rightsConfirmed!==true||!formats.has(body.format)||typeof body.url!=='string'||body.url.length>2048)
   return reply(res,400,{error:'Video URL, format and permission confirmation are required.'});
  const bitrate=Number(body.bitrate||192);
  if(body.format==='mp3'&&![128,192,256,320].includes(bitrate))
   return reply(res,400,{error:'Unsupported MP3 bitrate.'});
  endpoint='/v1/jobs';payload={url:body.url,format:body.format,bitrate,rightsConfirmed:true};
 }else if(['status','cancel'].includes(body.action)){
  if(typeof body.id!=='string'||!idPattern.test(body.id))
   return reply(res,400,{error:'Invalid job ID.'});
  endpoint='/v1/jobs/'+body.id+(body.action==='cancel'?'/cancel':'');
  if(body.action==='status')method='GET';
 }else return reply(res,400,{error:'Unknown action.'});
 try{
  const result=await fetch(config.endpoint+endpoint,{
   method,headers:{Authorization:'Bearer '+config.secret,
    ...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{}),
   signal:AbortSignal.timeout(12000),cache:'no-store'
  });
  const json=await result.json().catch(()=>({error:'Worker returned an invalid response.'}));
  // Never forward worker headers or access credentials to the browser.
  return reply(res,result.status,json);
 }catch(error){
  return reply(res,502,{error:'YouTube worker is unreachable. Check that the external backend is running.'});
 }
}
