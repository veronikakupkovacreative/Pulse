/** Audial Music Tagging opt-in proxy.
 * Only accepts explicit consent, an owner token and a short source audio file.
 * External audio transfer is never initiated by local analysis.
 * Secrets are read exclusively from Vercel environment variables.
 */
import {timingSafeEqual} from 'node:crypto';
const ORIGIN='https://api.audialmusic.ai/api';
const MAX_FILE_BYTES=2_500_000;
const eq=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
const json=(res,status,data)=>res.status(status).json(data);
const ready=()=>Boolean(process.env.AUDIAL_API_KEY&&process.env.AUDIAL_USER_ID&&process.env.PULSE_AUDIAL_OWNER_TOKEN);
function decodeFile(file){
 if(!file||typeof file.name!=='string'||typeof file.base64!=='string'||file.base64.length>3_400_000||
  !/^[a-z0-9+/]+={0,2}$/i.test(file.base64)||file.base64.length%4)throw Error('INVALID_AUDIO');
 const name=file.name.replace(/[^a-z0-9_. -]/gi,'_').slice(0,80);
 if(!/\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(name))throw Error('INVALID_AUDIO_FORMAT');
 const bytes=Buffer.from(file.base64,'base64');
 if(!bytes.length||bytes.length>MAX_FILE_BYTES)throw Error('FILE_TOO_LARGE');
 return {name,bytes};
}
function validExeId(id){return typeof id==='string'&&/^exe_[a-z0-9_-]{5,100}$/i.test(id);}
async function provider(path,{method='GET',form,signal}={}){
 const headers={'X-API-Key':process.env.AUDIAL_API_KEY,'X-User-ID':process.env.AUDIAL_USER_ID};
 const response=await fetch(ORIGIN+path,{method,headers,body:form,signal});
 let payload=null;
 try{payload=await response.json();}catch{}
 if(!response.ok){
  const message=response.status===409?'STEMS_NOT_READY':response.status===402?'SUBSCRIPTION_REQUIRED':
   response.status===401||response.status===403?'AUDIAL_AUTH_FAILED':response.status===429?'RATE_LIMITED':
   response.status===413?'AUDIAL_SIZE_LIMIT':'AUDIAL_PROVIDER_ERROR';
  return {ok:false,status:response.status,error:message};
 }
 return {ok:true,payload};
}
function extractId(value){
 const candidates=[value?.exeId,value?.executionId,value?.analysisExeId,value?.analysis_id,
  value?.data?.exeId,value?.data?.analysisExeId,value?.result?.exeId,value?.result?.analysisExeId];
 return candidates.find(validExeId)||null;
}
function normalize(data){
 const obj=data?.analysis||data?.data?.analysis||data?.data||data?.result||data||{};
 const tags=obj.song_tags||obj.songTags||{};
 const out={genre:Array.isArray(obj.genre)?obj.genre:typeof obj.genre==='string'?[obj.genre]:[],
  description:typeof obj.description==='string'?obj.description.slice(0,1500):'',
  song_tags:{}};
 for(const name of ['full','drums','bass','melody','vocals']){
  const t=tags[name]||{};
  out.song_tags[name]={silent:t.silent===true,
   moods:Array.isArray(t.moods)?t.moods.filter(x=>typeof x==='string').slice(0,30):[],
   instruments:Array.isArray(t.instruments)?t.instruments.filter(x=>typeof x==='string').slice(0,30):[]};
 }
 return out;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method==='GET')return json(res,200,{configured:ready(),maxFileBytes:MAX_FILE_BYTES,provider:'Audial',privacy:'Cloud upload requires owner authorization and explicit consent.'});
 if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!ready())return json(res,503,{error:'AUDIAL_NOT_CONFIGURED'});
 if(!eq(req.headers['x-pulse-owner-token'],process.env.PULSE_AUDIAL_OWNER_TOKEN))return json(res,403,{error:'OWNER_AUTH_REQUIRED'});
 let body=req.body;
 if(typeof body==='string'){try{body=JSON.parse(body)}catch{return json(res,400,{error:'INVALID_JSON'});}}
 if(body?.consent!==true)return json(res,400,{error:'UPLOAD_CONSENT_REQUIRED'});
 const action=body.action;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),52000);
 try{
  let outcome;
  if(action==='start'){
   const source=decodeFile(body.file);
   const form=new FormData();
   form.append('userId',process.env.AUDIAL_USER_ID);
   form.append('original',new Blob([source.bytes],{type:'application/octet-stream'}),source.name);
   outcome=await provider('/functions/run/segmentation',{method:'POST',form,signal:controller.signal});
   if(!outcome.ok)return json(res,outcome.status>=400&&outcome.status<500?outcome.status:502,{error:outcome.error});
   const analysisExeId=extractId(outcome.payload);
   if(!analysisExeId)return json(res,502,{error:'AUDIAL_EXECUTION_ID_MISSING',message:'Provider response did not contain a recognized execution ID.'});
   return json(res,200,{analysisExeId,status:'segmentation_requested'});
  }
  if(!validExeId(body.analysisExeId))return json(res,400,{error:'INVALID_ANALYSIS_ID'});
  const id=body.analysisExeId;
  if(action==='tag'){
   const form=new FormData();
   form.append('userId',process.env.AUDIAL_USER_ID);
   form.append('analysisExeId',id);
   outcome=await provider('/functions/run/audio-tags',{method:'POST',form,signal:controller.signal});
   if(!outcome.ok)return json(res,outcome.status>=400&&outcome.status<500?outcome.status:502,{error:outcome.error,analysisExeId:id});
   return json(res,200,{analysisExeId:id,status:'tagging_requested'});
  }
  if(action==='result'){
   outcome=await provider('/db/'+encodeURIComponent(process.env.AUDIAL_USER_ID)+'/execution/'+encodeURIComponent(id)+'/analysis',{signal:controller.signal});
   if(!outcome.ok)return json(res,outcome.status>=400&&outcome.status<500?outcome.status:502,{error:outcome.error});
   const report=normalize(outcome.payload);
   const hasTags=report.genre.length||report.description||Object.values(report.song_tags).some(x=>x.moods.length||x.instruments.length||x.silent);
   return json(res,200,{analysisExeId:id,status:hasTags?'complete':'pending',tags:hasTags?report:null});
  }
  return json(res,400,{error:'INVALID_ACTION'});
 }catch(error){
  return json(res,502,{error:error?.name==='AbortError'?'AUDIAL_TIMEOUT':
   /^(INVALID_AUDIO|INVALID_AUDIO_FORMAT|FILE_TOO_LARGE)$/.test(error.message)?error.message:'AUDIAL_CONNECTION_ERROR'});
 }finally{clearTimeout(timeout);}
}