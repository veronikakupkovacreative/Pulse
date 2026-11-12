/** YouTube download panel for PULSE Video to Audio.
 * Works only with a separately deployed, owner-authorized yt-dlp worker.
 * The access code stays inside this panel; there is no localStorage persistence.
 */
import {youtubeCapabilities,youtubeJobRequest,waitForYoutubeJob} from './youtube-client.mjs';

export function mountYouTubeControls({host,parseYouTubeLink}){
 const note=host.querySelector('.pulse-video-note');
 if(!note)throw Error('The YouTube preview panel was not found.');
 const section=document.createElement('div');
 section.className='pulse-yt-controls';
 section.innerHTML=
 '<div class="pulse-yt-divider"><span>YOUTUBE → FILE</span><span>MP3 / WAV / MP4</span></div>'+
 '<div class="pulse-yt-formats" role="group" aria-label="YouTube output format">'+
 '<button type="button" data-yt-format="mp3" aria-pressed="true">MP3</button>'+
 '<button type="button" data-yt-format="wav" aria-pressed="false">WAV</button>'+
 '<button type="button" data-yt-format="mp4" aria-pressed="false">MP4</button></div>'+
 '<label class="pulse-video-setting" data-yt-bitrate-field>MP3 BITRATE'+
 '<select data-yt-bitrate><option value="128">128 kbps</option>'+
 '<option value="192" selected>192 kbps</option>'+
 '<option value="256">256 kbps</option><option value="320">320 kbps</option></select></label>'+
 '<label class="pulse-video-setting">DOWNLOADER ACCESS CODE'+
 '<input type="password" autocomplete="off" spellcheck="false" placeholder="Owner access code" data-yt-access></label>'+
 '<label class="pulse-video-rights"><input type="checkbox" data-yt-rights> I own this video or have authorization to download and convert it, consistent with applicable platform rules.</label>'+
 '<div class="pulse-yt-actions">'+
 '<button type="button" data-yt-start disabled>DOWNLOAD FROM YOUTUBE ↗</button>'+
 '<button type="button" data-yt-cancel disabled>CANCEL</button></div>'+
 '<div class="pulse-video-progress" role="progressbar" aria-label="YouTube download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-yt-progress><i></i></div>'+
 '<p class="pulse-video-status" data-yt-status role="status" aria-live="polite">Checking downloader availability…</p>'+
 '<a class="pulse-yt-result" data-yt-result hidden rel="noopener noreferrer" target="_blank">DOWNLOAD RESULT ↗</a>'+
 '<p class="pulse-video-note">Owner-authorized beta · Single videos up to 10 minutes, 100 MB original, 150 MB output. Downloads may be unavailable due to the video’s restrictions or platform rules. No DRM/account bypass.</p>';
 note.parentNode.insertBefore(section,note);
 const $=selector=>section.querySelector(selector);
 let disposed=false,busy=false,configured=false,format='mp3',controller=null,
  jobId=null,ownerCode='',finished=false;
 const start=$('[data-yt-start]'),cancel=$('[data-yt-cancel]'),
  code=$('[data-yt-access]'),rights=$('[data-yt-rights]'),
  video=host.querySelector('[data-video-url]'),progress=$('[data-yt-progress]'),
  download=$('[data-yt-result]');
 const status=(message,error=false)=>{
  if(disposed)return;
  const e=$('[data-yt-status]');e.textContent=String(message);e.dataset.error=String(error);
 };
 const update=()=>{
  if(disposed)return;
  start.disabled=busy||!configured||!rights.checked||!code.value.trim()||!video.value.trim();
  cancel.disabled=!busy;
  code.disabled=busy;rights.disabled=busy;
  for(const el of section.querySelectorAll('[data-yt-format],[data-yt-bitrate]'))el.disabled=busy;
  $('[data-yt-bitrate-field]').hidden=format!=='mp3';
  for(const btn of section.querySelectorAll('[data-yt-format]'))
   btn.setAttribute('aria-pressed',String(btn.dataset.ytFormat===format));
 };
 const setPercent=(p)=>{
  const value=Math.min(100,Math.max(0,Number(p)||0));
  progress.setAttribute('aria-valuenow',String(value));
  progress.querySelector('i').style.width=value+'%';
 };
 for(const button of section.querySelectorAll('[data-yt-format]')){
  button.onclick=()=>{if(busy)return;format=button.dataset.ytFormat;update();};
 }
 code.addEventListener('input',update);
 video.addEventListener('input',update);
 rights.addEventListener('change',update);
 const showProgress=state=>{
  if(disposed)return;
  setPercent(state.percent);
  const labels={queued:'Waiting for a free worker…',checking:'Checking video and permissions…',
   downloading:'Downloading video…',encoding:'Converting with FFmpeg…',
   ready:'Download ready.',failed:'Download failed.',cancelled:'Download cancelled.'};
  status((labels[state.status]||'Processing…')+' '+Math.round(state.percent||0)+'%'+
   (state.title?' · '+state.title:''));
 };
 const refresh=async()=>{
  try{
   const cfg=await youtubeCapabilities();
   if(disposed)return;
   configured=cfg.configured===true;
   status(configured?'Downloader available. Enter access code and choose a format.':
    'Downloader is not configured yet. Deploy the yt-dlp worker and set PULSE_YT_* environment variables.');
  }catch{
   if(!disposed)status('Downloader status is unavailable. Try again later.',true);
  }finally{update();}
 };
 start.onclick=async()=>{
  if(busy||disposed)return;
  const access=code.value.trim();
  try{
   if(!configured)throw Error('Download worker is not configured.');
   if(!rights.checked)throw Error('Confirm permission to download this video.');
   const parsed=parseYouTubeLink(video.value.trim());
   busy=true;update();jobId=null;finished=false;ownerCode=access;download.hidden=true;download.removeAttribute('href');
   setPercent(0);status('Submitting YouTube download…');
   const active=new AbortController();controller=active;
   const created=await youtubeJobRequest(access,{
    action:'create',url:parsed.watchUrl,format,
    bitrate:Number($('[data-yt-bitrate]').value),rightsConfirmed:true
   },{signal:active.signal});
   if(disposed||active.signal.aborted)return;
   if(!created.id)throw Error('Worker did not create a job.');
   jobId=created.id;showProgress(created);
   const done=await waitForYoutubeJob(created.id,access,{
    signal:active.signal,onProgress:showProgress
   });
   if(disposed||active.signal.aborted)return;
   download.href=done.downloadUrl;
   download.textContent='DOWNLOAD '+format.toUpperCase()+
    (done.bytes?' · '+(done.bytes/1048576).toFixed(1)+' MB':'')+' ↗';
   download.hidden=false;finished=true;
   setPercent(100);
   status('Your '+format.toUpperCase()+' is ready. The download link expires after about 15 minutes.');
  }catch(error){
   if(!disposed)status(error.message||'YouTube download failed.',true);
  }finally{if(!disposed){busy=false;update();}controller=null;}
 };
 cancel.onclick=async()=>{
  if(!busy)return;
  controller?.abort();
  const id=jobId,access=ownerCode;
  jobId=null;busy=false;update();
  status('Download cancellation requested.');
  if(id)try{await youtubeJobRequest(access,{action:'cancel',id});}
  catch{if(!disposed)status('Local request cancelled. The worker may finish its current step.');}
 };
 void refresh();
 update();
 return()=>{
  disposed=true;
  controller?.abort();
  if(jobId&&ownerCode&&!finished)void youtubeJobRequest(ownerCode,{action:'cancel',id:jobId}).catch(()=>{});
  section.remove();
 };
}
