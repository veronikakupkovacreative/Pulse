import {json,method,dbRequest,compareStripeSignature,serverError} from './_pulse.js';
export const config={api:{bodyParser:false}};
async function rawBody(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks);}
export default async function handler(req,res){if(!method(req,res,['POST']))return;
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret)return json(res,503,{error:'Webhook not configured'});
 try{const raw=await rawBody(req);if(raw.byteLength>1024*1024)return json(res,413,{error:'Payload too large'});
 if(!compareStripeSignature(raw,req.headers['stripe-signature'],secret))return json(res,400,{error:'Bad signature'});
 const event=JSON.parse(raw.toString('utf8'));const object=event?.data?.object;
 const accepted=['checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded','charge.dispute.created'];
 if(!accepted.includes(event?.type))return json(res,200,{received:true,ignored:true});
 if(!event.id||!object?.id)return json(res,400,{error:'Invalid event'});
 if(event.type==='charge.refunded'&&object.amount_refunded<object.amount)return json(res,200,{received:true,ignored:true});
 const paymentIntent=event.type.startsWith('checkout.')?object.payment_intent:(typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id);
 const userId=event.type.startsWith('checkout.')?object.client_reference_id:object.metadata?.user_id;
 if(!paymentIntent || (event.type.startsWith('checkout.')&&!userId))return json(res,200,{received:true,ignored:true});
 const isPaid=event.type.startsWith('checkout.');
 if(isPaid&&(object.payment_status!=='paid'||object.currency!=='usd'||object.amount_total!==100||object.mode!=='payment'))return json(res,200,{received:true,ignored:true});
 await dbRequest('rpc/apply_pulse_stripe_event','POST',{p_event_id:event.id,p_event_type:event.type,p_user_id:userId||null,p_payment_intent:paymentIntent});
 return json(res,200,{received:true});
 }catch(error){return serverError(res,error);}}
