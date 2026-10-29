import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ACCESS_COOKIE='pulse_access_token';
const REFRESH_COOKIE='pulse_refresh_token';
const secure=process.env.NODE_ENV==='production';
const env=(name)=>process.env[name]?.trim() || '';

export function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
export function method(req,res,allow){if(!allow.includes(req.method)){res.setHeader('Allow',allow.join(', '));json(res,405,{error:'Metoda není povolena.'});return false;}return true;}
export function cookie(req,key){const all=(req.headers.cookie||'').split(';').map(v=>v.trim());const entry=all.find(v=>v.startsWith(`${key}=`));if(!entry)return '';try{return decodeURIComponent(entry.slice(key.length+1));}catch{return '';}}
function appendCookie(res,line){const prior=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...prior,line]);}
function setCookie(res,name,value,age){const flags=[`${name}=${encodeURIComponent(value)}`,'HttpOnly','Path=/','SameSite=Lax',`Max-Age=${Math.max(0,Math.floor(age))}`];if(secure)flags.push('Secure');appendCookie(res,flags.join('; '));}
export function saveSession(res,auth){if(!auth?.access_token||!auth?.refresh_token)throw new Error('Invalid auth session');setCookie(res,ACCESS_COOKIE,auth.access_token,auth.expires_in||3600);setCookie(res,REFRESH_COOKIE,auth.refresh_token,60*60*24*365);}
export function clearSession(res){setCookie(res,ACCESS_COOKIE,'',0);setCookie(res,REFRESH_COOKIE,'',0);}
export function configured(){return Boolean(env('SUPABASE_URL')&&env('SUPABASE_ANON_KEY')&&env('SUPABASE_SERVICE_ROLE_KEY'));}
export function supabaseBase(){const origin=env('SUPABASE_URL').replace(/\/$/,'');if(!/^https:\/\/[^\s/]+$/.test(origin))throw new Error('Invalid Supabase URL');return origin;}
function parsePayload(payload){if(typeof payload==='string'){try{return JSON.parse(payload)}catch{return {}};}return payload||{};}
export async function sbAuth(endpoint,payload,token=''){const key=env('SUPABASE_ANON_KEY');if(!key)throw new Error('Auth not configured');const response=await fetch(`${supabaseBase()}/auth/v1/${endpoint}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(parsePayload(payload))});const data=await response.json().catch(()=>({}));return {ok:response.ok,status:response.status,data};}
export async function getUser(req,res){let token=cookie(req,ACCESS_COOKIE);if(!token && !cookie(req,REFRESH_COOKIE))return null;const key=env('SUPABASE_ANON_KEY');if(!key)return null;
  async function fetchUser(access){const response=await fetch(`${supabaseBase()}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${access}`}});return response.ok?await response.json():null;}
  if(token){const user=await fetchUser(token);if(user?.id)return user;}
  const refresh=cookie(req,REFRESH_COOKIE);if(!refresh)return null;
  const renewed=await sbAuth('token?grant_type=refresh_token',{refresh_token:refresh});
  if(!renewed.ok){clearSession(res);return null;}saveSession(res,renewed.data);token=renewed.data.access_token;
  return await fetchUser(token);
}
export function serviceHeaders(){const key=env('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw new Error('Database not configured');return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}
export async function dbRequest(endpoint,method='GET',body=null,extra={}){const response=await fetch(`${supabaseBase()}/rest/v1/${endpoint}`,{method,headers:{...serviceHeaders(),...extra},...(body!==null?{body:JSON.stringify(body)}:{})});const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{data={error:text.slice(0,160)};}if(!response.ok)throw new Error(`Database request failed: ${response.status}`);return data;}
export async function hasAccess(userId){if(!userId)return false;const rows=await dbRequest(`pulse_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=revoked_at&limit=1`);return Array.isArray(rows) && rows.length>0 && !rows[0].revoked_at;}
export function serverError(res,error){console.error('Pulse API error:',error?.message||error);return json(res,503,{error:'Služba momentálně není dostupná. Zkus to znovu později.'});}
export async function studioHtml(){const here=path.dirname(fileURLToPath(import.meta.url));return readFile(path.resolve(here,'../private/studio.html'),'utf8');}
export function siteUrl(){const base=env('PULSE_SITE_URL').replace(/\/$/,'');if(!/^https:\/\/[^\s/]+$/.test(base)&&!/^http:\/\/localhost(:\d+)?$/.test(base))throw new Error('PULSE_SITE_URL not configured');return base;}
export function stripeKey(){const key=env('STRIPE_SECRET_KEY');if(!key)throw new Error('Stripe not configured');return key;}
export async function stripeRequest(endpoint,form){const response=await fetch(`https://api.stripe.com/v1/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${stripeKey()}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Stripe failed');return data;}
export function compareStripeSignature(raw,signature,secret){const timestamp=/\bt=(\d+)\b/.exec(signature||'')?.[1];if(!timestamp || Math.abs(Date.now()/1000-Number(timestamp))>300)return false;const content=`${timestamp}.${raw.toString('utf8')}`;const expected=crypto.createHmac('sha256',secret).update(content).digest('hex');const matches=[...(signature||'').matchAll(/\bv1=([0-9a-f]{64})\b/g)].map(match=>match[1]);return matches.some(value=>crypto.timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(expected,'hex')));}
