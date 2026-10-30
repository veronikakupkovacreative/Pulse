// Additional PULSE tools. All audio remains local to this browser session.
function initExtraTools({el,tools,channels,asAudioBuffer,playBuffer,stopPreview,workspace,
  workingChanged,download,filename,status,decodeLocalAudio,audioFileError,encodeWav}){
  const eqState={bands:EQ_DEFAULT_BANDS.map(b=>({...b})),gainDb:0};
  let activeEqBand=1;
  const makeBandMode=count=>{
    if(count===8)return EQ_DEFAULT_BANDS.map(b=>({...b}));
    const rate=tools.buffer?.sampleRate||48000,maxHz=Math.min(16000,rate*.44);
    if(count===3)return [{type:'lowshelf',frequency:110,gain:0,q:.707,enabled:true},
      {type:'peaking',frequency:1000,gain:0,q:1,enabled:true},
      {type:'highshelf',frequency:Math.min(7500,maxHz),gain:0,q:.707,enabled:true}];
    return Array.from({length:count},(_,i)=>({
      type:i===0?'lowshelf':i===count-1?'highshelf':'peaking',
      frequency:Math.round(35*(maxHz/35)**(i/(count-1))),
      gain:0,q:i===0||i===count-1?.707:1,enabled:true
    }));
  };
  const eqSelector=el('eq-band-selector');
  function selectEqBand(index){
    activeEqBand=Math.max(0,Math.min(eqState.bands.length-1,index));
    for(const row of eqInputs.querySelectorAll('[data-band]'))row.hidden=Number(row.dataset.band)!==activeEqBand;
    for(const button of eqSelector.querySelectorAll('[data-band]'))
      button.setAttribute('aria-pressed',String(Number(button.dataset.band)===activeEqBand));
  }
  function renderEqBandSelector(){
    eqSelector.replaceChildren();
    eqState.bands.forEach((band,index)=>{
      const button=document.createElement('button');button.type='button';button.dataset.band=String(index);
      button.textContent=String(index+1).padStart(2,'0');
      button.setAttribute('aria-label','Select EQ band '+(index+1));
      button.onclick=()=>{selectEqBand(index);drawEqGraph();};
      eqSelector.append(button);
    });
    selectEqBand(activeEqBand);
    status('eq-band-count-info',eqState.bands.length+' editable bands');
    for(const button of el('eq-band-modes').querySelectorAll('[data-eq-count]'))
      button.setAttribute('aria-pressed',String(Number(button.dataset.eqCount)===eqState.bands.length));
  }
  let mixTracks=[],mixCandidate=null,mixLoading=false,quickMixCandidate=null,separationWorker=null,separationRevision=0;
  const separationStatus=message=>status('mix-separation-status',message);
  function updateSeparationAvailability(){
    const mobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
    el('mix-separate').disabled=mobile||!tools.buffer||!!separationWorker;
    if(mobile)separationStatus('On-device Demucs inference needs desktop-class memory. Use the manual stem importer on this device.');
    else if(tools.buffer&&tools.buffer.duration>45)separationStatus('Trim the working audio to 45 seconds or less with Loop Cutter before running separation.');
  }
  function cancelSeparation(message='Separation canceled.'){
    separationRevision++;
    if(separationWorker){separationWorker.terminate();separationWorker=null;}
    el('mix-cancel-separation').disabled=true;
    updateSeparationAvailability();
    if(message)separationStatus(message);
  }
  async function startSeparation(){
    if(!tools.buffer||separationWorker)return;
    const original=tools.buffer,revision=++separationRevision;
    const mobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
    if(mobile){separationStatus('AI separation requires a desktop browser with available memory.');return;}
    if(original.duration<.5||original.duration>45){separationStatus('Choose a working audio clip between 0.5 and 45 seconds.');return;}
    if(!window.Worker){separationStatus('Web Workers are required for local separation.');return;}
    el('mix-separate').disabled=true;el('mix-cancel-separation').disabled=false;
    separationStatus('Preparing audio at 44.1 kHz; the original project remains untouched…');
    let worker;
    try{
      const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      if(!Offline)throw Error('OfflineAudioContext is required to prepare model audio.');
      const count=Math.round(original.duration*44100);
      const context=new Offline(2,count,44100);
      const source=context.createBufferSource();source.buffer=original;source.connect(context.destination);source.start(0);
      const processed=await context.startRendering();
      if(revision!==separationRevision||tools.buffer!==original)return;
      const left=processed.getChannelData(0).slice(),right=processed.getChannelData(1).slice();
      worker=new Worker('/vendor/demucs-worker.js');separationWorker=worker;
      worker.onmessage=event=>{
        if(revision!==separationRevision||tools.buffer!==original)return;
        const data=event.data||{};
        if(data.type==='progress'){separationStatus(data.message);return;}
        if(data.type==='error'){cancelSeparation(data.message);return;}
        if(data.type!=='done'||!Array.isArray(data.tracks)||data.tracks.length!==4){cancelSeparation('Invalid model output.');return;}
        try{
          const names=new Set(data.tracks.map(t=>t.name));
          if(!['drums','bass','other','vocals'].every(name=>names.has(name)))throw Error('Missing model stems.');
          const imported=data.tracks.map(track=>{
            const channels=track.channels;
            if(channels?.length!==2||channels.some(c=>!(c instanceof Float32Array)||c.length!==count))
              throw Error('Unexpected model output dimensions.');
            return {name:track.name.toUpperCase()+' (AI)',rate:44100,channels,
              gainDb:0,pan:0,mute:false,solo:false,measurement:stemMeasurements(channels)};
          });
          mixTracks=imported;invalidateMix();renderMixRows();
          cancelSeparation('4 Demucs stems separated locally and loaded into the multitrack mixer. Adjust levels before export.');
        }catch(error){cancelSeparation(error.message);}
      };
      worker.onerror=event=>{event.preventDefault();cancelSeparation('Model worker failed. Check your browser console, memory, and network.');};
      separationStatus('Initializing local Demucs · model download is approximately 170 MB on first use…');
      worker.postMessage({type:'separate',left,right},[left.buffer,right.buffer]);
    }catch(error){
      if(worker)worker.terminate();
      if(revision===separationRevision)cancelSeparation(error.message||'Could not initialize separation.');
    }
  }
  el('mix-separate').onclick=()=>void startSeparation();
  el('mix-cancel-separation').onclick=()=>cancelSeparation();
  const eqNotice=text=>status('eq-status',text);
  const mixNotice=text=>status('mix-status',text);
  const eqInputs=el('eq-bands');
  let dragBand=-1,spectrumRaf=0,spectrumStamp=0;
  const presets={
    flat:EQ_DEFAULT_BANDS.map(x=>({...x})),
    vocal:EQ_DEFAULT_BANDS.map((x,i)=>({...x,enabled:true,gain:[0,0,-2,0,2.5,-1,0,1][i],
      frequency:i===0?85:x.frequency})),
    bass:EQ_DEFAULT_BANDS.map((x,i)=>({...x,enabled:i!==0,gain:[0,2.5,-2,0,0,0,0,0][i]})),
    air:EQ_DEFAULT_BANDS.map((x,i)=>({...x,gain:i===7?2.5:0})),
    clean:EQ_DEFAULT_BANDS.map((x,i)=>({...x,enabled:true,
      frequency:i===0?45:x.frequency,gain:0}))
  };
  for(const key of Object.keys(CLASSIC_EQ_MODES))presets[key]=classicEqBands(key);
  function readEq(){return eqState.bands.map(x=>({...x}));}
  function eqFilterNodes(){
    if(!tools.context)return [];
    return eqState.bands.filter(b=>b.enabled).map(b=>{
      const node=tools.context.createBiquadFilter();
      node.type=b.type;node.frequency.value=Math.min(b.frequency,tools.context.sampleRate*.49);
      node.Q.value=b.q;node.gain.value=b.gain;
      return node;
    });
  }
  function drawEqGraph(){
    const svg=el('eq-response-graph');
    svg.replaceChildren();
    const sr=tools.buffer?.sampleRate||48000,width=720,height=232;
    const hzMax=Math.min(20000,sr*.45);
    const xOf=hz=>Math.log(hz/20)/Math.log(hzMax/20)*width;
    const yOf=db=>height/2-db/18*(height/2-12);
    const ns='http://www.w3.org/2000/svg';
    const node=(name,attributes)=>{const n=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attributes))n.setAttribute(k,String(v));svg.append(n);return n;};
    for(const db of [-12,-6,0,6,12]){
      const y=yOf(db);node('line',{x1:0,y1:y,x2:width,y2:y,stroke:db===0?'#a2a2a2':'#777',opacity:db===0?.7:.25,'stroke-width':1});
      const label=node('text',{x:4,y:y-4,fill:'#aaa','font-size':10});label.textContent=(db>0?'+':'')+db+'dB';
    }
    for(const hz of [50,100,200,500,1000,2000,5000,10000,20000]){
      if(hz>hzMax)continue;const x=xOf(hz);
      node('line',{x1:x,y1:0,x2:x,y2:height,stroke:'#777',opacity:.18});
      const label=node('text',{x:x+2,y:height-4,fill:'#aaa','font-size':10});label.textContent=hz>=1000?(hz/1000)+'k':String(hz);
    }
    const curve=eqResponse(eqState.bands,sr,190);
    const d=curve.map((p,i)=>(i?'L':'M')+xOf(p.hz).toFixed(1)+' '+yOf(p.db).toFixed(1)).join(' ');
    node('path',{d,fill:'none',stroke:'#ffe58f','stroke-width':3,'stroke-linejoin':'round'});
    eqState.bands.forEach((band,index)=>{
      if(!band.enabled)return;
      const circle=node('circle',{cx:xOf(Math.min(hzMax,band.frequency)),cy:yOf(band.gain),
        r:index===activeEqBand?10:7,fill:index===activeEqBand?'#ffe58f':'#191e20',
        stroke:index===activeEqBand?'#fff':'#ffe58f','stroke-width':2,
        role:'button',tabindex:0,'aria-label':'Band '+(index+1)+'; drag to change frequency and gain'});
      circle.addEventListener('pointerdown',event=>{
        event.preventDefault();
        dragBand=index;selectEqBand(index);
        svg.setPointerCapture(event.pointerId);
      });
    });
  }
  el('eq-response-graph').addEventListener('pointermove',event=>{
    if(dragBand<0)return;
    const svg=el('eq-response-graph'),rect=svg.getBoundingClientRect();
    const nx=Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width));
    const ny=Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height));
    const band=eqState.bands[dragBand],hzMax=Math.min(20000,tools.buffer?.sampleRate*.45||21600);
    band.frequency=Math.max(20,Math.round(20*(hzMax/20)**nx));
    if(!['highpass','lowpass','notch'].includes(band.type))band.gain=Math.round((12-24*ny)*10)/10;
    refreshEq();
  });
  el('eq-response-graph').addEventListener('pointerup',()=>{dragBand=-1;});
  el('eq-response-graph').addEventListener('pointercancel',()=>{dragBand=-1;});
  function drawLiveSpectrum(timestamp=0){
    if(!tools.eqAnalyser||!tools.playing||tools.tab!=='equalizer'||!el('eq-spectrum').checked){
      spectrumRaf=0;const canvas=el('eq-live-spectrum');canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
      return;
    }
    if(timestamp-spectrumStamp>33){
      spectrumStamp=timestamp;const analyser=tools.eqAnalyser,canvas=el('eq-live-spectrum');
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
      const width=rect.width||720,height=rect.height||232;
      const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      const bins=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(bins);
      const minHz=20,maxHz=Math.min(20000,tools.context.sampleRate*.45);
      ctx.beginPath();let found=false;
      for(let i=1;i<bins.length;i++){
        const hz=i*tools.context.sampleRate/analyser.fftSize;
        if(hz<minHz||hz>maxHz)continue;
        const x=Math.log(hz/minHz)/Math.log(maxHz/minHz)*width;
        const db=Number.isFinite(bins[i])?bins[i]:-110;
        const y=height-(Math.max(-110,Math.min(-10,db))+110)/100*height;
        if(!found){ctx.moveTo(x,y);found=true;}else ctx.lineTo(x,y);
      }
      if(found){const grad=ctx.createLinearGradient(0,0,0,height);
        grad.addColorStop(0,'rgba(157,199,215,.55)');grad.addColorStop(1,'rgba(74,129,153,.11)');
        ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
        ctx.strokeStyle='rgba(176,210,222,.7)';ctx.lineWidth=1;ctx.stroke();}
    }
    spectrumRaf=requestAnimationFrame(drawLiveSpectrum);
  }
  function beginLiveSpectrum(){if(!spectrumRaf)spectrumRaf=requestAnimationFrame(drawLiveSpectrum);}
  el('eq-spectrum').onchange=()=>{if(el('eq-spectrum').checked)beginLiveSpectrum();else{
    cancelAnimationFrame(spectrumRaf);spectrumRaf=0;
    const canvas=el('eq-live-spectrum');canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
  }};
  function eqNodeUpdate(){
    if(!tools.eqNodes)return;
    for(let i=0;i<tools.eqNodes.length;i++){
      const n=tools.eqNodes[i],b=eqState.bands[i];
      if(!b)continue;const now=tools.context.currentTime;
      n.type=b.enabled&&!el('eq-bypass').checked?b.type:'peaking';
      n.frequency.setTargetAtTime(Math.min(b.frequency,tools.context.sampleRate*.49),now,.016);
      n.Q.setTargetAtTime(b.q,now,.016);n.gain.setTargetAtTime(b.enabled&&!el('eq-bypass').checked?b.gain:0,now,.016);
    }
  }
  function refreshEq(){
    drawEqGraph();
    selectEqBand(activeEqBand);
    const rows=eqInputs.querySelectorAll('[data-band]');
    for(const [i,row] of [...rows].entries()){
      const b=eqState.bands[i];
      row.querySelector('[data-value="freq"]').textContent=Math.round(b.frequency)+' Hz';
      row.querySelector('[data-value="gain"]').textContent=b.gain.toFixed(1)+' dB';
      row.querySelector('[data-value="q"]').textContent=b.q.toFixed(2);
      row.querySelector('[name="freq"]').value=String(b.frequency);
      row.querySelector('[name="gain"]').value=String(b.gain);
      row.querySelector('[name="q"]').value=String(b.q);
      row.querySelector('[name="enable"]').checked=b.enabled;row.querySelector('[name="type"]').value=b.type;
    }
    eqNodeUpdate();
  }
  function renderEqControls(){eqInputs.replaceChildren();eqState.bands.forEach((band,i)=>{
    const row=document.createElement('div');row.className='pulse-eq-band';row.dataset.band=String(i);
    row.innerHTML='<label><input type="checkbox" name="enable"> BAND '+(i+1)+'</label>'+ 
    '<label>Filter <select name="type"><option value="peaking">Bell</option><option value="lowshelf">Low shelf</option><option value="highshelf">High shelf</option><option value="highpass">High pass</option><option value="lowpass">Low pass</option><option value="notch">Notch</option></select></label>'+
    '<label>Frequency <span data-value="freq"></span><input type="range" name="freq" min="20" max="20000" step="1"></label>'+
    '<label>Gain <span data-value="gain"></span><input type="range" name="gain" min="-12" max="12" step=".1"></label>'+
    '<label>Q <span data-value="q"></span><input type="range" name="q" min=".25" max="10" step=".05"></label>';
    eqInputs.append(row);
    for(const [name,field] of [['enable','enabled'],['type','type'],['freq','frequency'],['gain','gain'],['q','q']]){
      row.querySelector('[name="'+name+'"]').addEventListener('input',event=>{
        band[field]=name==='enable'?event.target.checked:name==='type'?event.target.value:Number(event.target.value);refreshEq();
        eqNotice('EQ settings changed. Preview live or export to render.');
      });
    }
  });renderEqBandSelector();}
  renderEqControls();
  el('eq-preset').addEventListener('change',()=>{
    const selected=presets[el('eq-preset').value]||presets.flat;
    eqState.bands=selected.map(b=>({...b}));activeEqBand=0;renderEqControls();
    const mode=CLASSIC_EQ_MODES[el('eq-preset').value];
    status('eq-character-description',mode?mode.description+' · PULSE-designed filters, not hardware emulation.':'Adjust the eight bands or choose a Classic EQ character.');
    refreshEq();
  });
  el('eq-output-gain').addEventListener('input',()=>{
    eqState.gainDb=Number(el('eq-output-gain').value);
    status('eq-output-label',eqState.gainDb.toFixed(1)+' dB');
    if(tools.eqOutputGain&&tools.context)tools.eqOutputGain.gain.setTargetAtTime(10**(eqState.gainDb/20),tools.context.currentTime,.015);
  });
  el('eq-bypass').addEventListener('change',()=>{refreshEq();eqNotice(el('eq-bypass').checked?'Bypass enabled.':'EQ active.');});
  el('eq-reset').onclick=()=>{
    eqState.bands=makeBandMode(eqState.bands.length);activeEqBand=0;renderEqControls();
    eqState.gainDb=0;el('eq-output-gain').value='0';status('eq-output-label','0.0 dB');
    el('eq-bypass').checked=false;el('eq-preset').value='flat';refreshEq();
  };
  el('eq-band-modes').addEventListener('click',event=>{
    const button=event.target.closest('[data-eq-count]');if(!button)return;
    const count=Number(button.dataset.eqCount);
    if(![3,8,10,20].includes(count)||count===eqState.bands.length)return;
    const resume=tools.playing&&tools.tab==='equalizer';
    if(resume)stopPreview();
    eqState.bands=makeBandMode(count);activeEqBand=0;
    el('eq-preset').value='flat';renderEqControls();refreshEq();
    eqNotice(count+'-band EQ ready. Previous band settings reset.');
    if(resume)void previewEqRange();
  });
  function eqPreviewOptions(){
    return {allowLoop:false,eqBands:el('eq-bypass').checked?[]:readEq(),eqGainDb:eqState.gainDb};
  }
  async function previewEqRange(){
    if(!tools.buffer){eqNotice('Load audio in the black waveform workspace first.');return;}
    const region=tools.eqSelection;
    const from=region?.from??Math.min(tools.playhead,Math.max(0,tools.buffer.duration-.02));
    const to=region?.to??tools.buffer.duration;
    if(to-from<.02){eqNotice('Move the playhead earlier or choose a longer range.');return;}
    try{
      await playBuffer(tools.buffer,from,to,1,eqPreviewOptions());
      beginLiveSpectrum();
      eqNotice(region?'Playing selected region with live EQ.':'Playing from playhead with live EQ.');
    }catch(error){eqNotice('EQ preview failed: '+(error.message||'Unknown error'));}
  }
  async function eqAction(action){
    if(!tools.buffer){eqNotice('Load audio in the black waveform workspace first.');return;}
    if(action==='preview'){await previewEqRange();return;}
    const input=tools.buffer,selection=tools.eqSelection?{...tools.eqSelection}:null;
    try{
      eqNotice(selection?'Processing selected waveform region…':'Processing complete track…');
      const result=renderEqRegion(channels(input),input.sampleRate,
        el('eq-bypass').checked?[]:eqState.bands,eqState.gainDb,selection);
      if(tools.buffer!==input)throw Error('Audio changed during processing. Try again.');
      if(action==='apply'){
        workspace.apply(asAudioBuffer(result,input.sampleRate));
        workingChanged();
        eqNotice(selection?'Selected region EQ applied; surrounding audio preserved. Undo is available.':'EQ applied to the complete track. Undo is available.');
      }else if(action==='export'){
        // A selected region downloads as an isolated clip; the working audio stays unchanged.
        const first=selection?Math.floor(selection.from*input.sampleRate):0;
        const last=selection?Math.min(input.length,Math.ceil(selection.to*input.sampleRate)):input.length;
        const output=selection?result.map(ch=>ch.slice(first,last)):result;
        const blob=encodeWav(output,input.sampleRate,24);
        download(blob,filename(selection?'equalized-selection.wav':'equalized.wav'));
        eqNotice(selection?'Selected EQ region exported as WAV.':'Full EQ track exported as WAV.');
      }
    }catch(error){eqNotice(error.message||'Equalizer rendering failed.');}
  }
  el('eq-preview').onclick=()=>void eqAction('preview');
  el('eq-apply').onclick=()=>void eqAction('apply');
  el('eq-export').onclick=()=>void eqAction('export');
  refreshEq();

  function clearQuickMix(){quickMixCandidate=null;el('mix-quick-preview').disabled=true;el('mix-quick-send').disabled=true;el('mix-quick-auto').disabled=true;}
  el('mix-intensity').oninput=()=>{status('mix-intensity-label',el('mix-intensity').value+'%');clearQuickMix();};
  el('mix-character').onchange=clearQuickMix;
  el('mix-quick-analyze').onclick=()=>{
    if(!tools.buffer){status('mix-quick-report','Load an audio track in the shared workspace first.');return;}
    const result=analyzeStereoQuickFix(channels(tools.buffer),tools.buffer.sampleRate);
    const issues=result.warnings.join(' · ')||'No critical thresholds flagged.';
    status('mix-quick-report','Sample peak '+result.signal.peakDb.toFixed(1)+' dBFS · RMS '+
      result.signal.rmsDb.toFixed(1)+' dBFS · Low energy '+(result.lowShare*100).toFixed(1)+'% · '+issues);
  };
  el('mix-quick-generate').onclick=()=>{
    if(!tools.buffer){status('mix-quick-report','Load an audio track in the shared workspace first.');return;}
    try{
      const result=renderStereoQuickFix(channels(tools.buffer),tools.buffer.sampleRate,{
        character:el('mix-character').value,intensity:Number(el('mix-intensity').value)});
      quickMixCandidate={input:tools.buffer,result,buffer:asAudioBuffer(result.channels,tools.buffer.sampleRate)};
      el('mix-quick-preview').disabled=false;el('mix-quick-send').disabled=false;el('mix-quick-auto').disabled=false;
      status('mix-quick-report',result.changes.length?result.changes.map(c=>
        c.frequency+' Hz '+c.gainDb.toFixed(1)+' dB').join(' · '):
        'Original tonal balance retained. No corrective EQ was indicated.');
    }catch(error){clearQuickMix();status('mix-quick-report',error.message);}
  };
  el('mix-quick-preview').onclick=async()=>{
    if(!quickMixCandidate)return;
    try{await playBuffer(quickMixCandidate.buffer,tools.playhead,quickMixCandidate.buffer.duration,1,{allowLoop:false});}
    catch(error){status('mix-quick-report',error.message);}
  };
  function sendQuickMix(autoRender=false){
    if(!quickMixCandidate||quickMixCandidate.input!==tools.buffer){status('mix-quick-report','Regenerate your mix after changing source audio.');return;}
    workspace.apply(quickMixCandidate.buffer);
    workingChanged();clearQuickMix();
    document.getElementById('tab-master').click();
    status('master-status','Quick Fix applied to working audio; '+(autoRender?'generating a new master.':'Generate a new master to continue.'));
    if(autoRender)el('master-render').click();
  }
  el('mix-quick-send').onclick=()=>sendQuickMix(false);
  el('mix-quick-auto').onclick=()=>sendQuickMix(true);
  function showFixAdvice(masterResult){
    const panel=el('mix-fix-advice');panel.replaceChildren();
    const title=document.createElement('strong');title.textContent='FIX IN MIX · MASTERING FEEDBACK';panel.append(title);
    const issues=(masterResult?.findings||[]).filter(x=>x.code!=='balanced');
    const rows=issues.length?issues.map(x=>x.label+' · '+x.evidence+' — '+x.detail):
      ['No critical mix-health thresholds triggered. Listen before changing the source.'];
    for(const message of rows){const item=document.createElement('p');item.textContent=message;panel.append(item);}
    const note=document.createElement('p');
    note.textContent='Changes in Mix are non-destructive until Apply. Re-render Smart Master after editing.';
    panel.append(note);panel.hidden=false;
    el('mix-quick-analyze').click();
  }
  function invalidateMix(){mixCandidate=null;el('mix-play').disabled=true;el('mix-export').disabled=true;}
  function renderMixRows(){
    const list=el('mix-stems');list.replaceChildren();
    for(const [i,stem] of mixTracks.entries()){
      const row=document.createElement('div');row.className='pulse-mix-row';
      const head=document.createElement('div');head.className='pulse-mix-head';
      const title=document.createElement('strong');title.textContent=(i+1)+' · '+stem.name;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
      remove.onclick=()=>{mixTracks.splice(i,1);invalidateMix();renderMixRows();mixNotice(mixTracks.length+' stems loaded.');};
      const exportStem=document.createElement('button');exportStem.type='button';
      exportStem.textContent='Download WAV';
      exportStem.setAttribute('aria-label','Download '+stem.name+' as 24-bit WAV');
      exportStem.onclick=()=>{try{
        const blob=encodeWav(stem.channels,stem.rate,24);
        const safeName=stem.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();
        download(blob,'pulse-stem-'+(safeName||'audio')+'.wav');
      }catch(error){mixNotice(error.message||'Stem export failed.');}};
      head.append(title,exportStem,remove);row.append(head);
      const meters=document.createElement('p');meters.textContent='RMS '+stem.measurement.rmsDb.toFixed(1)+' dBFS · Peak '+stem.measurement.peakDb.toFixed(1)+' dBFS';row.append(meters);
      for(const [label,key,min,max,step,unit] of [['Gain','gainDb',-24,12,.5,' dB'],['Pan','pan',-1,1,.05,'']]){
        const holder=document.createElement('label');holder.textContent=label+' ';
        const out=document.createElement('output');out.textContent=stem[key].toFixed(key==='pan'?2:1)+unit;
        const slider=document.createElement('input');slider.type='range';slider.min=String(min);slider.max=String(max);slider.step=String(step);slider.value=String(stem[key]);
        slider.oninput=()=>{stem[key]=Number(slider.value);out.textContent=stem[key].toFixed(key==='pan'?2:1)+unit;invalidateMix();};
        holder.append(out,slider);row.append(holder);
      }
      for(const key of ['mute','solo']){
        const holder=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=stem[key];
        check.onchange=()=>{stem[key]=check.checked;invalidateMix();};
        holder.append(check,document.createTextNode(' '+key.toUpperCase()));row.append(holder);
      }
      list.append(row);
    }
    el('mix-balance').disabled=mixTracks.length<2||mixLoading;
    el('mix-render').disabled=mixTracks.length<2||mixLoading;
  }
  el('mix-files').onchange=async event=>{
    const input=event.currentTarget,files=[...input.files||[]];input.value='';
    if(mixLoading||!files.length)return;
    mixLoading=true;invalidateMix();el('mix-files').disabled=true;
    try{
      if(mixTracks.length+files.length>8)throw Error('Maximum 8 stems per mix.');
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw Error('Web Audio API is unavailable.');
      tools.context||=new Ctx();
      for(const file of files){
        const invalid=audioFileError(file);
        if(invalid)throw Error(file.name+': '+invalid);
        mixNotice('Decoding '+file.name+'…');
        // AudioContext decoding uses a shared sample rate for every imported stem.
        const {buffer}=await decodeLocalAudio(file,{context:tools.context,OfflineContext:null});
        if(buffer.duration>180)throw Error('For browser mixing, use stems shorter than 3 minutes.');
        if(mixTracks.length&&buffer.sampleRate!==mixTracks[0].rate)throw Error('Stem sample rates differ.');
        const data=channels(buffer).map(c=>c.slice());
        const total=mixTracks.reduce((n,s)=>n+s.channels.reduce((v,c)=>v+c.length,0),0)+data.reduce((v,c)=>v+c.length,0);
        const mobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
        if(total>(mobile?8_000_000:24_000_000))throw Error('Stem memory budget reached. Use shorter files.');
        mixTracks.push({name:file.name,channels:data,rate:buffer.sampleRate,
          gainDb:0,pan:0,mute:false,solo:false,measurement:stemMeasurements(data)});
      }
      mixNotice(mixTracks.length+' stems loaded. They are assumed to start at 0:00 and stay time-aligned.');
    }catch(err){mixNotice(err.message||'Import failed.');}
    finally{mixLoading=false;el('mix-files').disabled=false;renderMixRows();}
  };
  el('mix-balance').onclick=()=>{
    for(const stem of mixTracks)stem.gainDb=suggestedGainDb(stem.channels);
    invalidateMix();renderMixRows();
    const advice=inspectStemOverlap(mixTracks),container=el('mix-advice');container.replaceChildren();
    const heading=document.createElement('strong');heading.textContent='STEM OVERLAP · HEURISTIC ANALYSIS';container.append(heading);
    if(!advice.findings.length){
      const note=document.createElement('p');note.textContent='No strong broad-band overlap flagged. Check the mix by ear.';container.append(note);
    }else for(const finding of advice.findings){
      const item=document.createElement('p');
      item.textContent=finding.first+' / '+finding.second+' · '+finding.band+
        ' · '+finding.strength+'% shared relative emphasis. '+finding.suggestion;
      container.append(item);
    }
    container.hidden=false;
    mixNotice('Conservative gain suggestions applied. Review possible frequency overlap before export.');
  };
  el('mix-render').onclick=async()=>{
    if(mixTracks.length<2)return;
    mixNotice('Mixing aligned stems…');
    try{
      mixCandidate=mixStems(mixTracks,{ceilingDb:-1});
      el('mix-play').disabled=false;el('mix-export').disabled=false;
      mixNotice('Mix ready · '+mixTracks.length+' stems · peak '+mixCandidate.peakDb.toFixed(1)+' dBFS · protection '+mixCandidate.attenuationDb.toFixed(1)+' dB.');
    }catch(error){invalidateMix();mixNotice(error.message||'Could not render stems.');}
  };
  el('mix-play').onclick=async()=>{if(!mixCandidate)return;try{
    const buffer=asAudioBuffer(mixCandidate.channels,mixCandidate.rate);
    await playBuffer(buffer,0,buffer.duration,1,{allowLoop:false});
    mixNotice('Playing multitrack mix.');}catch(err){mixNotice(err.message);}
  };
  el('mix-export').onclick=()=>{if(!mixCandidate)return;
    const blob=encodeWav(mixCandidate.channels,mixCandidate.rate,24);
    download(blob,'pulse-multitrack-mix.wav');mixNotice('Multitrack mix exported as stereo WAV.');};
  renderMixRows();
  updateSeparationAvailability();
  return {invalidateMix,clearQuickMix,showFixAdvice,updateSeparationAvailability,eqPreviewOptions,previewEqRange,startSpectrum:beginLiveSpectrum,onWorkspaceChanged(){cancelSeparation('');clearQuickMix();el('mix-fix-advice').hidden=true;},
    reset(){mixTracks=[];mixCandidate=null;clearQuickMix();renderMixRows();}};
}
