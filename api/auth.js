import {json,method,sbAuth,saveSession,clearSession,getUser,hasAccess,configured,serverError} from './_pulse.js';
const isEmail=x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<255;
export default async function handler(req,res){
  if(!method(req,res,['GET','POST']))return;
  if(!configured())return json(res,503,{error:'Přihlašování zatím není nakonfigurované.'});
  try{
    if(req.method==='GET'){const user=await getUser(req,res);const paid=user?await hasAccess(user.id):false;return json(res,200,{authenticated:Boolean(user),access:paid,email:user?.email||null});}
    const action=req.body?.action;
    if(action==='logout'){clearSession(res);return json(res,200,{ok:true});}
    const email=String(req.body?.email||'').trim().toLowerCase();
    if(!isEmail(email))return json(res,400,{error:'Zadej platný e-mail.'});
    if(action==='send'){
      const response=await sbAuth('otp',{email,create_user:true});
      if(!response.ok)return json(res,429,{error:'Ověřovací e-mail se nepodařilo odeslat. Zkus to později.'});
      return json(res,200,{ok:true,message:'Zkontroluj e-mail a zadej šestimístný kód.'});
    }
    if(action==='verify'){
      const token=String(req.body?.token||'').replace(/\s/g,'');
      if(!/^\d{6,8}$/.test(token))return json(res,400,{error:'Ověřovací kód musí mít 6 až 8 číslic.'});
      const verified=await sbAuth('verify',{email,token,type:'email'});
      if(!verified.ok || !verified.data?.access_token)return json(res,401,{error:'Kód není platný nebo jeho platnost vypršela.'});
      saveSession(res,verified.data);const access=await hasAccess(verified.data.user.id);
      return json(res,200,{ok:true,access});
    }
    return json(res,400,{error:'Neznámá akce.'});
  }catch(error){return serverError(res,error);}
}
