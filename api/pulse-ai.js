/**
 * PULSE AI MASTER backend (Vercel Node Serverless Function).
 * Environment:
 *   ELEVENLABS_API_KEY   ElevenLabs private API key (never expose to frontend).
 *   PULSE_AI_GATE_TOKEN  long random private owner access token, required for ANY cloud action.
 * Intended as owner-only integration. Replace gate token with per-user authentication,
 * quotas and billing before offering publicly.
 * Uses documented ElevenLabs REST endpoints from a Node 20+ server-side proxy (SDK-equivalent calls).
 */
import {timingSafeEqual} from 'node:crypto';

const BASE='https://api.elevenlabs.io';
const MAX_BYTES=2_400_000;
const MAX_OUTPUT_BYTES=4_000_000; // Vercel function response body ceiling margin
const REQUEST_LIMIT=Math.ceil(MAX_BYTES*4/3)+16;
const voicePattern=/^[a-zA-Z0-9_-]{10,128}$/;
const extensions=/\.(mp3|m4a|wav|flac|ogg|aac|opus|aiff|webm)$/i;
const defaultHeaders={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const json=(res,code,data)=>res.status(code).json(data);

function equalToken(a,b) {
  if(!a||!b)return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
function parseBody(input){
  if(typeof input==='string'){if(input.length>REQUEST_LIMIT+2500)throw Error('Payload too large.');return JSON.parse(input)}
  if(!input || typeof input!=='object' || Array.isArray(input))throw Error('Expected a JSON object.');
  return input;
}
function validateAudio(body){
  const {audioBase64,filename,mime}=body;
  if(typeof audioBase64!=='string'||audioBase64.length>REQUEST_LIMIT||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audioBase64))
    throw Error('Invalid audio payload.');
  const bytes=Buffer.from(audioBase64,'base64');
  if(bytes.length<1024||bytes.length>MAX_BYTES)throw Error('Audio must be between 1 KB and 2.4 MB.');
  const name=typeof filename==='string'?filename.replace(/[^a-zA-Z0-9_.-]+/g,'-').slice(0,90):'';
  if(!extensions.test(name))throw Error('Unsupported file extension for audio upload.');
  const allowedMime=/^audio\/(mpeg|mp3|mp4|x-m4a|wav|x-wav|wave|aac|ogg|flac|x-flac|opus|aiff|webm|octet-stream)$/i;
  const type=typeof mime==='string'&&allowedMime.test(mime)?mime:'application/octet-stream';
  return {bytes,name,type};
}
async function upstreamError(response){
  let message=`AI service returned HTTP ${response.status}.`;
  try {
    const raw=await response.text();
    const details=JSON.parse(raw);
    const d=details.detail;
    const explanation=typeof d==='string'?d:typeof d?.message==='string'?d.message:details.message;
    if(typeof explanation==='string')message=explanation.slice(0,360);
  }catch{}
  return message;
}
async function readSmallBinary(response){
  const expected=Number(response.headers.get('content-length')||0);
  if(expected>MAX_OUTPUT_BYTES)throw Error('AI output exceeds the 4 MB proxy limit. Please use a shorter clip.');
  const reader=response.body?.getReader();
  if(!reader){const b=Buffer.from(await response.arrayBuffer());if(b.length>MAX_OUTPUT_BYTES)throw Error('AI output exceeds the 4 MB proxy limit.');return b}
  const chunks=[];let total=0;
  while(true){const {value,done}=await reader.read();if(done)break;
    total+=value.byteLength;if(total>MAX_OUTPUT_BYTES){await reader.cancel();throw Error('AI output exceeds the 4 MB proxy limit. Please use a shorter clip.')}
    chunks.push(Buffer.from(value));}
  return Buffer.concat(chunks,total);
}
async function eleven(path,{method='POST',body,headers={},key}) {
  const response=await fetch(`${BASE}${path}`,{
    method,headers:{'xi-api-key':key,...headers},body,signal:AbortSignal.timeout(55_000)
  });
  if(!response.ok)throw Object.assign(new Error(await upstreamError(response)),{httpStatus:response.status});
  return response;
}
export default async function handler(req,res) {
  for(const [k,v] of Object.entries(defaultHeaders))res.setHeader(k,v);
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Method not allowed.'})}
  const key=process.env.ELEVENLABS_API_KEY,gate=process.env.PULSE_AI_GATE_TOKEN;
  if(!key||!gate)return json(res,503,{error:'Cloud AI backend is not configured by the project owner.'});
  const provided=req.headers['x-pulse-access'];
  if(typeof provided!=='string'||!equalToken(provided,gate))return json(res,401,{error:'Invalid PULSE cloud access token.'});
  const incomingOrigin=req.headers.origin;
  // Standard same-origin clients; do not permit cross-origin browser use.
  if(incomingOrigin){
    try{if(new URL(incomingOrigin).host!==req.headers.host)return json(res,403,{error:'Cross-origin requests are blocked.'})}
    catch{return json(res,403,{error:'Invalid origin.'})}
  }
  try{
    const request=parseBody(req.body);
    const action=request.action;
    if(!['isolate','clone','speak','delete','change','effects','voices'].includes(action))return json(res,400,{error:'Unknown AI action.'});

    // New ElevenLabs capabilities, all authenticated and routed to fixed endpoints.
    if(action==='voices'){
      const response=await eleven('/v2/voices?page_size=100',{method:'GET',key});
      const data=await response.json();
      const entries=Array.isArray(data.voices)?data.voices:[];
      const voices=entries.filter(item=>voicePattern.test(String(item.voice_id||'')))
        .slice(0,100).map(item=>({
          voice_id:item.voice_id,
          name:typeof item.name==='string'?item.name.slice(0,90):'Untitled voice',
          category:typeof item.category==='string'?item.category.slice(0,32):'voice'
        }));
      return json(res,200,{voices,has_more:!!data.has_more});
    }
    if(action==='effects'){
      const text=typeof request.text==='string'?request.text.trim():'';
      const duration=request.duration==null?null:Number(request.duration);
      const influence=request.influence==null?.3:Number(request.influence);
      if(text.length<4||text.length>600)return json(res,400,{error:'Sound effect description must contain 4–600 characters.'});
      if(duration!==null&&(!Number.isFinite(duration)||duration<.5||duration>30))return json(res,400,{error:'Sound duration must be 0.5–30 seconds.'});
      if(!Number.isFinite(influence)||influence<0||influence>1)return json(res,400,{error:'Prompt influence must be between 0 and 1.'});
      if(request.loop!==undefined&&typeof request.loop!=='boolean')return json(res,400,{error:'Invalid loop setting.'});
      const payload={text,model_id:'eleven_text_to_sound_v3',prompt_influence:influence,loop:request.loop===true};
      if(duration!==null)payload.duration_seconds=duration;
      const response=await eleven('/v1/sound-generation?output_format=mp3_44100_128',{
        key,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const binary=await readSmallBinary(response);
      res.setHeader('Content-Type','audio/mpeg');
      return res.status(200).send(binary);
    }
    if(action==='change'){
      const voiceId=typeof request.voiceId==='string'?request.voiceId.trim():'';
      if(!voicePattern.test(voiceId))return json(res,400,{error:'Select a valid destination Voice ID.'});
      const profile=typeof request.profile==='string'?request.profile:'natural';
      const profiles={
        natural:{stability:.50,similarity_boost:.78,style:.08,use_speaker_boost:true},
        expressive:{stability:.30,similarity_boost:.80,style:.45,use_speaker_boost:true},
        stable:{stability:.82,similarity_boost:.75,style:0,use_speaker_boost:true}
      };
      if(!Object.hasOwn(profiles,profile))return json(res,400,{error:'Unknown voice preset.'});
      if(request.denoise!==undefined&&typeof request.denoise!=='boolean')return json(res,400,{error:'Invalid denoise option.'});
      const file=validateAudio(request),body=new FormData();
      body.append('audio',new Blob([file.bytes],{type:file.type}),file.name);
      body.append('model_id','eleven_multilingual_sts_v2');
      body.append('voice_settings',JSON.stringify(profiles[profile]));
      body.append('remove_background_noise',String(request.denoise===true));
      const response=await eleven('/v1/voice-changer/'+voiceId+'?output_format=mp3_44100_128',{body,key});
      const binary=await readSmallBinary(response);
      res.setHeader('Content-Type','audio/mpeg');
      return res.status(200).send(binary);
    }
    if(action==='isolate'||action==='clone'){
      const file=validateAudio(request),body=new FormData();
      if(action==='isolate'){
        body.append('audio',new Blob([file.bytes],{type:file.type}),file.name);
        const result=await eleven('/v1/audio-isolation',{body,key});
        const binary=await readSmallBinary(result);
        res.setHeader('Content-Type',result.headers.get('content-type')||'audio/wav');
        return res.status(200).send(binary);
      }
      if(request.consent!==true)return json(res,400,{error:'Explicit voice cloning authorization must be confirmed.'});
      const name=typeof request.name==='string'?request.name.trim():'';
      if(name.length<2||name.length>70)return json(res,400,{error:'Voice name must have 2–70 characters.'});
      body.append('name',name);
      body.append('description','Authorized voice clone created by PULSE Studio.');
      body.append('files',new Blob([file.bytes],{type:file.type}),file.name);
      const result=await eleven('/v1/voices/add',{body,key});
      const data=await result.json();
      if(typeof data.voice_id!=='string')throw Error('Provider did not return a voice identifier.');
      return json(res,200,{voice_id:data.voice_id,requires_verification:!!data.requires_verification});
    }
    const voiceId=typeof request.voiceId==='string'?request.voiceId.trim():'';
    if(!voicePattern.test(voiceId))return json(res,400,{error:'Invalid Voice ID.'});
    if(action==='delete'){
      const response=await eleven(`/v1/voices/${voiceId}`,{method:'DELETE',key});
      await response.body?.cancel?.();
      return json(res,200,{deleted:true});
    }
    const text=typeof request.text==='string'?request.text.trim():'';
    if(!text||text.length>2000)return json(res,400,{error:'Text must contain 1–2000 characters.'});
    const response=await eleven(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,{
      key,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text,model_id:'eleven_multilingual_v2'})
    });
    const binary=await readSmallBinary(response);
    res.setHeader('Content-Type','audio/mpeg');return res.status(200).send(binary);
  }catch(error){
    const known=error?.httpStatus;
    const code=known===401||known===403?502:known===429?429:known===413?413:known>=400&&known<500?400:502;
    const isBadInput=error instanceof SyntaxError || /invalid|unsupported|audio must|payload too large|exceeds|voice name|voice cloning authorization|prompt|duration|voice preset/i.test(error.message||'');
    return json(res,isBadInput?400:code,{error:String(error.message||'Cloud AI request failed.').slice(0,380)});
  }
}