import {randomUUID} from 'node:crypto';
import {json,method,getUser,hasAccess,configured,serverError,stripeRequest,siteUrl} from './_pulse.js';
export default async function handler(req,res){if(!method(req,res,['POST']))return;if(!configured())return json(res,503,{error:'Platební služba není připravená.'});
 try{const user=await getUser(req,res);if(!user)return json(res,401,{error:'Nejprve se přihlas.'});if(await hasAccess(user.id))return json(res,409,{error:'Už máš aktivní přístup.'});
 const base=siteUrl();const order=randomUUID();
 const params=new URLSearchParams({mode:'payment',success_url:`${base}/?payment=success`,cancel_url:`${base}/?payment=cancel`,customer_email:user.email||'',client_reference_id:user.id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':'100','line_items[0][price_data][product_data][name]':'Pulse Studio Lifetime Access','metadata[pulse_order]':order,'metadata[user_id]':user.id,'payment_intent_data[metadata][user_id]':user.id,'payment_intent_data[metadata][pulse_order]':order});
 const checkout=await stripeRequest('checkout/sessions',params);
 return json(res,200,{url:checkout.url});
 }catch(error){return serverError(res,error);}}
