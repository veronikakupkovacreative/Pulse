// Cloud-only YouTube converter. No network work until the tab is selected.
export function initYoutubeTool(){
  const el=id=>document.getElementById(id);
  const base=(typeof PULSE_API_BASE_URL==='string'?PULSE_API_BASE_URL:'').replace(/\/+$/,'');
  const state={ready:false,busy:false,source:null,url:'',revision:0};
  const status=message=>el('yt-status').textContent=message;
  const error=message=>{el('yt-error').textContent=message;el('yt-error').hidden=false;};
  const clearError=()=>{el('yt-error').hidden=true;};
  const formats={
    wav24:'24-bit PCM for DAW editing. No quality is recovered from the YouTube source.',
    wav16:'16-bit PCM for DAW editing. No quality is recovered from the YouTube source.',
    mp3:'320 kbps MP3. Re-encoding an already lossy source.',
    m4a:'256 kbps AAC audio in M4A.',
    flac:'Lossless container, but source audio may already be lossy.',
    mp4:'Video and audio in a compatible MP4, up to 720p.',
    native:'Original audio stream without additional encoding.'
  };
  function update(){
    el('yt-check').disabled=state.busy;
    el('yt-download').disabled=state.busy||!state.ready||!state.source||!el('yt-permission').checked;
    el('yt-url').disabled=state.busy;
    el('yt-format').disabled=state.busy;
    el('yt-download').setAttribute('aria-busy',String(state.busy));
  }
  function reset(){
    state.source=null;state.url='';state.revision++;
    el('yt-source-info').hidden=true;el('yt-result').hidden=true;el('yt-save-link').hidden=true;
    update();
  }
  async function request(path,options={}){
    if(!base)throw Error('Cloud API is not configured. The operator must set PULSE_API_BASE_URL.');
    const response=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(240000),...options});
    let result;
    try{result=await response.json();}catch{throw Error('Invalid response from audio service.');}
    if(!response.ok)throw Error(result.error||result.detail||'Cloud conversion failed.');
    return result;
  }
  async function health(){
    try{
      const data=await request('/api/youtube/health',{signal:AbortSignal.timeout(12000)});
      state.ready=!!data.ready;
    }catch{state.ready=false;}
    update();return state.ready;
  }
  async function check(){
    if(state.busy)return;
    const url=el('yt-url').value.trim();
    reset();clearError();
    if(!/^(https:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/|youtu\.be\/)/i.test(url)){
      error('Paste a valid YouTube video URL.');return;
    }
    const revision=state.revision;
    state.busy=true;update();status('Checking video details…');
    try{
      if(!await health())throw Error('Cloud converter is offline. No file can be downloaded until the API is connected.');
      const data=await request('/api/youtube/info',{method:'POST',headers:{'Content-Type':'application/json','X-Pulse-Request':'1'},body:JSON.stringify({url})});
      if(revision!==state.revision)return;
      state.source=data.source;state.url=url;
      el('yt-title').textContent=data.source.title||'YouTube source';
      const m=Math.floor((data.source.duration||0)/60),s=Math.round((data.source.duration||0)%60);
      el('yt-source-details').textContent=m+':'+String(s).padStart(2,'0')+' · '+(data.source.codec||'audio')+' · '+(data.source.container||'source');
      el('yt-source-info').hidden=false;
      status('Source checked. Select an output format and download.');
    }catch(e){error(e.message);status('Source unavailable.');}
    finally{state.busy=false;update();}
  }
  async function download(){
    if(state.busy||!state.source||!state.ready||!el('yt-permission').checked)return;
    state.busy=true;update();clearError();
    el('yt-result').hidden=true;el('yt-save-link').hidden=true;
    status('Retrieving source and converting…');
    try{
      const data=await request('/api/youtube/download',{method:'POST',headers:{'Content-Type':'application/json','X-Pulse-Request':'1'},body:JSON.stringify({url:state.url,format:el('yt-format').value})});
      const link=el('yt-save-link');
      link.href=base+'/api/youtube/file/'+encodeURIComponent(data.id);
      link.download=data.filename;link.hidden=false;
      el('yt-result').textContent=data.filename+' · '+(data.bytes/1048576).toFixed(1)+' MB ready';
      el('yt-result').hidden=false;
      link.click();status('Ready. Use the download link if your browser blocked automatic download.');
    }catch(e){error(e.message);status('Download failed.');}
    finally{state.busy=false;update();}
  }
  el('yt-check').addEventListener('click',check);
  el('yt-download').addEventListener('click',download);
  el('yt-permission').addEventListener('change',update);
  el('yt-format').addEventListener('change',()=>{el('yt-format-note').textContent=formats[el('yt-format').value];el('yt-result').hidden=true;el('yt-save-link').hidden=true;});
  el('yt-url').addEventListener('input',()=>{reset();clearError();status('Analyze a YouTube URL to continue.');});
  el('yt-url').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();check();}});
  el('yt-format-note').textContent=formats.wav24;
  update();status(base?'Select EXPORT → YouTube Converter to get started.':'Cloud API is not configured. Downloading is unavailable.');
  // No background YouTube traffic: check availability only when the user activates the tab.
  el('tab-youtube').addEventListener('click',()=>{if(!state.ready&&!state.busy)health().then(ready=>{if(!ready)status('Cloud converter offline. Check the API configuration.');});});
}
