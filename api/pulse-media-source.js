/** Optional authorized-source resolver for future provider integrations.
 * No arbitrary URL proxying, YouTube scraping or server-side downloads.
 * Direct browser CORS import works independently of this endpoint.
 */
import {validateDirectMediaUrl,REMOTE_MEDIA_MAX_BYTES} from '../source/modules/media-source.mjs';
const approvedHosts=()=>new Set(String(process.env.PULSE_MEDIA_ALLOWED_HOSTS||'')
 .split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[a-z0-9.-]+$/.test(x)&&x.includes('.')));
const send=(res,code,data)=>res.status(code).json(data);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return send(res,200,{
  configured:approvedHosts().size>0,
  transport:'browser-cors',
  maxBytes:REMOTE_MEDIA_MAX_BYTES,
  note:'Approved direct media links only. This endpoint never downloads or proxies files. Future provider adapters require explicit configuration.'
 });
 if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 const allowlist=approvedHosts();
 if(!allowlist.size)return send(res,503,{error:'NO_APPROVED_MEDIA_PROVIDERS_CONFIGURED'});
 if(req.body?.consent!==true)return send(res,400,{error:'MEDIA_ACCESS_CONSENT_REQUIRED'});
 let parsed;
 try{parsed=validateDirectMediaUrl(req.body?.url);}
 catch{return send(res,400,{error:'INVALID_MEDIA_FILE_URL'});}
 const hostname=new URL(parsed.url).hostname.toLowerCase();
 if(!allowlist.has(hostname))return send(res,403,{error:'MEDIA_HOST_NOT_ALLOWLISTED'});
 return send(res,200,{
  status:'approved',
  transport:'browser-cors',
  maxBytes:REMOTE_MEDIA_MAX_BYTES,
  downloadUrl:parsed.url,
  note:'The approved host must allow browser CORS GET requests. File bytes are never sent through this endpoint.'
 });
}
