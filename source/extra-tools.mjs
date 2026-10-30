// Additional PULSE tools. All audio remains local to this browser session.
function initExtraTools({el,tools,channels,asAudioBuffer,playBuffer,stopPreview,workspace,
  workingChanged,download,filename,status,decodeLocalAudio,audioFileError,encodeWav}){
  const eqState={bands:EQ_DEFAULT_BANDS.map(b=>({...b})),gainDb:0};
  let mixTracks=[],mixCandidate=null,mixLoading=false;
  const eqNotice=text=>status('eq-status',text);
  const mixNotice=text=>status('mix-status',text);
  const eqInputs=el('eq-bands');
  let dragBand=-1;
  const presets={
    flat:EQ_DEFAULT_BANDS.map(x=>({...x})),
    vocal:EQ_DEFAULT_BANDS.map((x,i)=>({...x,enabled:true,gain:[0,0,-2,2.5,-1,1][i],
      frequency:i===0?85:x.frequency})),
    bass:EQ_DEFAULT_BANDS.map((x,i)=>({...x,enabled:i!==0,gain:[0,2.5,-2,0,0,0][i]})),
    air:EQ_DEFAULT_BANDS.map((x,i)=>({...x,gain:i===5?2.5:0})),
    clean:EQ_DEFAULT_BANDS.map((x,i)=>({...x,enabled:true,
      frequency:i===0?45:x.frequency,gain:0}))
  };
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
    node('path',{d,fill:'none',stroke:'#e8493e','stroke-width':3,'stroke-linejoin':'round'});
    eqState.bands.forEach((band,index)=>{
      if(!band.enabled)return;
      const circle=node('circle',{cx:xOf(Math.min(hzMax,band.frequency)),cy:yOf(band.gain),r:7,fill:'#eee',stroke:'#e8493e','stroke-width':2,role:'button',tabindex:0,'aria-label':'Band '+(index+1)+'; drag to change frequency and gain'});
      circle.addEventListener('pointerdown',event=>{
        event.preventDefault();
        dragBand=index;
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
    if(!['highpass','lowpass'].includes(band.type))band.gain=Math.round((12-24*ny)*10)/10;
    refreshEq();
  });
  el('eq-response-graph').addEventListener('pointerup',()=>{dragBand=-1;});
  el('eq-response-graph').addEventListener('pointercancel',()=>{dragBand=-1;});
  function eqNodeUpdate(){
    if(!tools.eqNodes)return;
    for(let i=0;i<tools.eqNodes.length;i++){
      const n=tools.eqNodes[i],b=eqState.bands[i];
      if(!b)continue;const now=tools.context.currentTime;
      n.type=b.enabled&&!el('eq-bypass').checked?b.type:'allpass';
      n.frequency.setTargetAtTime(Math.min(b.frequency,tools.context.sampleRate*.49),now,.016);
      n.Q.setTargetAtTime(b.q,now,.016);n.gain.setTargetAtTime(b.gain,now,.016);
    }
  }
  function refreshEq(){
    drawEqGraph();
    const rows=eqInputs.querySelectorAll('[data-band]');
    for(const [i,row] of [...rows].entries()){
      const b=eqState.bands[i];
      row.querySelector('[data-value="freq"]').textContent=Math.round(b.frequency)+' Hz';
      row.querySelector('[data-value="gain"]').textContent=b.gain.toFixed(1)+' dB';
      row.querySelector('[data-value="q"]').textContent=b.q.toFixed(2);
      row.querySelector('[name="freq"]').value=String(b.frequency);
      row.querySelector('[name="gain"]').value=String(b.gain);
      row.querySelector('[name="q"]').value=String(b.q);
      row.querySelector('[name="enable"]').checked=b.enabled;
    }
    eqNodeUpdate();
  }
  eqState.bands.forEach((band,i)=>{
    const row=document.createElement('div');row.className='pulse-eq-band';row.dataset.band=String(i);
    row.innerHTML='<label><input type="checkbox" name="enable"> BAND '+(i+1)+'</label>'+
    '<label>Frequency <span data-value="freq"></span><input type="range" name="freq" min="20" max="20000" step="1"></label>'+
    '<label>Gain <span data-value="gain"></span><input type="range" name="gain" min="-12" max="12" step=".1"></label>'+
    '<label>Q <span data-value="q"></span><input type="range" name="q" min=".25" max="10" step=".05"></label>';
    eqInputs.append(row);
    for(const [name,field] of [['enable','enabled'],['freq','frequency'],['gain','gain'],['q','q']]){
      row.querySelector('[name="'+name+'"]').addEventListener('input',event=>{
        band[field]=name==='enable'?event.target.checked:Number(event.target.value);refreshEq();
        eqNotice('EQ settings changed. Preview live or export to render.');
      });
    }
  });
  el('eq-preset').addEventListener('change',()=>{
    const selected=presets[el('eq-preset').value]||presets.flat;
    selected.forEach((band,i)=>Object.assign(eqState.bands[i],band));
    refreshEq();
  });
  el('eq-output-gain').addEventListener('input',()=>{
    eqState.gainDb=Number(el('eq-output-gain').value);
    status('eq-output-label',eqState.gainDb.toFixed(1)+' dB');
    if(tools.eqOutputGain&&tools.context)tools.eqOutputGain.gain.setTargetAtTime(10**(eqState.gainDb/20),tools.context.currentTime,.015);
  });
  el('eq-bypass').addEventListener('change',()=>{refreshEq();eqNotice(el('eq-bypass').checked?'Bypass enabled.':'EQ active.');});
  el('eq-reset').onclick=()=>{
    EQ_DEFAULT_BANDS.forEach((band,i)=>Object.assign(eqState.bands[i],band));
    eqState.gainDb=0;el('eq-output-gain').value='0';status('eq-output-label','0.0 dB');
    el('eq-bypass').checked=false;el('eq-preset').value='flat';refreshEq();
  };
  async function eqAction(action){
    if(!tools.buffer){eqNotice('Load audio in the shared workspace first.');return;}
    try{
      if(action==='preview'){
        await playBuffer(tools.buffer,tools.playhead,tools.buffer.duration,1,
          {allowLoop:true,eqBands:el('eq-bypass').checked?[]:readEq(),eqGainDb:eqState.gainDb});
        eqNotice('Live EQ preview. Adjust filters while playing.');
        return;
      }
      eqNotice('Rendering EQ locally…');
      const source=channels(tools.buffer);
      const result=renderEqualizer(source,tools.buffer.sampleRate,
        el('eq-bypass').checked?[]:eqState.bands,eqState.gainDb);
      const buffer=asAudioBuffer(result,tools.buffer.sampleRate);
      if(action==='apply'){workspace.apply(buffer);workingChanged();eqNotice('EQ applied to workspace. Undo is available.');}
      else if(action==='export'){const blob=encodeWav(result,tools.buffer.sampleRate,24);download(blob,filename('equalized.wav'));eqNotice('Equalized WAV exported.');}
    }catch(error){eqNotice(error.message||'Equalizer failed.');}
  }
  el('eq-preview').onclick=()=>void eqAction('preview');
  el('eq-apply').onclick=()=>void eqAction('apply');
  el('eq-export').onclick=()=>void eqAction('export');
  refreshEq();

  function invalidateMix(){mixCandidate=null;el('mix-play').disabled=true;el('mix-export').disabled=true;}
  function renderMixRows(){
    const list=el('mix-stems');list.replaceChildren();
    for(const [i,stem] of mixTracks.entries()){
      const row=document.createElement('div');row.className='pulse-mix-row';
      const head=document.createElement('div');head.className='pulse-mix-head';
      const title=document.createElement('strong');title.textContent=(i+1)+' · '+stem.name;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
      remove.onclick=()=>{mixTracks.splice(i,1);invalidateMix();renderMixRows();mixNotice(mixTracks.length+' stems loaded.');};
      head.append(title,remove);row.append(head);
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
    mixNotice('Conservative gain suggestions applied. Listen and adjust each stem before export.');
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
  return {invalidateMix,reset(){mixTracks=[];mixCandidate=null;renderMixRows();}};
}
