// Additional PULSE tools. All audio remains local to this browser session.
function initExtraTools({el,tools,channels,asAudioBuffer,playBuffer,stopPreview,workspace,
  workingChanged,download,filename,status,decodeLocalAudio,audioFileError,encodeWav}){
  const eqState={bands:makeEqBands(8),gainDb:0};
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
  let dragBand=-1,spectrumRaf=0,spectrumStamp=0,selectedBand=0;
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
    node('path',{d,fill:'none',stroke:'#ffe15b','stroke-width':3.2,'stroke-linejoin':'round'});
    eqState.bands.forEach((band,index)=>{
      if(!band.enabled)return;
      const selected=index===selectedBand;
      const circle=node('circle',{cx:xOf(Math.min(hzMax,band.frequency)),cy:yOf(band.gain),r:selected?9:6.5,
        fill:selected?'#ffec91':'#252525',stroke:'#ffe15b','stroke-width':selected?2.5:1.8,
        role:'button',tabindex:0,'aria-label':'Select and drag EQ band '+(index+1)});
      circle.addEventListener('click',()=>{selectedBand=index;refreshEq(true);});
      circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedBand=index;refreshEq(true);}});
      circle.addEventListener('pointerdown',event=>{
        event.preventDefault();
        dragBand=index;selectedBand=index;
        svg.setPointerCapture(event.pointerId);refreshEq(false);
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
    refreshEq(false);
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
      if(found){ctx.strokeStyle='rgba(157,222,251,.90)';ctx.lineWidth=1.4;ctx.stroke();}
    }
    spectrumRaf=requestAnimationFrame(drawLiveSpectrum);
  }
  function beginLiveSpectrum(){if(!spectrumRaf)spectrumRaf=requestAnimationFrame(drawLiveSpectrum);}
  el('eq-spectrum').onchange=()=>{if(el('eq-spectrum').checked)beginLiveSpectrum();else{
    cancelAnimationFrame(spectrumRaf);spectrumRaf=0;
    const canvas=el('eq-live-spectrum');canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
  }};
  function eqNodeUpdate(){
    if(tools.eqOutputGain&&tools.context){
      const bypass=el('eq-bypass').checked;
      tools.eqOutputGain.gain.setTargetAtTime(bypass?1:10**(eqState.gainDb/20),tools.context.currentTime,.012);
    }
    if(!tools.eqNodes||tools.eqNodes.length!==eqState.bands.length)return;
    for(let i=0;i<tools.eqNodes.length;i++){
      const n=tools.eqNodes[i],b=eqState.bands[i];
      if(!b)continue;const now=tools.context.currentTime;
      n.type=b.enabled&&!el('eq-bypass').checked?b.type:'allpass';
      n.frequency.setTargetAtTime(Math.min(b.frequency,tools.context.sampleRate*.49),now,.016);
      n.Q.setTargetAtTime(b.q,now,.016);n.gain.setTargetAtTime(b.gain,now,.016);
    }
  }
  function refreshEq(rebuild=false){
    if(rebuild||!eqInputs.querySelector('[data-active-band]')){
      eqInputs.replaceChildren();
      const chooser=document.createElement('div');chooser.className='eq-band-picker';chooser.setAttribute('role','group');
      chooser.setAttribute('aria-label','Choose equalizer band');
      eqState.bands.forEach((band,i)=>{
        const button=document.createElement('button');button.type='button';
        button.textContent=String(i+1);button.setAttribute('aria-label','Select EQ band '+(i+1));
        button.setAttribute('aria-pressed',String(i===selectedBand));
        button.onclick=()=>{selectedBand=i;refreshEq(true);};chooser.append(button);
      });
      const heading=document.createElement('div');heading.className='eq-band-selected';
      const selected=document.createElement('strong');selected.dataset.activeBand='';
      heading.append(document.createTextNode('SELECTED FILTER'),selected);
      const row=document.createElement('div');row.className='pulse-eq-band';
      row.innerHTML='<label><input type="checkbox" name="enable"> BAND ENABLED</label>'+
       '<label>Filter <select name="type"><option value="peaking">Bell</option><option value="lowshelf">Low shelf</option><option value="highshelf">High shelf</option><option value="highpass">High pass</option><option value="lowpass">Low pass</option><option value="notch">Notch</option></select></label>'+
       '<label>Frequency <span data-value="freq"></span><input type="range" name="freq" min="20" max="20000" step="1"></label>'+
       '<label>Gain <span data-value="gain"></span><input type="range" name="gain" min="-12" max="12" step=".1"></label>'+
       '<label>Q <span data-value="q"></span><input type="range" name="q" min=".25" max="10" step=".05"></label>';
      for(const [name,field] of [['enable','enabled'],['type','type'],['freq','frequency'],['gain','gain'],['q','q']]){
        row.querySelector('[name="'+name+'"]').addEventListener('input',event=>{
          const band=eqState.bands[selectedBand];
          band[field]=name==='enable'?event.target.checked:name==='type'?event.target.value:Number(event.target.value);
          refreshEq(false);eqNotice('Band '+(selectedBand+1)+' changed. Preview to hear the result.');
        });
      }
      eqInputs.append(chooser,heading,row);
    }
    const b=eqState.bands[selectedBand],row=eqInputs.querySelector('.pulse-eq-band');
    eqInputs.querySelector('[data-active-band]').textContent=(selectedBand+1)+' / '+eqState.bands.length;
    [...eqInputs.querySelectorAll('.eq-band-picker button')].forEach((button,i)=>
      button.setAttribute('aria-pressed',String(i===selectedBand)));
    for(const [name,value] of [['freq',b.frequency],['gain',b.gain],['q',b.q]]){
      const input=row.querySelector('[name="'+name+'"]');
      if(document.activeElement!==input)input.value=String(value);
    }
    row.querySelector('[name="enable"]').checked=b.enabled;
    row.querySelector('[name="type"]').value=b.type;
    row.querySelector('[data-value="freq"]').textContent=Math.round(b.frequency)+' Hz';
    row.querySelector('[data-value="gain"]').textContent=b.gain.toFixed(1)+' dB';
    row.querySelector('[data-value="q"]').textContent=b.q.toFixed(2);
    status('eq-active-readout','BAND '+(selectedBand+1)+' / '+eqState.bands.length+' · '+b.type.toUpperCase()+
      ' · '+Math.round(b.frequency)+' Hz · '+b.gain.toFixed(1)+' dB · Q '+b.q.toFixed(2));
    drawEqGraph();eqNodeUpdate();
  }
  function changeBandCount(count){
    if(tools.playing)stopPreview();
    eqState.bands=makeEqBands(count);selectedBand=0;
    el('eq-preset').value='flat';
    status('eq-character-description','Select a curve preset or adjust filters individually.');
    refreshEq(true);eqNotice(count+'-band parametric EQ ready.');
  }
  el('eq-band-count').addEventListener('change',e=>changeBandCount(Number(e.target.value)));
  el('eq-preset').addEventListener('change',()=>{
    const selected=presets[el('eq-preset').value]||presets.flat;
    if(eqState.bands.length===8){
      selected.forEach((band,i)=>Object.assign(eqState.bands[i],band));
    }else{
      // Transfer the preset to whichever editable band lies nearest in log frequency.
      for(const band of eqState.bands){band.gain=0;band.enabled=true;}
      for(const band of selected.filter(b=>b.enabled&&Math.abs(b.gain)>.01)){
        const index=selectClosestBand(eqState.bands,band.frequency);
        if(index>=0){eqState.bands[index].gain=Math.max(-12,Math.min(12,eqState.bands[index].gain+band.gain));}
      }
    }
    const mode=CLASSIC_EQ_MODES[el('eq-preset').value];
    status('eq-character-description',mode?mode.description+' · PULSE-designed filters, not hardware emulation.':'Adjust the eight bands or choose a Classic EQ character.');
    refreshEq(true);
  });
  el('eq-output-gain').addEventListener('input',()=>{
    eqState.gainDb=Number(el('eq-output-gain').value);
    status('eq-output-label',eqState.gainDb.toFixed(1)+' dB');
    eqNodeUpdate();
  });
  function syncAB(){
    const bypass=el('eq-bypass').checked;
    el('eq-ab-toggle').textContent=bypass?'A · ORIGINAL':'B · EQ ON';
    el('eq-ab-toggle').setAttribute('aria-pressed',String(!bypass));
    eqNotice(bypass?'A / ORIGINAL · filters and output gain bypassed.':'B / EQ · processing enabled.');
    refreshEq();
  }
  el('eq-ab-toggle').onclick=()=>{
    el('eq-bypass').checked=!el('eq-bypass').checked;syncAB();
  };
  el('eq-bypass').addEventListener('change',syncAB);
  el('eq-reset').onclick=()=>{
    eqState.bands=makeEqBands(Number(el('eq-band-count').value));selectedBand=0;
    eqState.gainDb=0;el('eq-output-gain').value='0';status('eq-output-label','0.0 dB');
    el('eq-bypass').checked=false;el('eq-preset').value='flat';refreshEq(true);syncAB();
  };
  function eqPreviewOptions(){
    // Always create the full filter chain, even in A/original mode.
    // Live A/B can then switch allpass <-> filter without restarting audio.
    return {allowLoop:false,
      eqBands:readEq().map(b=>({...b,enabled:!el('eq-bypass').checked&&b.enabled})),
      eqGainDb:el('eq-bypass').checked?0:eqState.gainDb};
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
  refreshEq(true);
  syncAB();

  function clearQuickMix(){quickMixCandidate=null;el('mix-quick-preview').disabled=true;el('mix-quick-send').disabled=true;el('mix-stereo-results').hidden=true;}
  el('mix-intensity').oninput=()=>{status('mix-intensity-label',el('mix-intensity').value+'%');clearQuickMix();};
  el('mix-character').onchange=clearQuickMix;
  el('mix-quick-generate').onclick=()=>{
    if(!tools.buffer){status('mix-quick-report','Load an audio track in the shared workspace first.');return;}
    try{
      const initial=analyzeStereoQuickFix(channels(tools.buffer),tools.buffer.sampleRate);
      const result=renderStereoQuickFix(channels(tools.buffer),tools.buffer.sampleRate,{
        character:el('mix-character').value,intensity:Number(el('mix-intensity').value)});
      quickMixCandidate={input:tools.buffer,result,buffer:asAudioBuffer(result.channels,tools.buffer.sampleRate)};
      el('mix-quick-preview').disabled=false;el('mix-quick-send').disabled=false;el('mix-stereo-results').hidden=false;
      status('mix-quick-report','Peak '+initial.signal.peakDb.toFixed(1)+' dBFS · RMS '+initial.signal.rmsDb.toFixed(1)+' dBFS · '+(initial.warnings.join(' · ')||'No critical issues')+' · Correction: '+(result.changes.length?result.changes.map(c=>
        c.frequency+' Hz '+c.gainDb.toFixed(1)+' dB').join(' · '):
        'No corrective EQ needed.'));
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
    if(tools.buffer){const result=analyzeStereoQuickFix(channels(tools.buffer),tools.buffer.sampleRate);status('mix-quick-report','Peak '+result.signal.peakDb.toFixed(1)+' dBFS · '+(result.warnings.join(' · ')||'No critical issues flagged.'));}
  }
  function invalidateMix(){mixCandidate=null;el('mix-play').disabled=true;el('mix-export').disabled=true;el('mix-send-master').disabled=true;el('mix-multitrack-results').hidden=true;}
  function makeStemAutomationGraph(stem){
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=105;canvas.tabIndex=0;
    canvas.className='stem-automation-graph';
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','Volume automation for '+stem.name+'. Click to add a keyframe; drag to move. Shift-click to remove.');
    let drag=-1,selected=0;
    const duration=stem.channels[0].length/stem.rate;
    if(!stem.automation?.length)stem.automation=[{time:0,gainDb:0},{time:duration,gainDb:0}];
    const x=t=>8+t/Math.max(.001,duration)*584;
    const y=db=>90-(db+24)/30*74;
    function draw(){
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,600,105);
      ctx.fillStyle='#151716';ctx.fillRect(0,0,600,105);
      ctx.strokeStyle='#4d5556';ctx.beginPath();ctx.moveTo(0,y(0));ctx.lineTo(600,y(0));ctx.stroke();
      const wave=stem.channels[0],w=584;
      ctx.fillStyle='#667778';
      for(let i=0;i<w;i++){
        const from=Math.floor((i/w)*wave.length),to=Math.min(wave.length,Math.max(from+1,Math.ceil((i+1)/w*wave.length)));
        let p=0;for(let j=from;j<to;j+=Math.max(1,Math.ceil((to-from)/32)))p=Math.max(p,Math.abs(wave[j]));
        const amp=Math.min(16,p*19);
        ctx.fillRect(8+i,45-amp,1,amp*2);
      }
      ctx.beginPath();
      for(let i=0;i<stem.automation.length;i++){
        const k=stem.automation[i];
        if(i)ctx.lineTo(x(k.time),y(k.gainDb));else ctx.moveTo(x(k.time),y(k.gainDb));
      }
      ctx.strokeStyle='#ffe15b';ctx.lineWidth=2;ctx.stroke();
      stem.automation.forEach((k,i)=>{
        ctx.beginPath();ctx.arc(x(k.time),y(k.gainDb),i===selected?5:3.5,0,Math.PI*2);
        ctx.fillStyle=i===selected?'#fff2b0':'#ffe15b';ctx.fill();
      });
    }
    const values=event=>{
      const bounds=canvas.getBoundingClientRect();
      const px=Math.max(0,Math.min(1,(event.clientX-bounds.left)/Math.max(1,bounds.width)));
      const py=Math.max(0,Math.min(1,(event.clientY-bounds.top)/Math.max(1,bounds.height)));
      return {time:Math.round(px*duration*100)/100,
        gainDb:Math.round((6-30*py)*10)/10};
    };
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      const at=values(event);
      let nearest=-1,best=Infinity;
      stem.automation.forEach((p,i)=>{
        const distance=Math.hypot((p.time-at.time)/duration*600,(p.gainDb-at.gainDb)/30*105);
        if(distance<best){best=distance;nearest=i;}
      });
      if(event.shiftKey&&best<15&&nearest>=0&&stem.automation.length>2){
        stem.automation.splice(nearest,1);selected=0;invalidateMix();draw();return;
      }
      if(best>=14){
        if(stem.automation.length>=32){mixNotice('Maximum 32 manual keyframes.');return;}
        stem.automation.push(at);stem.automation.sort((a,b)=>a.time-b.time);
        nearest=stem.automation.indexOf(at);
      }
      selected=nearest;drag=nearest;canvas.setPointerCapture(event.pointerId);invalidateMix();draw();
    });
    canvas.addEventListener('pointermove',event=>{
      if(drag<0)return;
      const point=values(event);
      const fixed=drag===0||drag===stem.automation.length-1;
      if(fixed)point.time=drag===0?0:duration;
      else point.time=Math.max(stem.automation[drag-1].time+.01,Math.min(stem.automation[drag+1].time-.01,point.time));
      Object.assign(stem.automation[drag],point);invalidateMix();draw();
    });
    canvas.addEventListener('pointerup',()=>{drag=-1;});
    canvas.addEventListener('pointercancel',()=>{drag=-1;});
    canvas.addEventListener('keydown',event=>{
      const point=stem.automation[selected];if(!point)return;
      const delta=event.shiftKey?1:.1;
      if(event.key==='ArrowUp')point.gainDb=Math.min(6,point.gainDb+delta);
      else if(event.key==='ArrowDown')point.gainDb=Math.max(-24,point.gainDb-delta);
      else if(event.key==='Delete'&&stem.automation.length>2&&selected>0&&selected<stem.automation.length-1){
        stem.automation.splice(selected,1);selected=0;
      }else return;
      event.preventDefault();invalidateMix();draw();
    });
    draw();return canvas;
  }
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
      const automationLabel=document.createElement('p');
      automationLabel.textContent='VOLUME AUTOMATION · click to add · drag to change level · Shift+click to remove';
      row.append(automationLabel,makeStemAutomationGraph(stem));
      list.append(row);
    }
    el('mix-balance').disabled=mixTracks.length<2||mixLoading;
    el('mix-render').disabled=mixTracks.length<2||mixLoading;
    el('mix-auto-duck').disabled=mixTracks.length<2||mixLoading;
    for(const id of ['mix-duck-source','mix-duck-target']){
      const select=el(id),previous=select.value;select.replaceChildren();
      mixTracks.forEach((stem,i)=>{
        const option=document.createElement('option');
        option.value=String(i);option.textContent=stem.name;select.append(option);
      });
      if([...select.options].some(o=>o.value===previous))select.value=previous;
      else if(id==='mix-duck-target'&&mixTracks.length>1)select.value='1';
    }
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
  el('mix-auto-duck').onclick=()=>{
    const sourceIndex=Number(el('mix-duck-source').value),targetIndex=Number(el('mix-duck-target').value);
    if(sourceIndex===targetIndex){mixNotice('Choose different voice and music stems.');return;}
    const source=mixTracks[sourceIndex],target=mixTracks[targetIndex];
    if(!source||!target)return;
    target.automation=generateDuckingAutomation(source.channels,source.rate,{depthDb:-11});
    invalidateMix();renderMixRows();
    mixNotice('Voice-controlled music ducking generated. Edit the yellow keyframe curve before rendering.');
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
      el('mix-play').disabled=false;el('mix-export').disabled=false;el('mix-send-master').disabled=false;el('mix-multitrack-results').hidden=false;
      mixNotice('Mix ready · '+mixTracks.length+' stems · peak '+mixCandidate.peakDb.toFixed(1)+' dBFS · protection '+mixCandidate.attenuationDb.toFixed(1)+' dB.');
    }catch(error){invalidateMix();mixNotice(error.message||'Could not render stems.');}
  };
  el('mix-play').onclick=async()=>{if(!mixCandidate)return;try{
    const buffer=asAudioBuffer(mixCandidate.channels,mixCandidate.rate);
    await playBuffer(buffer,0,buffer.duration,1,{allowLoop:false});
    mixNotice('Playing multitrack mix.');}catch(err){mixNotice(err.message);}
  };
  el('mix-send-master').onclick=()=>{
    if(!mixCandidate)return;
    try{
      const buffer=asAudioBuffer(mixCandidate.channels,mixCandidate.rate);
      workspace.apply(buffer);workingChanged();invalidateMix();
      el('tab-master').click();
      status('master-status','Multitrack mix loaded. Select your character and generate a master.');
    }catch(err){mixNotice(err.message||'Could not transfer mix to Master.');}
  };
  el('mix-export').onclick=()=>{if(!mixCandidate)return;
    const blob=encodeWav(mixCandidate.channels,mixCandidate.rate,24);
    download(blob,'pulse-multitrack-mix.wav');mixNotice('Multitrack mix exported as stereo WAV.');};
  for(const mode of ['stereo','stems']){
    el('mix-mode-'+mode).onclick=()=>{
      const stems=mode==='stems';
      el('mix-pane-stereo').hidden=stems;
      el('mix-pane-stems').hidden=!stems;
      el('mix-mode-stereo').setAttribute('aria-pressed',String(!stems));
      el('mix-mode-stems').setAttribute('aria-pressed',String(stems));
    };
  }
  renderMixRows();
  updateSeparationAvailability();
  return {invalidateMix,clearQuickMix,showFixAdvice,updateSeparationAvailability,eqPreviewOptions,previewEqRange,startSpectrum:beginLiveSpectrum,onWorkspaceChanged(){cancelSeparation('');clearQuickMix();el('mix-fix-advice').hidden=true;},
    reset(){mixTracks=[];mixCandidate=null;clearQuickMix();renderMixRows();}};
}
