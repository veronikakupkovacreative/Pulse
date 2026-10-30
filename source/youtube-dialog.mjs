// Cloud YouTube audio client. The tool stays unavailable when no backend is configured.
function initYoutubeAudio(){
  const el=id=>document.getElementById(id),dialog=el('youtube-dialog'),status=el('youtube-status');
  const btn=el('tab-youtube'),form=el('youtube-form'),submit=el('youtube-submit');
  const api=String(PULSE_API_BASE_URL||'').replace(/\/$/,'');
  let available=false,checking=null;
  const say=message=>{status.textContent=message;};
  const urlAllowed=value=>{
    try{
      const parsed=new URL(value);
      return parsed.protocol==='https:'&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','music.youtube.com'].includes(parsed.hostname);
    }catch{return false;}
  };
  async function check(){
    if(!api){available=false;say('YouTube requires a configured HTTPS audio backend (PULSE_API_BASE_URL). Local audio import remains available.');return;}
    if(checking)return checking;
    checking=(async()=>{
      try{
        const res=await fetch(api+'/api/youtube/health',{signal:AbortSignal.timeout(9000)});
        if(!res.ok)throw Error('Backend returned '+res.status);
        const info=await res.json();available=info.ready===true;
        say(available?'Converter online. Use only audio you have rights to download.':'Converter not ready: '+(info.missing||[]).join(', '));
      }catch(err){available=false;say('Cloud converter unavailable: '+err.message+'. Check API URL, Railway status and allowed origins.');}
    })();
    await checking;checking=null;
  }
  el('youtube-recheck').onclick=()=>void check();
  btn.onclick=()=>{dialog.showModal();void check();};
  el('youtube-close').onclick=()=>dialog.close();
  form.onsubmit=async event=>{
    event.preventDefault();
    const link=el('youtube-url').value.trim();
    if(!urlAllowed(link)){say('Enter a valid HTTPS YouTube video URL.');return;}
    if(!el('youtube-authorized').checked){say('Confirm you are authorized to download the audio.');return;}
    if(!available){await check();if(!available)return;}
    submit.disabled=true;el('youtube-download').hidden=true;say('Preparing audio on the cloud converter…');
    try{
      const res=await fetch(api+'/api/youtube/download',{method:'POST',headers:{'Content-Type':'application/json','X-Pulse-Request':'1'},body:JSON.stringify({url:link,format:el('youtube-format').value}),signal:AbortSignal.timeout(180000)});
      const result=await res.json().catch(()=>{throw Error('Cloud backend returned an invalid response.');});
      if(!res.ok){const detail=result.detail||result.error;throw Error(typeof detail==='string'?detail:'Converter returned '+res.status);}
      if(!/^[a-zA-Z0-9_-]{8,128}$/.test(result.id||''))throw Error('Invalid download token received.');
      const href=api+'/api/youtube/file/'+encodeURIComponent(result.id);
      el('youtube-download-link').href=href;
      el('youtube-file-info').textContent=(result.filename||'Audio')+' · '+(result.bytes?Math.round(result.bytes/1048576*10)/10+' MB':'Ready');
      el('youtube-download').hidden=false;say('Audio prepared. Select Download file.');
    }catch(err){say('Conversion failed: '+(err.name==='TimeoutError'?'Cloud processing timed out. Try a shorter source.':err.message));}
    finally{submit.disabled=false;}
  };
}
