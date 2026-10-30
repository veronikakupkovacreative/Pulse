// YouTube audio download UI. Network requests go to the hosted Pulse API.
export function initYoutubeTool(){
  const el=id=>document.getElementById(id);
  const state={ready:false,busy:false,source:null,url:''};
  const apiBase=PULSE_API_BASE_URL.replace(/\/+$/, '');
  const apiUrl=path=>apiBase+path;
  const status=message=>{el('yt-status').textContent=message;};
  const showError=message=>{el('yt-error').textContent=message;el('yt-error').hidden=false;};
  const clearError=()=>{el('yt-error').textContent='';el('yt-error').hidden=true;};
  const fmtSeconds=s=>`${Math.floor((s||0)/60)}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;
  let debounce;

  function update(){
    el('yt-check').disabled=state.busy;
    el('yt-download').disabled=state.busy||!state.ready||!state.source;
    el('yt-url').disabled=state.busy;
    el('yt-format').disabled=state.busy;
    el('yt-download').setAttribute('aria-busy',String(state.busy));
    el('yt-check').querySelector('span').textContent=state.busy?'…':'↗';
  }
  function resetSource(){
    state.source=null;
    state.url='';
    el('yt-source-info').hidden=true;
    el('yt-result').hidden=true;
    el('yt-save-link').hidden=true;
    update();
  }
  function updateFormat(){
    const format=el('yt-format').value;
    const message={
      wav24:'WAV 24-bit PCM — for DAW use. Decoding does not restore details lost from the original streaming audio.',
      wav16:'WAV 16-bit PCM — smaller uncompressed editing file.',
      native:'Original source stream, typically Opus or AAC, where legally available.',
      mp3:'MP3 320 kbps — compatible but adds another lossy encoding step.'
    };
    const button={wav24:'Download WAV 24-bit',wav16:'Download WAV 16-bit',native:'Download original audio',mp3:'Download MP3'};
    el('yt-format-note').textContent=message[format];
    el('yt-download').replaceChildren(document.createTextNode(button[format]+' '),(()=>{const span=document.createElement('span');span.setAttribute('aria-hidden','true');span.textContent='↗';return span;})());
    el('yt-result').hidden=true;
    el('yt-save-link').hidden=true;
  }
  async function checkServer(){
    try{
      if(!apiBase)throw new Error('Service is not configured.');
      const response=await fetch(apiUrl('/api/youtube/health'),{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Server unavailable');
      const data=await response.json();
      state.ready=Boolean(data.ready);
      if(state.ready){
        el('yt-helper').textContent='CLOUD READY';
        el('yt-helper').classList.add('is-ready');
        el('yt-help').textContent='Service ready. Paste a video link and choose a format.';
      }else{
        el('yt-helper').textContent='SERVICE UNAVAILABLE';
        el('yt-helper').classList.remove('is-ready');
        el('yt-help').textContent='Service temporarily unavailable. Try again later.';
      }
    }catch{
      state.ready=false;
      el('yt-helper').textContent='CLOUD OFFLINE';
      el('yt-helper').classList.remove('is-ready');
      el('yt-help').textContent='Online download is unavailable. Cloud processing has not been enabled.';
    }
    update();
    return state.ready;
  }
  async function api(endpoint,payload){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),180000);
    let response;
    try{
      response=await fetch(apiUrl('/api/youtube/'+endpoint),{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Pulse-Request':'1'},
        body:JSON.stringify(payload),signal:controller.signal
      });
    }catch(error){
      throw new Error(error.name==='AbortError'?'Processing timed out. Try a shorter video.':'Online audio service is unavailable. Try again later.');
    }finally{clearTimeout(timer);}
    let data;
    try{data=await response.json();}
    catch{throw new Error('Server returned an invalid response.');}
    if(!response.ok)throw new Error(data.error||'YouTube audio is unavailable.');
    return data;
  }
  async function check(){
    if(state.busy)return;
    clearTimeout(debounce);
    clearError();
    resetSource();
    const url=el('yt-url').value.trim();
    if(!url){showError('Paste a YouTube video link.');return;}
    state.busy=true;
    update();
    status('Checking available audio formats…');
    try{
      if(!(await checkServer()))throw new Error('Online YouTube download is temporarily unavailable.');
      const {source}=await api('info',{url});
      state.source=source;
      state.url=url;
      el('yt-title').textContent=source.title;
      el('yt-codec').textContent=(source.codec||'unknown').toUpperCase();
      el('yt-bitrate').textContent=source.bitrate?`~${source.bitrate} kb/s`:'Unknown';
      el('yt-rate').textContent=source.sampleRate?`${(source.sampleRate/1000).toLocaleString('en-US')} kHz`:'Unknown';
      el('yt-length').textContent=fmtSeconds(source.duration);
      el('yt-container').textContent=source.container||'—';
      el('yt-source-info').hidden=false;
      status('Source verified. Choose a format and select Download.');
    }catch(error){showError(error.message);status('Failed to load video.');}
    finally{state.busy=false;update();}
  }
  async function download(){
    if(state.busy||!state.source||!state.ready)return;
    state.busy=true;
    update();
    clearError();
    el('yt-result').hidden=true;
    el('yt-save-link').hidden=true;
    status('Preparing audio file…');
    try{
      const data=await api('download',{url:state.url,format:el('yt-format').value});
      const save=el('yt-save-link');
      save.href=apiUrl('/api/youtube/file/'+encodeURIComponent(data.id));
      save.download=data.filename;
      save.hidden=false;
      const size=(data.bytes/1048576).toLocaleString('en-US',{maximumFractionDigits:1});
      el('yt-result').textContent=`${data.filename} · ${size} MB · ready`;
      el('yt-result').hidden=false;
      // Fallback link remains visible if the browser prevents an automatic download.
      save.click();
      status('Complete. If download did not start, use the link below.');
    }catch(error){showError(error.message);status('Download failed.');}
    finally{state.busy=false;update();}
  }
  el('yt-url').addEventListener('input',()=>{
    clearTimeout(debounce);
    resetSource();
    clearError();
    status('Paste a link to load the source.');
    const input=el('yt-url').value.trim();
    if(/^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)(?:[/?#]|$)/i.test(input))debounce=setTimeout(check,850);
  });
  el('yt-url').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();check();}});
  el('yt-check').addEventListener('click',check);
  el('yt-download').addEventListener('click',download);
  el('yt-format').addEventListener('change',updateFormat);
  updateFormat();
  checkServer();
}
