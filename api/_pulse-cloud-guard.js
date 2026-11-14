/** Public MusicGPT access gate. Provider credentials never leave Vercel.
 * Billable requests MUST use ?charge=1 so the Vercel Firewall IP rate limit
 * applies before the function runs. Do not remove that invariant.
 */
export const cloudConfigured=providerKey=>Boolean(providerKey&&process.env.PULSE_PUBLIC_CLOUD_ENABLED==='true');
export function checkCloudOrigin(req){
 const host=req.headers?.host,origin=req.headers?.origin;
 if(typeof host!=='string'||typeof origin!=='string'||!host||!origin)return 'CROSS_ORIGIN_BLOCKED';
 try{
  const url=new URL(origin);
  const local=/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host);
  if(url.host===host&&(url.protocol==='https:'||(local&&url.protocol==='http:')))return null;
 }catch{}
 return 'CROSS_ORIGIN_BLOCKED';
}
export function checkBillableRoute(req){
 try{
  const url=new URL(req.url||'/', 'https://pulse.invalid');
  if(url.search==='?charge=1')return null;
 }catch{}
 return 'CREDIT_PROTECTION_REQUIRED';
}
