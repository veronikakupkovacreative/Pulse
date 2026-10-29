import {json,method,getUser,hasAccess,dbRequest,configured,serverError} from './_pulse.js';
export function validPromo(code){return typeof code==='string'&&code.trim().toUpperCase()==='FREEFOREVER';}
export default async function handler(req,res){if(!method(req,res,['POST']))return;if(!configured())return json(res,503,{error:'Přístupová služba není nakonfigurovaná.'});
 try{const user=await getUser(req,res);if(!user)return json(res,401,{error:'Nejprve se přihlas.'});
 if(!validPromo(req.body?.code))return json(res,400,{error:'Slevový kód není platný.'});
 if(await hasAccess(user.id))return json(res,200,{ok:true,access:true});
 // Only this exact code can grant promo entitlement. A database unique user_id prevents duplicate grants.
 await dbRequest('pulse_entitlements?on_conflict=user_id','POST',{user_id:user.id,source:'promo',stripe_payment_intent:null,revoked_at:null}, {Prefer:'resolution=merge-duplicates,return=minimal'});
 return json(res,200,{ok:true,access:await hasAccess(user.id)});
 }catch(error){return serverError(res,error);}}
