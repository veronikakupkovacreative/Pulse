import {encodeWav,extractSegment,getAudioPeaks} from './studio-audio.mjs';
import {reverseAudio,bpmDurations,detectSilenceBounds,trimAudio,normalizeAudio} from './dsp/quick-tools.mjs';
import {createAudioWorkspace} from './core/audio-workspace.mjs';
import {createStoredZip} from './dsp/zip-store.mjs';
import {sliceAudio} from './dsp/production-tools.mjs';

function createProductionWorker(){return new Worker(new URL('./production-worker.mjs',import.meta.url),{type:'module'});}
function createKeyWorker(){return new Worker(new URL('./key-worker.mjs',import.meta.url),{type:'module'});}

export function initStudioTools(getBpmTrack){
  const el=id=>document.getElementById(id);
  const workspace=createAudioWorkspace({maxUndo:4});
  const tools={bpmEdited:false,productionCandidate:null,productionWorker:null,bpmWorker:null,markers:[],selectedSlice:0,dragMarker:-1,quickCandidate:null,quickBounds:null,file:null,buffer:null,loading:false,operation:0,tab:'converter',context:null,source:null,playing:false,previewTimer:null,keyWorker:null,keyResult:null,from:0,to:8,peaks:[],bpm:120};
  const durationText=seconds=>{const s=Math.max(0,Number(seconds)||0),m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
  const precise=seconds=>`${durationText(seconds)}.${String(Math.floor((seconds%1)*100)).padStart(2,'0')}`;
  const filename=ext=>(tools.file?.name||'Pulse audio').replace(/\.[^.]+$/,'')+'.'+ext;
  const readableSize=bytes=>`${(bytes/(1024*1024)).toLocaleString('cs-CZ',{maximumFractionDigits:1})} MB`;
  function workingChanged(){
    stopPreview();tools.productionWorker?.terminate();tools.productionWorker=null;tools.productionCandidate=null;tools.markers=[];tools.selectedSlice=0;tools.quickCandidate=null;tools.quickBounds=null;
    const snapshot=workspace.snapshot();tools.file=snapshot.file;tools.buffer=snapshot.working;
    el('workspace-undo').disabled=!snapshot.canUndo;el('workspace-redo').disabled=!snapshot.canRedo;el('workspace-original').disabled=!snapshot.hasChanges;
    status('workspace-state',snapshot.hasChanges?'WORKING AUDIO':'ORIGINAL');
    if(!tools.buffer){el('tool-loaded').hidden=true;el('tool-empty').hidden=false;return;}
    const buffer=tools.buffer;
    tools.peaks=getAudioPeaks(buffer.getChannelData(0),270);
    tools.from=0;tools.to=Math.min(buffer.duration,8);
    el('tool-name').textContent=tools.file?.name||'Audio';
    status('tool-details',`${durationText(buffer.duration)} · ${buffer.numberOfChannels} kan. · ${(buffer.sampleRate/1000).toFixed(1)} kHz`);
    el('tool-loaded').hidden=false;el('tool-empty').hidden=true;
    updateTrimInputs();drawToolWave();resetKey();updateButtons();
  }
  function asAudioBuffer(data,rate){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw new Error('Web Audio API není dostupné.');
    tools.context||=new Ctx();
    const buffer=tools.context.createBuffer(data.length,data[0].length,rate);
    data.forEach((channel,i)=>buffer.copyToChannel(channel,i));
    return buffer;
  }
  function clearQuick(){tools.quickCandidate=null;tools.quickBounds=null;drawToolWave();}
  async function prepareQuick(kind){
    if(!tools.buffer)throw new Error('Nejdřív nahraj audio soubor.');
    const buffer=tools.buffer,rate=buffer.sampleRate,source=channels(buffer);
    let result;
    if(kind==='reverse'){
      result=reverseAudio(source,rate);status('reverse-status','Kanály budou přehrány od konce. Délka a sample rate se nemění.');
    }else if(kind==='trim'){
      const threshold=Number(el('trim-threshold').value),padding=Number(el('trim-padding').value);
      const bounds=detectSilenceBounds(source,rate,threshold,padding);
      tools.quickBounds=bounds;
      result=trimAudio(source,bounds);
      status('trim-status',`Odstraněno ${bounds.removedSeconds.toFixed(3)} s ticha · nový úsek ${bounds.startSeconds.toFixed(3)}–${bounds.endSeconds.toFixed(3)} s.`);
    }else if(kind==='normalizer'){
      const options={mode:el('norm-mode').value,targetPeak:Number(el('norm-peak').value),targetLufs:Number(el('norm-lufs').value),ceiling:Number(el('norm-ceiling').value)};
      const normalization=normalizeAudio(source,rate,options);
      result=normalization.channels;
      status('norm-status',`Gain ${normalization.gainDb.toFixed(2)} dB · Peak ${normalization.outputPeakDb.toFixed(2)} dBFS${normalization.outputLufs===null?'':` · LUFS ${normalization.outputLufs.toFixed(2)}`}${normalization.limited?' · Cíl omezen peak ceilingem.':''}`);
    }else throw new Error('Neznámý nástroj.');
    if(result[0].length*result.length*3>300*1024*1024)throw new Error('Výstup je příliš velký. Zkus kratší soubor.');
    tools.quickCandidate={kind,buffer:asAudioBuffer(result,rate)};
    drawToolWave();
    return tools.quickCandidate.buffer;
  }
  async function quickAction(kind,action){
    if(tools.loading||!tools.buffer){error('Nejdřív nahraj zvuk.');return;}
    clearError();stopPreview();setBusy(true);
    const token=++tools.operation;
    try{
      await new Promise(resolve=>setTimeout(resolve,0));
      if(token!==tools.operation)return;
      const buffer=await prepareQuick(kind);
      if(action==='apply'){
        workspace.apply(buffer);workingChanged();
        status(kind==='normalizer'?'norm-status':kind==='trim'?'trim-status':'reverse-status','Úprava použita. Další nástroj pracuje s výsledkem.');
      }else if(action==='export'){
        const data=channels(buffer),wav=encodeWav(data,buffer.sampleRate,24);
        download(wav,filename(kind+'-pulse.wav').replace(/\.wav\.wav$/,'.wav'));
        status(kind==='normalizer'?'norm-status':kind==='trim'?'trim-status':'reverse-status',`WAV exportován (${readableSize(wav.size)}).`);
      }else if(action==='preview'){
        const Ctx=window.AudioContext||window.webkitAudioContext;
        tools.context||=new Ctx();if(tools.context.state==='suspended')await tools.context.resume();
        const src=tools.context.createBufferSource();src.buffer=buffer;src.connect(tools.context.destination);
        src.onended=()=>{if(tools.source===src)stopPreview();};
        tools.source=src;tools.playing=true;src.start();
        el('tool-preview').textContent='Ⅱ';el('tool-preview').setAttribute('aria-label','Zastavit náhled');
        const started=tools.context.currentTime;
        tools.previewTimer=setInterval(()=>status('tool-time',`${durationText(Math.min(buffer.duration,tools.context.currentTime-started))} / ${durationText(buffer.duration)}`),150);
      }
    }catch(e){if(token===tools.operation)error(e.message||'Zpracování se nezdařilo.');}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function updateCalculator(){
    const target=el('calc-table'),value=Number(el('calc-bpm').value);
    try{
      const lengths=bpmDurations(value);
      target.replaceChildren();
      for(const head of ['NOTE','STRAIGHT','DOTTED','TRIPLET']){
        const item=document.createElement('strong');item.textContent=head;target.append(item);
      }
      for(const row of lengths){
        const label=document.createElement('span');label.textContent=row.name;target.append(label);
        for(const val of [row.straight,row.dotted,row.triplet]){
          const btn=document.createElement('button');btn.type='button';btn.title='Kopírovat '+val.toFixed(2)+' ms';btn.textContent=val.toFixed(2)+' ms';
          btn.onclick=async()=>{try{await navigator.clipboard.writeText(val.toFixed(2));status('calc-status','Zkopírováno: '+val.toFixed(2)+' ms');}catch{status('calc-status','Zkopíruj hodnotu: '+val.toFixed(2)+' ms');}};
          target.append(btn);
        }
      }
      status('calc-status',`Časové hodnoty pro ${value.toLocaleString('cs-CZ')} BPM.`);
    }catch(e){target.replaceChildren();status('calc-status',e.message);}
  }
  function status(id,text){el(id).textContent=text;}
  function error(message){el('tool-error').textContent=message;el('tool-error').hidden=false;}
  function clearError(){el('tool-error').hidden=true;}
  function setBusy(busy){tools.loading=busy;for(const id of ['pt-preview','pt-apply','pt-export','tuner-analyze','tuner-preview','tuner-apply','tuner-export','slice-auto','slice-preview','slice-export-one','slice-export-all'])el(id).disabled=busy||!tools.buffer;document.querySelectorAll('[data-quick-preview],[data-quick-apply],[data-quick-export]').forEach(button=>button.disabled=busy||!tools.buffer);el('tool-select-file').disabled=busy;el('conv-export').disabled=busy||!tools.buffer;el('cut-export').disabled=busy||!tools.buffer;el('key-analyze').disabled=busy||!tools.buffer;el('tool-file-input').disabled=busy;}
  function updateButtons(){setBusy(tools.loading);el('tool-reuse-bpm').hidden=!getBpmTrack()?.buffer;}
  function syncOutput(){const mp3=el('conv-format').value==='mp3';el('conv-depth-box').hidden=mp3;el('conv-bitrate-box').hidden=!mp3;if(mp3&&el('conv-rate').value==='96000')el('conv-rate').value='48000';el('conv-rate').querySelector('option[value="96000"]').disabled=mp3;}
  function updateBpmFromAnalyzer(){const other=getBpmTrack();if(other?.bpm){tools.bpm=other.bpm;el('cut-bpm').value=other.bpm;}}
  function resetKey(){tools.keyResult=null;updatePitchKey();el('key-result').hidden=true;el('key-idle').hidden=false;el('key-alternatives').hidden=true;status('key-status','Výsledek je orientační, zejména u bicích a krátkých samplů.');}
  function stopPreview(){
    clearInterval(tools.previewTimer);tools.previewTimer=null;
    if(tools.source){tools.source.onended=null;try{tools.source.stop();}catch{}tools.source.disconnect();tools.source=null;}
    tools.playing=false;el('tool-preview').textContent='▶';el('tool-preview').setAttribute('aria-label','Přehrát zvuk');
  }
  function remove(){tools.bpmWorker?.terminate();tools.bpmWorker=null;tools.productionWorker?.terminate();tools.productionWorker=null;tools.productionCandidate=null;tools.markers=[];workspace.clear();tools.quickCandidate=null;tools.quickBounds=null;el('workspace-undo').disabled=true;el('workspace-redo').disabled=true;el('workspace-original').disabled=true;status('workspace-state','ORIGINAL');tools.operation++;tools.keyWorker?.terminate();tools.keyWorker=null;stopPreview();tools.file=null;tools.buffer=null;tools.peaks=[];tools.from=0;tools.to=8;el('tool-file-input').value='';el('tool-loaded').hidden=true;el('tool-empty').hidden=false;resetKey();clearError();setBusy(false);updateButtons();}
  function nativeWavRate(data){
    // Most WAV files advertise sample rate in the fmt chunk (not always byte 24).
    if(data.byteLength<44)return null;
    const view=new DataView(data),string=off=>String.fromCharCode(...new Uint8Array(data,off,4));
    if(string(0)!=='RIFF'||string(8)!=='WAVE')return null;
    let p=12;
    while(p+8<=data.byteLength&&p<1024*1024){
      const size=view.getUint32(p+4,true);if(string(p)==='fmt '&&size>=16&&p+24<=data.byteLength){
        const rate=view.getUint32(p+12,true);
        return rate>=8000&&rate<=192000?rate:null;
      }
      p+=8+size+(size%2);
    }
    return null;
  }
  async function decode(file){
    clearError();
    if(tools.loading)return;
    if(!file)return;
    if(!/\.(wav|mp3|mp4|m4a|aac|ogg|flac|aiff|aif)$/i.test(file.name)){error('Neznámý soubor. Zkus WAV, MP3, M4A, MP4 nebo jiný podporovaný audioformát.');return;}
    if(file.size>100*1024*1024||file.size===0){error('Soubor musí mít 1 B až 100 MB.');return;}
    const token=++tools.operation;tools.bpmEdited=false;
    stopPreview();tools.keyWorker?.terminate();tools.keyWorker=null;
    setBusy(true);status('conv-status','Načítám zvuk…');
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw new Error('Prohlížeč nepodporuje dekódování audia.');
      tools.context||=new Ctx();
      const bytes=await file.arrayBuffer(),fileRate=nativeWavRate(bytes);
      const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      const decoder=fileRate&&Offline?new Offline(1,1,fileRate):tools.context;
      const buffer=await decoder.decodeAudioData(bytes);
      if(token!==tools.operation)return;
      if(buffer.duration>1200)throw new Error('Maximální délka je 20 minut.');
      tools.bpmWorker?.terminate();tools.bpmWorker=null;tools.productionWorker?.terminate();tools.productionWorker=null;tools.productionCandidate=null;tools.markers=[];workspace.load(buffer,file);tools.file=file;tools.buffer=buffer;tools.peaks=getAudioPeaks(buffer.getChannelData(0),270);tools.from=0;
      tools.to=Math.min(buffer.duration,8);updateBpmFromAnalyzer();
      el('tool-name').textContent=file.name;el('tool-name').title=file.name;
      status('tool-ext',file.name.split('.').pop().toUpperCase());
      status('tool-details',`${durationText(buffer.duration)} · ${readableSize(file.size)} · ${buffer.numberOfChannels} kan. · ${(buffer.sampleRate/1000).toFixed(1)} kHz`);
      el('tool-loaded').hidden=false;el('tool-empty').hidden=true;resetKey();updateTrimInputs();drawToolWave();
      status('conv-status','Připraveno k exportu.');status('cut-status','Uprav délku nebo vyber počet taktů.');
      status('tool-time',`${durationText(0)} / ${durationText(buffer.duration)}`);
    }catch(e){if(token===tools.operation){error('Nelze přečíst zvuk: '+(e?.message||'nepodporovaný kodek')+'. Podpora MP4/M4A/FLAC závisí na prohlížeči.');status('conv-status','Nepodařilo se načíst soubor.');}}
    finally{if(token===tools.operation){setBusy(false);updateButtons();if(tools.buffer?.duration>=6)detectTrackBpm();}}
  }
  function channels(buffer){return Array.from({length:Math.min(buffer.numberOfChannels,2)},(_,i)=>buffer.getChannelData(i));}
  function download(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);}
  async function renderedChannels(targetSampleRate){
    const original=tools.buffer;
    if(original.sampleRate===targetSampleRate)return channels(original);
    const count=Math.ceil(original.duration*targetSampleRate),ch=Math.min(2,original.numberOfChannels);
    const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!Offline)throw new Error('Převzorkování není v prohlížeči podporované.');
    const ctx=new Offline(ch,count,targetSampleRate),source=ctx.createBufferSource();source.buffer=original;source.connect(ctx.destination);source.start(0);
    const out=await ctx.startRendering();return channels(out);
  }
  let lamePromise;
  function loadLame(){
    if(window.lamejs?.Mp3Encoder)return Promise.resolve(window.lamejs);
    if(lamePromise)return lamePromise;
    lamePromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.all.min.js';script.async=true;
      script.onload=()=>window.lamejs?.Mp3Encoder?resolve(window.lamejs):reject(new Error('MP3 enkodér není dostupný.'));
      script.onerror=()=>reject(new Error('Nelze načíst MP3 enkodér. Zkontroluj připojení k internetu nebo exportuj WAV.'));
      document.head.appendChild(script);
    }).catch(e=>{lamePromise=null;throw e;});
    return lamePromise;
  }
  const int16=(float,offset,size)=>{const out=new Int16Array(size);for(let i=0;i<size;i++){const x=Math.max(-1,Math.min(1,float[offset+i]||0));out[i]=x<0?Math.round(32768*x):Math.round(32767*x);}return out;};
  async function toMp3(data,sampleRate,bitrate,token){
    const lame=await loadLame();if(token!==tools.operation)throw new Error('Operace byla zrušena.');
    const encoder=new lame.Mp3Encoder(data.length,sampleRate,bitrate),parts=[],size=1152;
    for(let i=0;i<data[0].length;i+=size){
      if(token!==tools.operation)throw new Error('Operace byla zrušena.');
      const len=Math.min(size,data[0].length-i),left=int16(data[0],i,len),right=data[1]&&int16(data[1],i,len);
      const chunk=right?encoder.encodeBuffer(left,right):encoder.encodeBuffer(left);
      if(chunk.length)parts.push(new Uint8Array(chunk));
      if((i/size)%90===0){status('conv-status',`Kóduji MP3… ${Math.round(i/data[0].length*100)} %`);await new Promise(r=>setTimeout(r,0));}
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
      if(format==='wav'&&approx>300*1024*1024)throw new Error('Výstupní WAV by přesáhl 300 MB. Zvol menší sample rate nebo kratší track.');
      status('conv-status','Převzorkovávám audio…');
      const data=await renderedChannels(rate);
      if(token!==tools.operation)return;
      if(format==='wav'){status('conv-status','Kóduji WAV…');const blob=encodeWav(data,rate,bitDepth);download(blob,filename('wav'));status('conv-status',`WAV je připravený (${readableSize(blob.size)}).`);}
      else{status('conv-status','Načítám MP3 enkodér…');const blob=await toMp3(data,rate,bitrate,token);download(blob,filename('mp3'));status('conv-status',`MP3 je připravené (${readableSize(blob.size)}).`);}
    }catch(e){if(token===tools.operation){error(e.message);status('conv-status','Export se nepodařil.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function selectTab(which){
    tools.tab=which;stopPreview();
    for(const name of ['converter','key','cutter','reverse','trim','calculator','normalizer','pitch','tuner','slicer']){
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
    status('cut-status',span>duration-tools.from+.001?'Track je kratší než zvolený počet taktů.':'Délka loopu: '+precise(tools.to-tools.from));
  }
  function drawToolWave(){
    const canvas=el('tool-waveform');if(!canvas||!tools.buffer)return;
    const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=rect.width||canvas.width,h=rect.height||140;
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const bars=tools.peaks.length,bar=w/bars,duration=tools.buffer.duration;
    const a=tools.tab==='cutter'?tools.from/duration:tools.tab==='trim'&&tools.quickBounds?tools.quickBounds.startSeconds/duration:0,b=tools.tab==='cutter'?tools.to/duration:tools.tab==='trim'&&tools.quickBounds?tools.quickBounds.endSeconds/duration:1;
    ctx.fillStyle='#30302d';ctx.fillRect(0,0,w,h);
    if(tools.tab==='cutter'||tools.tab==='trim'&&tools.quickBounds){ctx.fillStyle='#262622';ctx.fillRect(0,0,w*a,h);ctx.fillRect(w*b,0,w*(1-b),h);ctx.fillStyle='#44312d';ctx.fillRect(w*a,0,w*(b-a),h);}
    for(let i=0;i<bars;i++){
      const amp=Math.max(2,Math.pow(tools.peaks[i],.55)*h*.76),x=i*bar;
      ctx.fillStyle=(i/bars>=a&&i/bars<=b)?'#ff2b20':'#777771';
      ctx.fillRect(x,(h-amp)/2,Math.max(1,bar*.68),amp);
    }
    if(tools.tab==='cutter'||tools.tab==='trim'&&tools.quickBounds){
      for(const x of [w*a,w*b]){ctx.fillStyle='#f5f4f0';ctx.fillRect(x-1,0,2,h);ctx.beginPath();ctx.arc(x,h/2,6,0,Math.PI*2);ctx.fill();}
    }
    if(tools.tab==='slicer'&&tools.markers.length>1){
      tools.markers.slice(1,-1).forEach((value,i)=>{const x=w*value/duration;ctx.fillStyle=i+1===tools.selectedSlice?'#fff':'#ff2b20';ctx.fillRect(x-1,0,2,h);ctx.fillRect(x-5,0,10,9);});
      const start=w*tools.markers[tools.selectedSlice]/duration,end=w*tools.markers[tools.selectedSlice+1]/duration;
      ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(start,0,end-start,h);
    }
  }
  async function preview(){
    if(!tools.buffer||tools.loading)return;
    if(tools.playing){stopPreview();return;}
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;tools.context||=new Ctx();if(tools.context.state==='suspended')await tools.context.resume();
      const cut=tools.tab==='cutter',slice=tools.tab==='slicer'&&tools.markers.length>1,from=cut?tools.from:slice?tools.markers[tools.selectedSlice]:0,to=cut?tools.to:slice?tools.markers[tools.selectedSlice+1]:tools.buffer.duration;
      if(to-from<.02)return;
      const src=tools.context.createBufferSource();src.buffer=tools.buffer;
      const gain=tools.context.createGain();src.connect(gain).connect(tools.context.destination);
      if(cut){const fade=Math.min(Number(el('cut-fade').value)/1000,(to-from)/2);if(fade){const t=tools.context.currentTime;gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(1,t+fade);gain.gain.setValueAtTime(1,t+to-from-fade);gain.gain.linearRampToValueAtTime(.001,t+to-from);}}
      src.onended=()=>{if(tools.source===src){stopPreview();status('tool-time',`${durationText(0)} / ${durationText(to-from)}`);}};
      tools.source=src;tools.playing=true;src.start(0,from,to-from);
      const started=tools.context.currentTime;el('tool-preview').textContent='Ⅱ';el('tool-preview').setAttribute('aria-label','Zastavit zvuk');
      tools.previewTimer=setInterval(()=>status('tool-time',`${durationText(Math.min(to-from,tools.context.currentTime-started))} / ${durationText(to-from)}`),100);
    }catch(e){stopPreview();error('Přehrávání se nepodařilo spustit: '+e.message);}
  }
  async function exportCut(){
    if(!tools.buffer||tools.loading)return;
    const token=++tools.operation;clearError();setBusy(true);stopPreview();
    try{
      if(tools.to-tools.from<.03)throw new Error('Loop musí mít alespoň 30 ms.');
      const data=extractSegment(channels(tools.buffer),tools.buffer.sampleRate,tools.from,tools.to,Number(el('cut-fade').value));
      const bitDepth=Number(el('cut-depth').value),bytes=data[0].length*data.length*(bitDepth/8);
      if(bytes>300*1024*1024)throw new Error('Loop je příliš dlouhý. Zkrať výběr.');
      status('cut-status','Připravuji loop…');await new Promise(r=>setTimeout(r,0));
      if(token!==tools.operation)return;
      const wav=encodeWav(data,tools.buffer.sampleRate,bitDepth);
      const stem=(tools.file.name||'loop').replace(/\.[^.]+$/,'');
      download(wav,`${stem}_${Math.round(Number(el('cut-bpm').value))}bpm_loop.wav`);
      status('cut-status',`Loop exportován (${precise(tools.to-tools.from)}, ${readableSize(wav.size)}).`);
    }catch(e){if(token===tools.operation){error(e.message);status('cut-status','Export se nepodařil.');}}
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
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Analýza trvá příliš dlouho.'));},30000);
        worker.onmessage=({data})=>{clearTimeout(timeout);data.error?reject(new Error(data.error)):resolve(data.result);};
        worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Analýzu nelze spustit.'));};
        worker.postMessage(samples,[samples.samples.buffer]);
      });
      worker.terminate();if(token!==tools.operation)return;
      tools.keyResult=result;updatePitchKey();el('key-result').hidden=false;el('key-idle').hidden=true;el('key-alternatives').hidden=false;
      status('key-name',result.primary.display);status('key-mode',result.primary.mode==='major'?'MAJOR':'MINOR');
      status('key-camelot',result.primary.camelot);
      status('key-confidence',({higher:'SILNĚJŠÍ SHODA',moderate:'ORIENTAČNÍ',low:'NÍZKÁ JISTOTA'})[result.confidence]);
      status('key-alternatives','Další možné tóniny: '+result.alternatives.map(a=>`${a.display} (${a.camelot})`).join(' · '));
      status('key-status','Algoritmický odhad z chromatické analýzy. U změn tóniny nemusí být jednoznačný.');
    }catch(e){if(token===tools.operation){error(e.message);status('key-status','Tóninu se nepodařilo určit.');}}
    finally{tools.keyWorker?.terminate();tools.keyWorker=null;if(token===tools.operation)setBusy(false);}
  }

  // Production audio computation runs off the main thread. The current working
  // buffer stays immutable; applying results pushes a bounded undo revision.
  async function runProduction(kind,options){
    if(!tools.buffer)throw Error('Nejdřív nahraj audio soubor.');
    const token=tools.operation,worker=createProductionWorker();tools.productionWorker?.terminate();tools.productionWorker=worker;
    const rate=tools.buffer.sampleRate;
    const source=channels(tools.buffer).map(x=>x.slice());
    try{
      const result=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{worker.terminate();reject(Error('Výpočet překročil časový limit. Použij kratší audio.'));},150000);
        worker.onmessage=({data})=>{clearTimeout(timeout);data.ok?resolve(data.result):reject(Error(data.error||'Výpočet selhal.'));};
        worker.onerror=()=>{clearTimeout(timeout);reject(Error('Výpočet ve workeru selhal.'));};
        worker.postMessage({id:token,kind,rate,options,channels:source},source.map(x=>x.buffer));
      });
      if(token!==tools.operation)throw Error('Operace byla přerušena výměnou souboru.');
      return result;
    }finally{worker.terminate();if(tools.productionWorker===worker)tools.productionWorker=null;}
  }
  function updatePitchKey(){
    const result=tools.keyResult?.primary;if(!result){status('pt-source-key','—');status('pt-target-key','—');return;}
    status('pt-source-key',result.display);
    const classes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const root=classes.indexOf(result.name),step=Number(el('pt-semitones').value);
    status('pt-target-key',root<0?'—':classes[((root+step)%12+12)%12]+(result.mode==='minor'?'m':''));
  }
  async function detectTrackBpm(){
    if(!tools.buffer||tools.buffer.duration<6)return;
    const sound=tools.buffer,token=tools.operation,worker=createProductionWorker();
    tools.bpmWorker?.terminate();tools.bpmWorker=worker;
    const data=[sound.getChannelData(0).slice()],rate=sound.sampleRate;
    worker.onmessage=({data:message})=>{
      worker.terminate();if(tools.bpmWorker===worker)tools.bpmWorker=null;
      if(token!==tools.operation||tools.buffer!==sound)return;
      if(message.ok&&message.result?.bpm){
        const bpm=message.result.bpm;
        if(!tools.bpmEdited){el('pt-original').value=bpm;el('pt-target').value=bpm;el('calc-bpm').value=bpm;el('cut-bpm').value=bpm;tools.bpm=bpm;}
        status('pt-status',`Tempo: ~${bpm} BPM (možný half/double-time: ${(bpm/2).toFixed(1)} / ${(bpm*2).toFixed(1)}). Ověř poslechem. Ruční hodnoty mají přednost.`);
      }else status('pt-status','BPM se nepodařilo spolehlivě zjistit. Zadej jej ručně.');
    };
    worker.onerror=()=>{worker.terminate();if(tools.bpmWorker===worker)tools.bpmWorker=null;};
    worker.postMessage({kind:'bpm',channels:data,rate,options:{}},[data[0].buffer]);
  }
  function updatePitchLabels(){updatePitchKey();status('pt-semitone-label',el('pt-semitones').value+' st');status('pt-cent-label',el('pt-cents').value+' cents');tools.productionCandidate=null;}
  function updateTunerLabels(){status('tuner-semitone-label',el('tuner-semitones').value+' st');tools.productionCandidate=null;}
  const pitchOptions=()=>({originalBpm:Number(el('pt-original').value),targetBpm:Number(el('pt-target').value),semitones:Number(el('pt-semitones').value),cents:Number(el('pt-cents').value),preservePitch:el('pt-preserve').checked});
  async function prepareProduction(kind){
    const options=kind==='pitch'?pitchOptions():{originalBpm:120,targetBpm:120,semitones:Number(el('tuner-semitones').value),cents:0,preservePitch:true};
    if(tools.productionCandidate&&tools.productionCandidate.kind===kind&&tools.productionCandidate.input===tools.buffer&&tools.productionCandidate.settings===JSON.stringify(options))return tools.productionCandidate.buffer;
    const data=await runProduction('pitch',options);
    const out=asAudioBuffer(data,tools.buffer.sampleRate);
    tools.productionCandidate={kind,input:tools.buffer,settings:JSON.stringify(options),buffer:out};
    status(kind==='pitch'?'pt-status':'tuner-status',`Render hotový · ${out.duration.toFixed(3)} s · ${out.sampleRate} Hz. Preview, Apply nebo export WAV.`);
    return out;
  }
  async function productionAction(kind,action){
    if(!tools.buffer||tools.loading){error('Nejdřív nahraj audio.');return;}
    clearError();stopPreview();setBusy(true);const token=++tools.operation;
    try{
      status(kind==='pitch'?'pt-status':'tuner-status','Zpracovávám audio…');
      const buffer=await prepareProduction(kind);
      if(token!==tools.operation)return;
      if(action==='apply'){workspace.apply(buffer);workingChanged();status(kind==='pitch'?'pt-status':'tuner-status','Použito ve workspace. Předchozí audio můžeš obnovit přes Undo.');}
      else if(action==='export'){const blob=encodeWav(channels(buffer),buffer.sampleRate,24);download(blob,filename(kind+'-pulse.wav').replace(/\.wav\.wav$/,'.wav'));status(kind==='pitch'?'pt-status':'tuner-status',`Exportováno ${readableSize(blob.size)}.`);}
      else if(action==='preview')await playBuffer(buffer);
    }catch(e){if(token===tools.operation)error(e.message);}
    finally{if(token===tools.operation)setBusy(false);}
  }
  async function playBuffer(buffer,from=0,to=buffer.duration){
    stopPreview();const Ctx=window.AudioContext||window.webkitAudioContext;
    tools.context||=new Ctx();if(tools.context.state==='suspended')await tools.context.resume();
    const src=tools.context.createBufferSource();src.buffer=buffer;src.connect(tools.context.destination);
    src.onended=()=>{if(tools.source===src)stopPreview();};tools.source=src;tools.playing=true;src.start(0,from,to-from);
    el('tool-preview').textContent='Ⅱ';el('tool-preview').setAttribute('aria-label','Zastavit náhled');
    const started=tools.context.currentTime;tools.previewTimer=setInterval(()=>status('tool-time',`${durationText(Math.min(to-from,tools.context.currentTime-started))} / ${durationText(to-from)}`),150);
  }
  async function analyze808(){
    if(!tools.buffer||tools.loading)return;clearError();setBusy(true);const token=++tools.operation;
    status('tuner-status','Hledám základní frekvenci…');
    try{
      const result=await runProduction('tuner',{});if(token!==tools.operation)return;
      status('tuner-note',result.note?.note||'—');status('tuner-frequency',result.hz?result.hz.toFixed(2)+' Hz':'— Hz');
      status('tuner-cents',result.note?`${result.note.cents>=0?'+':''}${result.note.cents.toFixed(1)} cents`:'— cents');
      status('tuner-confidence',`${result.label.toUpperCase()} JISTOTA (${Math.round(result.confidence*100)}%)`);
      status('tuner-status',result.confidence<.52?'Nízká jistota. Perkusivní sample může mít nestabilní ladění.':'Nejbližší nota '+result.note.note+'. Ověř uchem, zejména při pitch sweepu.');
    }catch(e){if(token===tools.operation)error(e.message);}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function updateSliceUI(){
    const selection=el('slice-selection');selection.replaceChildren();
    for(let i=0;i<tools.markers.length-1;i++){
      const item=document.createElement('option');item.value=String(i);item.textContent=`Slice ${String(i+1).padStart(2,'0')} · ${tools.markers[i].toFixed(2)}–${tools.markers[i+1].toFixed(2)} s`;selection.append(item);
    }
    tools.selectedSlice=Math.min(tools.selectedSlice,Math.max(0,tools.markers.length-2));selection.value=String(tools.selectedSlice);
    status('slice-status',`${Math.max(0,tools.markers.length-1)} slices · click pro přidání, drag pro posun, Shift+klik pro smazání markeru.`);
    drawToolWave();
  }
  async function sliceAuto(){
    if(!tools.buffer||tools.loading)return;clearError();setBusy(true);const token=++tools.operation;
    try{
      status('slice-status','Detekuji transiency…');const markers=await runProduction('transients',{sensitivity:Number(el('slice-sensitivity').value)/100});if(token!==tools.operation)return;
      tools.markers=markers;tools.selectedSlice=0;updateSliceUI();
    }catch(e){if(token===tools.operation)error(e.message);}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function sliceWav(index){
    const data=sliceAudio(channels(tools.buffer),tools.buffer.sampleRate,tools.markers,index);
    return encodeWav(data,tools.buffer.sampleRate,24);
  }
  async function sliceExport(all=false){
    if(!tools.buffer||tools.loading||tools.markers.length<2){error('Nejdřív nastav slice markery.');return;}
    clearError();setBusy(true);try{
      if(!all){download(sliceWav(tools.selectedSlice),`${tools.file.name.replace(/\.[^.]+$/,'')}_slice_${String(tools.selectedSlice+1).padStart(2,'0')}.wav`);}
      else{
        const entries=[];const base=tools.file.name.replace(/\.[^.]+$/,'');
        if(tools.markers.length>201)throw Error('Maximum 200 sliců v jednom ZIPu.');
        for(let i=0;i<tools.markers.length-1;i++){
          const blob=sliceWav(i);entries.push({name:`${base}_slice_${String(i+1).padStart(3,'0')}.wav`,data:blob});
          if(i%8===0){status('slice-status',`Připravuji ZIP… ${i+1}/${tools.markers.length-1}`);await new Promise(r=>setTimeout(r,0));}
        }
        const zip=await createStoredZip(entries);download(zip,base+'_slices.zip');
      }
      status('slice-status',all?'ZIP obsahuje všechny aktuální slices.':'Slice exportován do WAV.');
    }catch(e){error(e.message);}finally{setBusy(false);}
  }
  function slicePosition(event){const rect=el('tool-waveform').getBoundingClientRect();return Math.min(tools.buffer.duration,Math.max(0,(event.clientX-rect.left)/rect.width*tools.buffer.duration));}
  function slicePointerDown(event){
    if(tools.tab!=='slicer'||!tools.buffer||tools.loading)return false;
    const value=slicePosition(event),markers=tools.markers;
    if(markers.length<2){tools.markers=[0,tools.buffer.duration];}
    const tolerance=Math.min(.15,tools.buffer.duration*.025);
    let closest=-1,distance=Infinity;
    for(let i=1;i<tools.markers.length-1;i++){const d=Math.abs(markers[i]-value);if(d<distance){distance=d;closest=i;}}
    if(closest>=1&&distance<tolerance){
      if(event.shiftKey){markers.splice(closest,1);tools.selectedSlice=Math.max(0,closest-1);updateSliceUI();return true;}
      tools.dragMarker=closest;el('tool-waveform').setPointerCapture(event.pointerId);tools.selectedSlice=closest-1;
    }else{
      if(markers.length>=201){error('Maximum 200 sliců.');return true;}
      const index=markers.findIndex(x=>x>value);if(index<=0)return true;
      const min=.02;if(value-markers[index-1]<min||markers[index]-value<min)return true;
      markers.splice(index,0,value);tools.selectedSlice=index-1;
    }
    updateSliceUI();return true;
  }
  // Phase 2 controls
  for(const id of ['pt-original','pt-target','pt-semitones','pt-cents','pt-preserve'])el(id).addEventListener('input',()=>{if(id==='pt-original'||id==='pt-target')tools.bpmEdited=true;updatePitchLabels();});
  for(const id of ['tuner-semitones'])el(id).addEventListener('input',updateTunerLabels);
  for(const action of ['preview','apply','export']){
    el('pt-'+action).onclick=()=>productionAction('pitch',action);
    el('tuner-'+action).onclick=()=>productionAction('tuner',action);
  }
  el('tuner-analyze').onclick=analyze808;
  el('slice-sensitivity').oninput=()=>{status('slice-sensitivity-label',el('slice-sensitivity').value+'%');};
  el('slice-auto').onclick=sliceAuto;
  el('slice-selection').onchange=()=>{tools.selectedSlice=Number(el('slice-selection').value);drawToolWave();};
  el('slice-preview').onclick=async()=>{
    if(!tools.buffer||tools.markers.length<2){error('Nejdřív vytvoř slice markery.');return;}
    if(tools.playing){stopPreview();return;}
    try{await playBuffer(tools.buffer,tools.markers[tools.selectedSlice],tools.markers[tools.selectedSlice+1]);}
    catch(e){error(e.message);}
  };
  el('slice-export-one').onclick=()=>sliceExport(false);
  el('slice-export-all').onclick=()=>sliceExport(true);
  const slicerCanvas=el('tool-waveform');
  slicerCanvas.addEventListener('pointermove',event=>{
    if(tools.dragMarker<1||tools.tab!=='slicer'||!tools.buffer)return;
    const i=tools.dragMarker,markers=tools.markers;
    markers[i]=Math.max(markers[i-1]+.02,Math.min(markers[i+1]-.02,slicePosition(event)));
    updateSliceUI();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])slicerCanvas.addEventListener(name,()=>{tools.dragMarker=-1;});
  // Events
  document.querySelectorAll('[data-tool-nav]').forEach(link=>{link.addEventListener('click',()=>selectTab(link.dataset.toolNav));});
  document.querySelectorAll('[data-tool]').forEach(button=>{
    button.addEventListener('click',()=>selectTab(button.dataset.tool));
    button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=['converter','key','cutter','reverse','trim','calculator','normalizer','pitch','tuner','slicer'];const next=tabs[(tabs.indexOf(tools.tab)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];selectTab(next);el('tab-'+next).focus();});
  });
  document.querySelectorAll('[data-quick-preview]').forEach(button=>button.onclick=()=>quickAction(button.dataset.quickPreview,'preview'));
  document.querySelectorAll('[data-quick-apply]').forEach(button=>button.onclick=()=>quickAction(button.dataset.quickApply,'apply'));
  document.querySelectorAll('[data-quick-export]').forEach(button=>button.onclick=()=>quickAction(button.dataset.quickExport,'export'));
  el('workspace-undo').onclick=()=>{if(workspace.undo())workingChanged();};
  el('workspace-redo').onclick=()=>{if(workspace.redo())workingChanged();};
  el('workspace-original').onclick=()=>{if(workspace.reset())workingChanged();};
  el('calc-bpm').oninput=updateCalculator;
  el('trim-threshold').oninput=()=>{status('trim-db-label',el('trim-threshold').value+' dBFS');clearQuick();};
  el('trim-padding').oninput=clearQuick;
  el('norm-mode').onchange=()=>{el('norm-peak-field').hidden=el('norm-mode').value!=='peak';el('norm-lufs-field').hidden=el('norm-mode').value!=='lufs';clearQuick();};
  for(const id of ['norm-peak','norm-lufs','norm-ceiling'])el(id).oninput=clearQuick;
  el('tool-select-file').onclick=el('tool-change').onclick=()=>el('tool-file-input').click();
  el('tool-file-input').onchange=e=>decode(e.target.files[0]);
  el('tool-remove').onclick=remove;
  el('tool-preview').onclick=preview;
  el('tool-reuse-bpm').onclick=()=>{const x=getBpmTrack();if(x?.buffer&&x?.file){tools.productionWorker?.terminate();tools.productionCandidate=null;tools.markers=[];workspace.load(x.buffer,x.file);tools.file=x.file;tools.buffer=x.buffer;tools.peaks=getAudioPeaks(x.buffer.getChannelData(0),270);tools.from=0;tools.to=Math.min(8,x.buffer.duration);el('tool-name').textContent=x.file.name;el('tool-name').title=x.file.name;status('tool-ext',x.file.name.split('.').pop().toUpperCase());status('tool-details',`${durationText(x.buffer.duration)} · ${readableSize(x.file.size)} · ${x.buffer.numberOfChannels} kan. · ${(x.buffer.sampleRate/1000).toFixed(1)} kHz`);el('tool-loaded').hidden=false;el('tool-empty').hidden=true;updateBpmFromAnalyzer();resetKey();updateTrimInputs();drawToolWave();status('conv-status','Převzato z BPM analyzátoru.');updateButtons();}};
  el('conv-format').onchange=syncOutput;
  el('conv-export').onclick=exportConvert;
  el('key-analyze').onclick=analyzeKey;
  el('cut-bpm').oninput=()=>{tools.bpm=Number(el('cut-bpm').value);if(el('cut-bars').value!=='custom')setByBars();};
  el('cut-bars').onchange=()=>{if(el('cut-bars').value!=='custom')setByBars();};
  el('cut-start').oninput=e=>setStart(e.target.value,true);
  el('cut-end').oninput=e=>setEnd(e.target.value);
  el('cut-export').onclick=exportCut;
  el('tool-waveform').addEventListener('pointerdown',event=>{
    if(slicePointerDown(event))return;
    if(tools.tab!=='cutter'||!tools.buffer)return;
    const rect=el('tool-waveform').getBoundingClientRect(),time=Math.min(tools.buffer.duration,Math.max(0,(event.clientX-rect.left)/rect.width*tools.buffer.duration));
    if(Math.abs(time-tools.from)<Math.abs(time-tools.to))setStart(time,true);else setEnd(time);
  });
  const drop=el('tool-drop-zone');
  drop.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!tools.loading)drop.classList.add('tool-dragover');}});
  drop.addEventListener('dragleave',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('tool-dragover');});
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('tool-dragover');if(e.dataTransfer.files.length!==1){error('Nahraj vždy jeden soubor.');return;}decode(e.dataTransfer.files[0]);});
  window.addEventListener('pulse:bpm-track-ready',updateButtons);
  const resize=new ResizeObserver(()=>drawToolWave());resize.observe(el('tool-waveform'));
  window.addEventListener('pagehide',()=>{stopPreview();tools.bpmWorker?.terminate();tools.productionWorker?.terminate();tools.keyWorker?.terminate();tools.context?.close();});
  syncOutput();updateCalculator();updateButtons();
  return {reset:remove};
}
