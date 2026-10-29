import {encodeWav,extractSegment,getAudioPeaks} from './studio-audio.mjs';

function createKeyWorker(){return new Worker(new URL('./key-worker.mjs',import.meta.url),{type:'module'});}

export function initStudioTools(getBpmTrack){
  const el=id=>document.getElementById(id);
  const tools={file:null,buffer:null,loading:false,operation:0,tab:'converter',context:null,source:null,playing:false,previewTimer:null,keyWorker:null,keyResult:null,from:0,to:8,peaks:[],bpm:120};
  const durationText=seconds=>{const s=Math.max(0,Number(seconds)||0),m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
  const precise=seconds=>`${durationText(seconds)}.${String(Math.floor((seconds%1)*100)).padStart(2,'0')}`;
  const filename=ext=>(tools.file?.name||'Pulse audio').replace(/\.[^.]+$/,'')+'.'+ext;
  const readableSize=bytes=>`${(bytes/(1024*1024)).toLocaleString('en-US',{maximumFractionDigits:1})} MB`;
  function status(id,text){el(id).textContent=text;}
  function error(message){el('tool-error').textContent=message;el('tool-error').hidden=false;}
  function clearError(){el('tool-error').hidden=true;}
  function setBusy(busy){tools.loading=busy;el('tool-select-file').disabled=busy;el('conv-export').disabled=busy||!tools.buffer;el('cut-export').disabled=busy||!tools.buffer;el('key-analyze').disabled=busy||!tools.buffer;el('tool-file-input').disabled=busy;}
  function updateButtons(){setBusy(tools.loading);el('tool-reuse-bpm').hidden=!getBpmTrack()?.buffer;}
  function syncOutput(){const mp3=el('conv-format').value==='mp3';el('conv-depth-box').hidden=mp3;el('conv-bitrate-box').hidden=!mp3;if(mp3&&el('conv-rate').value==='96000')el('conv-rate').value='48000';el('conv-rate').querySelector('option[value="96000"]').disabled=mp3;}
  function updateBpmFromAnalyzer(){const other=getBpmTrack();if(other?.bpm){tools.bpm=other.bpm;el('cut-bpm').value=other.bpm;}}
  function resetKey(){tools.keyResult=null;el('key-result').hidden=true;el('key-idle').hidden=false;el('key-alternatives').hidden=true;status('key-status','Key detection is an estimate.');}
  function stopPreview(){
    clearInterval(tools.previewTimer);tools.previewTimer=null;
    if(tools.source){tools.source.onended=null;try{tools.source.stop();}catch{}tools.source.disconnect();tools.source=null;}
    tools.playing=false;el('tool-preview').textContent='▶';el('tool-preview').setAttribute('aria-label','Play audio');
  }
  function remove(){tools.operation++;tools.keyWorker?.terminate();tools.keyWorker=null;stopPreview();tools.file=null;tools.buffer=null;tools.peaks=[];tools.from=0;tools.to=8;el('tool-file-input').value='';el('tool-loaded').hidden=true;el('tool-empty').hidden=false;resetKey();clearError();setBusy(false);updateButtons();}
  async function decode(file){
    clearError();
    if(tools.loading)return;
    if(!file)return;
    if(!/\.(wav|mp3|mp4|m4a|aac|ogg|flac|aiff|aif)$/i.test(file.name)){error('Unsupported file. Try WAV, MP3, M4A or MP4.');return;}
    if(file.size>100*1024*1024||file.size===0){error('File must be between 1 B and 100 MB.');return;}
    const token=++tools.operation;
    stopPreview();tools.keyWorker?.terminate();tools.keyWorker=null;
    setBusy(true);status('conv-status','Loading audio…');
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw new Error('Audio decoding is not supported in this browser.');
      tools.context||=new Ctx();
      const buffer=await tools.context.decodeAudioData(await file.arrayBuffer());
      if(token!==tools.operation)return;
      if(buffer.duration>1200)throw new Error('Maximum duration: 20 minutes.');
      tools.file=file;tools.buffer=buffer;tools.peaks=getAudioPeaks(buffer.getChannelData(0),270);tools.from=0;
      tools.to=Math.min(buffer.duration,8);updateBpmFromAnalyzer();
      el('tool-name').textContent=file.name;el('tool-name').title=file.name;
      status('tool-ext',file.name.split('.').pop().toUpperCase());
      status('tool-details',`${durationText(buffer.duration)} · ${readableSize(file.size)} · ${buffer.numberOfChannels} ch. · ${(buffer.sampleRate/1000).toFixed(1)} kHz`);
      el('tool-loaded').hidden=false;el('tool-empty').hidden=true;resetKey();updateTrimInputs();drawToolWave();
      status('conv-status','Ready to export.');status('cut-status','Set your loop length.');
      status('tool-time',`${durationText(0)} / ${durationText(buffer.duration)}`);
    }catch(e){if(token===tools.operation){error('Cannot decode audio: '+(e?.message||'unsupported codec')+'. Format support depends on your browser.');status('conv-status','Failed to load file.');}}
    finally{if(token===tools.operation){setBusy(false);updateButtons();}}
  }
  function channels(buffer){return Array.from({length:Math.min(buffer.numberOfChannels,2)},(_,i)=>buffer.getChannelData(i));}
  function download(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);}
  async function renderedChannels(targetSampleRate){
    const original=tools.buffer;
    if(original.sampleRate===targetSampleRate)return channels(original);
    const count=Math.ceil(original.duration*targetSampleRate),ch=Math.min(2,original.numberOfChannels);
    const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!Offline)throw new Error('Resampling is not supported in this browser.');
    const ctx=new Offline(ch,count,targetSampleRate),source=ctx.createBufferSource();source.buffer=original;source.connect(ctx.destination);source.start(0);
    const out=await ctx.startRendering();return channels(out);
  }
  let lamePromise;
  function loadLame(){
    if(window.lamejs?.Mp3Encoder)return Promise.resolve(window.lamejs);
    if(lamePromise)return lamePromise;
    lamePromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.all.min.js';script.async=true;
      script.onload=()=>window.lamejs?.Mp3Encoder?resolve(window.lamejs):reject(new Error('MP3 encoder unavailable.'));
      script.onerror=()=>reject(new Error('Cannot load MP3 encoder. Check connection or export WAV.'));
      document.head.appendChild(script);
    }).catch(e=>{lamePromise=null;throw e;});
    return lamePromise;
  }
  const int16=(float,offset,size)=>{const out=new Int16Array(size);for(let i=0;i<size;i++){const x=Math.max(-1,Math.min(1,float[offset+i]||0));out[i]=x<0?Math.round(32768*x):Math.round(32767*x);}return out;};
  async function toMp3(data,sampleRate,bitrate,token){
    const lame=await loadLame();if(token!==tools.operation)throw new Error('Operation canceled.');
    const encoder=new lame.Mp3Encoder(data.length,sampleRate,bitrate),parts=[],size=1152;
    for(let i=0;i<data[0].length;i+=size){
      if(token!==tools.operation)throw new Error('Operation canceled.');
      const len=Math.min(size,data[0].length-i),left=int16(data[0],i,len),right=data[1]&&int16(data[1],i,len);
      const chunk=right?encoder.encodeBuffer(left,right):encoder.encodeBuffer(left);
      if(chunk.length)parts.push(new Uint8Array(chunk));
      if((i/size)%90===0){status('conv-status',`Encoding MP3… ${Math.round(i/data[0].length*100)} %`);await new Promise(r=>setTimeout(r,0));}
    }
    const last=encoder.flush();if(last.length)parts.push(new Uint8Array(last));return new Blob(parts,{type:'audio/mpeg'});
  }
  async function exportConvert(){
    if(!tools.buffer||tools.loading)return;clearError();setBusy(true);
    const token=++tools.operation;
    try{
      const format=el('conv-format').value,rate=Number(el('conv-rate').value),bitDepth=Number(el('conv-depth').value),bitrate=Number(el('conv-bitrate').value);
      if(format==='mp3'&&!([44100,48000].includes(rate)))throw new Error('MP3 podporuje jen 44,1 nebo 48 kHz.');
      const approx=tools.buffer.duration*rate*Math.min(2,tools.buffer.numberOfChannels)*(bitDepth/8);
      if(format==='wav'&&approx>300*1024*1024)throw new Error('WAV would exceed 300 MB. Reduce sample rate or track length.');
      status('conv-status','Resampling audio…');
      const data=await renderedChannels(rate);
      if(token!==tools.operation)return;
      if(format==='wav'){status('conv-status','Encoding WAV…');const blob=encodeWav(data,rate,bitDepth);download(blob,filename('wav'));status('conv-status',`WAV ready (${readableSize(blob.size)}).`);}
      else{status('conv-status','Loading MP3 encoder…');const blob=await toMp3(data,rate,bitrate,token);download(blob,filename('mp3'));status('conv-status',`MP3 ready (${readableSize(blob.size)}).`);}
    }catch(e){if(token===tools.operation){error(e.message);status('conv-status','Export failed.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function selectTab(which){
    tools.tab=which;stopPreview();
    for(const name of ['converter','key','cutter']){
      const selected=which===name,tab=el('tab-'+name);
      tab.classList.toggle('selected',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;el('panel-'+name).hidden=!selected;
    }
    drawToolWave();
  }
  function updateTrimInputs(){
    if(!tools.buffer)return;
    const duration=tools.buffer.duration;
    for(const id of ['cut-start','cut-end'])el(id).max=duration.toFixed(3);
    el('cut-start').value=tools.from;el('cut-end').value=tools.to;
    status('cut-start-label',precise(tools.from));status('cut-end-label',precise(tools.to));
  }
  function setStart(value,manual=false){
    if(!tools.buffer)return;
    tools.from=Math.max(0,Math.min(Number(value)||0,tools.buffer.duration-.02));
    if(manual)el('cut-bars').value='custom';
    if(el('cut-bars').value!=='custom')setByBars();
    else tools.to=Math.max(tools.from+.02,tools.to);
    updateTrimInputs();drawToolWave();
  }
  function setEnd(value){
    if(!tools.buffer)return;el('cut-bars').value='custom';tools.to=Math.max(tools.from+.02,Math.min(tools.buffer.duration,Number(value)||0));updateTrimInputs();drawToolWave();
  }
  function setByBars(){
    if(!tools.buffer)return;
    const bars=Number(el('cut-bars').value),bpm=Number(el('cut-bpm').value);
    if(!bars||!Number.isFinite(bpm)||bpm<20||bpm>400)return;
    const duration=tools.buffer.duration,span=bars*4*60/bpm;
    tools.to=Math.min(duration,tools.from+span);
    if(tools.to-tools.from<.02)tools.from=Math.max(0,duration-span);
    updateTrimInputs();drawToolWave();
    status('cut-status',span>duration-tools.from+.001?'Track is shorter than selected bars.':'Loop length: '+precise(tools.to-tools.from));
  }
  function drawToolWave(){
    const canvas=el('tool-waveform');if(!canvas||!tools.buffer)return;
    const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=rect.width||canvas.width,h=rect.height||140;
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const bars=tools.peaks.length,bar=w/bars,duration=tools.buffer.duration;
    const a=tools.tab==='cutter'?tools.from/duration:0,b=tools.tab==='cutter'?tools.to/duration:1;
    ctx.fillStyle='#30302d';ctx.fillRect(0,0,w,h);
    if(tools.tab==='cutter'){ctx.fillStyle='#262622';ctx.fillRect(0,0,w*a,h);ctx.fillRect(w*b,0,w*(1-b),h);ctx.fillStyle='#44312d';ctx.fillRect(w*a,0,w*(b-a),h);}
    for(let i=0;i<bars;i++){
      const amp=Math.max(2,Math.pow(tools.peaks[i],.55)*h*.76),x=i*bar;
      ctx.fillStyle=(i/bars>=a&&i/bars<=b)?'#ff2b20':'#777771';
      ctx.fillRect(x,(h-amp)/2,Math.max(1,bar*.68),amp);
    }
    if(tools.tab==='cutter'){
      for(const x of [w*a,w*b]){ctx.fillStyle='#f5f4f0';ctx.fillRect(x-1,0,2,h);ctx.beginPath();ctx.arc(x,h/2,6,0,Math.PI*2);ctx.fill();}
    }
  }
  async function preview(){
    if(!tools.buffer||tools.loading)return;
    if(tools.playing){stopPreview();return;}
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;tools.context||=new Ctx();if(tools.context.state==='suspended')await tools.context.resume();
      const cut=tools.tab==='cutter',from=cut?tools.from:0,to=cut?tools.to:tools.buffer.duration;
      if(to-from<.02)return;
      const src=tools.context.createBufferSource();src.buffer=tools.buffer;
      const gain=tools.context.createGain();src.connect(gain).connect(tools.context.destination);
      if(cut){const fade=Math.min(Number(el('cut-fade').value)/1000,(to-from)/2);if(fade){const t=tools.context.currentTime;gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(1,t+fade);gain.gain.setValueAtTime(1,t+to-from-fade);gain.gain.linearRampToValueAtTime(.001,t+to-from);}}
      src.onended=()=>{if(tools.source===src){stopPreview();status('tool-time',`${durationText(0)} / ${durationText(to-from)}`);}};
      tools.source=src;tools.playing=true;src.start(0,from,to-from);
      const started=tools.context.currentTime;el('tool-preview').textContent='Ⅱ';el('tool-preview').setAttribute('aria-label','Zastavit zvuk');
      tools.previewTimer=setInterval(()=>status('tool-time',`${durationText(Math.min(to-from,tools.context.currentTime-started))} / ${durationText(to-from)}`),100);
    }catch(e){stopPreview();error('Playback failed: '+e.message);}
  }
  async function exportCut(){
    if(!tools.buffer||tools.loading)return;
    const token=++tools.operation;clearError();setBusy(true);stopPreview();
    try{
      if(tools.to-tools.from<.03)throw new Error('Loop must be at least 30 ms.');
      const data=extractSegment(channels(tools.buffer),tools.buffer.sampleRate,tools.from,tools.to,Number(el('cut-fade').value));
      const bitDepth=Number(el('cut-depth').value),bytes=data[0].length*data.length*(bitDepth/8);
      if(bytes>300*1024*1024)throw new Error('Loop too long. Shorten the selection.');
      status('cut-status','Rendering loop…');await new Promise(r=>setTimeout(r,0));
      if(token!==tools.operation)return;
      const wav=encodeWav(data,tools.buffer.sampleRate,bitDepth);
      const stem=(tools.file.name||'loop').replace(/\.[^.]+$/,'');
      download(wav,`${stem}_${Math.round(Number(el('cut-bpm').value))}bpm_loop.wav`);
      status('cut-status',`Loop exported (${precise(tools.to-tools.from)}, ${readableSize(wav.size)}).`);
    }catch(e){if(token===tools.operation){error(e.message);status('cut-status','Export failed.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function getKeyInput(buffer){
    const sr=buffer.sampleRate,step=Math.max(1,Math.round(sr/11025)),dstRate=sr/step;
    const input=buffer.getChannelData(0),segments=[];
    const duration=buffer.duration,chunk=Math.min(duration,10),positions=duration>18?[.08,.43,.78]:[0];
    for(const p of positions){const start=Math.max(0,Math.min(input.length-Math.floor(chunk*sr),Math.floor(duration*p*sr)));
      const count=Math.floor(chunk*dstRate),data=new Float32Array(count);for(let i=0;i<count;i++)data[i]=input[Math.min(input.length-1,start+i*step)];segments.push(data);
    }
    const merged=new Float32Array(segments.reduce((a,b)=>a+b.length,0));let off=0;for(const chunk of segments){merged.set(chunk,off);off+=chunk.length;}
    return {samples:merged,sampleRate:dstRate};
  }
  async function analyzeKey(){
    if(!tools.buffer||tools.loading)return;
    clearError();const token=++tools.operation;setBusy(true);status('key-status','Analyzuji harmonii…');
    try{
      const worker=createKeyWorker();tools.keyWorker=worker;
      const samples=getKeyInput(tools.buffer);
      const result=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Analysis timed out.'));},30000);
        worker.onmessage=({data})=>{clearTimeout(timeout);data.error?reject(new Error(data.error)):resolve(data.result);};
        worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Analysis failed to start.'));};
        worker.postMessage(samples,[samples.samples.buffer]);
      });
      worker.terminate();if(token!==tools.operation)return;
      tools.keyResult=result;el('key-result').hidden=false;el('key-idle').hidden=true;el('key-alternatives').hidden=false;
      status('key-name',result.primary.display);status('key-mode',result.primary.mode==='major'?'MAJOR':'MINOR');
      status('key-camelot',result.primary.camelot);
      status('key-confidence',({higher:'HIGH MATCH',moderate:'MODERATE',low:'LOW CONFIDENCE'})[result.confidence]);
      status('key-alternatives','Possible keys: '+result.alternatives.map(a=>`${a.display} (${a.camelot})`).join(' · '));
      status('key-status','Estimated key. Check by ear.');
    }catch(e){if(token===tools.operation){error(e.message);status('key-status','Key not detected.');}}
    finally{tools.keyWorker?.terminate();tools.keyWorker=null;if(token===tools.operation)setBusy(false);}
  }
  // Events
  document.querySelectorAll('[data-tool-nav]').forEach(link=>{link.addEventListener('click',()=>selectTab(link.dataset.toolNav));});
  document.querySelectorAll('[data-tool]').forEach(button=>{
    button.addEventListener('click',()=>selectTab(button.dataset.tool));
    button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=['converter','key','cutter'];const next=tabs[(tabs.indexOf(tools.tab)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];selectTab(next);el('tab-'+next).focus();});
  });
  el('tool-select-file').onclick=el('tool-change').onclick=()=>el('tool-file-input').click();
  el('tool-file-input').onchange=e=>decode(e.target.files[0]);
  el('tool-remove').onclick=remove;
  el('tool-preview').onclick=preview;
  el('tool-reuse-bpm').onclick=()=>{const x=getBpmTrack();if(x?.buffer&&x?.file){tools.file=x.file;tools.buffer=x.buffer;tools.peaks=getAudioPeaks(x.buffer.getChannelData(0),270);tools.from=0;tools.to=Math.min(8,x.buffer.duration);el('tool-name').textContent=x.file.name;el('tool-name').title=x.file.name;status('tool-ext',x.file.name.split('.').pop().toUpperCase());status('tool-details',`${durationText(x.buffer.duration)} · ${readableSize(x.file.size)} · ${x.buffer.numberOfChannels} ch. · ${(x.buffer.sampleRate/1000).toFixed(1)} kHz`);el('tool-loaded').hidden=false;el('tool-empty').hidden=true;updateBpmFromAnalyzer();resetKey();updateTrimInputs();drawToolWave();status('conv-status','Loaded from BPM Analyzer.');updateButtons();}};
  el('conv-format').onchange=syncOutput;
  el('conv-export').onclick=exportConvert;
  el('key-analyze').onclick=analyzeKey;
  el('cut-bpm').oninput=()=>{tools.bpm=Number(el('cut-bpm').value);if(el('cut-bars').value!=='custom')setByBars();};
  el('cut-bars').onchange=()=>{if(el('cut-bars').value!=='custom')setByBars();};
  el('cut-start').oninput=e=>setStart(e.target.value,true);
  el('cut-end').oninput=e=>setEnd(e.target.value);
  el('cut-export').onclick=exportCut;
  el('tool-waveform').addEventListener('pointerdown',event=>{
    if(tools.tab!=='cutter'||!tools.buffer)return;
    const rect=el('tool-waveform').getBoundingClientRect(),time=Math.min(tools.buffer.duration,Math.max(0,(event.clientX-rect.left)/rect.width*tools.buffer.duration));
    if(Math.abs(time-tools.from)<Math.abs(time-tools.to))setStart(time,true);else setEnd(time);
  });
  const drop=el('tool-drop-zone');
  drop.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!tools.loading)drop.classList.add('tool-dragover');}});
  drop.addEventListener('dragleave',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('tool-dragover');});
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('tool-dragover');if(e.dataTransfer.files.length!==1){error('Upload one file at a time.');return;}decode(e.dataTransfer.files[0]);});
  window.addEventListener('pulse:bpm-track-ready',updateButtons);
  const resize=new ResizeObserver(()=>drawToolWave());resize.observe(el('tool-waveform'));
  window.addEventListener('pagehide',()=>{stopPreview();tools.keyWorker?.terminate();tools.context?.close();});
  syncOutput();updateButtons();
  return {reset:remove};
}
