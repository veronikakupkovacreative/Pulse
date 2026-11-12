/** Front-end control plane for an owner-authorized external YouTube worker.
 * Access code stays in memory; YouTube file bytes never transit through Vercel.
 */
const ENDPOINT='/api/pulse-youtube';
const readResponse=async response=>{
 const data=await response.json().catch(()=>({error:'Unexpected response from downloader.'}));
 if(!response.ok)throw Error(data.error||'Downloader returned HTTP '+response.status);
 return data;
};
export async function youtubeCapabilities({fetchImpl=globalThis.fetch,signal}={}){
 const response=await fetchImpl(ENDPOINT,{method:'GET',cache:'no-store',signal});
 return readResponse(response);
}
export async function youtubeJobRequest(owner,body,{fetchImpl=globalThis.fetch,signal}={}){
 if(typeof owner!=='string'||owner.length<1)throw Error('Enter the downloader access code.');
 const response=await fetchImpl(ENDPOINT,{
  method:'POST',headers:{'Content-Type':'application/json','x-pulse-owner':owner},
  body:JSON.stringify(body),signal,cache:'no-store'
 });
 return readResponse(response);
}
const defaultSleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Error('Operation cancelled.'));
 const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
 const abort=()=>{finish();reject(Error('Operation cancelled.'));};
 const timer=setTimeout(()=>{finish();resolve();},ms);
 signal?.addEventListener('abort',abort,{once:true});
});
export async function waitForYoutubeJob(id,owner,{
 signal,onProgress=()=>{},fetchImpl=globalThis.fetch,
 pause=defaultSleep,polls=240
}={}){
 if(!/^[0-9a-f-]{36}$/i.test(String(id)))throw Error('Invalid download job ID.');
 for(let attempt=0;attempt<polls;attempt++){
  if(signal?.aborted)throw Error('Operation cancelled.');
  const state=await youtubeJobRequest(owner,{action:'status',id},{fetchImpl,signal});
  onProgress(state);
  if(state.status==='ready'){
   if(typeof state.downloadUrl!=='string')throw Error('Worker did not provide a download URL.');
   const url=new URL(state.downloadUrl);
   if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')
    throw Error('Unsafe download URL returned by worker.');
   if(!url.pathname.endsWith('/download')||!url.searchParams.has('ticket'))
    throw Error('Unexpected worker download URL.');
   return state;
  }
  if(['failed','cancelled'].includes(state.status))
   throw Error(state.error||'Download '+state.status+'.');
  await pause(2000,signal);
 }
 throw Error('Download is taking too long. Try again later.');
}
