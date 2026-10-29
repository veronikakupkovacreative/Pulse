import {method,json,getUser,hasAccess,configured,studioHtml,serverError} from './_pulse.js';
export default async function handler(req,res){if(!method(req,res,['GET']))return;if(!configured())return json(res,503,{error:'Studio access not configured'});
 try{const user=await getUser(req,res);if(!user || !(await hasAccess(user.id))){res.statusCode=302;res.setHeader('Location','/');res.setHeader('Cache-Control','no-store');return res.end();}
 const html=await studioHtml();res.statusCode=200;res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');return res.end(html);
 }catch(error){return serverError(res,error);}}
