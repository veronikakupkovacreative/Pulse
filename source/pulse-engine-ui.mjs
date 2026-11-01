import {ThePulseStudioEngine} from './pulse-engine.mjs';

// The UI is attached to the existing AI MIX workspace, not a parallel audio editor.
// All processing is local; audio is only committed through the shared undoable workspace.
export function initPulseEngineUI(project,encodeWav){
  const get=id=>document.getElementById(id),root=get('pulse-engine-panel');
  if(!root)return null;
  const select=get('engine-effect'),strength=get('engine-strength'),profile=get('engine-profile');
  const seconds=get('engine-seconds'),status=get('engine-status'),canvas=get('engine-viz');
  const btns=['engine-preview','engine-apply','engine-export'].map(get);
  const labels=Object.freeze({
    bass:'Bass Booster · 150 Hz low shelf',rumble:'Rumble Filter · high-pass',
    voice:'Voice Focus · EQ + compression',mix:'Stereo Mix · EQ + compression',
    master:'Master Tone · compressor preview, not true-peak mastering',
    'fade-in':'Fade In · gain automation','fade-out':'Fade Out · gain automation',
    volume:'Output Volume · gain','speed':'Playback Rate · changes pitch',
    vocals:'Center Vocals · approximation, not neural stems',
    instrumental:'Center Instrumental · approximation, not neural stems',
    reverse:'Reverse · sample-exact',trim:'Trim Silence · 50 ms padding',
    normalize:'Normalize · target sample peak'
  });
  const profiles={
    mix:[['balanced','Balanced'],['vocals','Vocals'],['drums','Drums']],
    master:[['spotify','Streaming tone'],['apple_music','Gentle tone'],['club_edm','Club tone']]
  };
  const slider={
    bass:[0,12,8,1,'Boost',' dB'],rumble:[20,240,80,5,'Cutoff',' Hz'],
    voice:[0,8,4,.5,'Presence',' dB'],mix:[0,12,4,.5,'Output trim',' dB'],
    master:[0,0,0,1,'',''], 'fade-in':[0,0,0,1,'',''],'fade-out':[0,0,0,1,'',''],
    volume:[0,150,100,5,'Level','%'],speed:[50,200,100,5,'Playback speed','%'],
    vocals:[0,0,0,1,'',''],instrumental:[0,0,0,1,'',''],
    reverse:[0,0,0,1,'',''],trim:[-80,-20,-40,2,'Silence threshold',' dBFS'],
    normalize:[-18,0,-1,.5,'Target peak',' dBFS']
  };
  let renderPromise=null,candidate=null,preview=null,previewCtx=null,visualizer=null,revision=0;
  const errorText=e=>e?.message||'Processing failed.';
  function stopPreview(){
    visualizer?.stop();visualizer?.disconnect();visualizer=null;
    if(preview){preview.onended=null;try{preview.stop();}catch{}preview.disconnect();preview=null;}
    const closing=previewCtx;previewCtx=null;if(closing)void closing.close().catch(()=>{});
  }
  function invalidate(){
    revision++;candidate=null;stopPreview();status.textContent='Settings updated. Preview to hear the result.';
  }
  function sync(){
    const mode=select.value,settings=slider[mode],active=Boolean(settings&&settings[1]!==settings[0]);
    get('engine-strength-row').hidden=!active;
    get('engine-strength-label').textContent=settings?.[4]||'Amount';
    if(active){strength.min=String(settings[0]);strength.max=String(settings[1]);
      strength.step=String(settings[3]);strength.value=String(settings[2]);}
    const options=profiles[mode];
    get('engine-profile-row').hidden=!options;
    profile.replaceChildren(...(options||[]).map(([value,label])=>new Option(label,value)));
    get('engine-seconds-row').hidden=!['fade-in','fade-out'].includes(mode);
    get('engine-description').textContent=labels[mode]||'Local audio processing';
    get('engine-warning').hidden=!['master','vocals','instrumental','speed','voice'].includes(mode);
    get('engine-warning').textContent=mode==='master'?'This is a compressor tone preview, not a true-peak delivery master. Use Smart Master for release exports.':
      mode==='speed'?'Changing playback rate also changes pitch. Use Pitch & Time for pitch-preserving stretching.':
      mode==='voice'?'Voice Focus enhances clarity but does not remove ambient noise or isolate voices.':
      'Center-channel extraction is an approximation. Use the existing Stem Splitter for actual model-based separation.';
    updateValue();invalidate();
  }
  function updateValue(){
    const mode=select.value,settings=slider[mode];
    get('engine-strength-value').textContent=strength.value+(settings?.[5]||'');
    if(mode==='fade-in'||mode==='fade-out')get('engine-seconds-value').textContent=Number(seconds.value).toFixed(1)+' s';
  }
  function settingsKey(source){
    return [source,select.value,strength.value,profile.value,seconds.value,project.snapshot().revision];
  }
  function isSame(a,b){return a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);}
  function toChannels(buffer){return Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));}
  async function process(source,mode,amount,preset,fadeLength){
    if(source.numberOfChannels>2)throw Error('Effects currently support mono or stereo audio.');
    const local=new ThePulseStudioEngine();
    if(mode==='reverse')return local.reverseAudioBuffer(source);
    if(mode==='trim')return local.removeSilenceBuffer(source,amount,50);
    if(mode==='normalize')return local.normalizeAudioBuffer(source,amount);
    if(mode==='vocals'||mode==='instrumental'){
      const pair=local.separateVocalStems(source);
      return pair[mode];
    }
    const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(!Offline)throw Error('Offline Audio is unavailable in this browser.');
    const ratio=mode==='speed'?amount/100:1;
    const length=Math.max(1,Math.ceil(source.length/ratio));
    if(length*source.numberOfChannels*4>240*1024*1024)
      throw Error('Processing needs too much browser memory. Use a shorter clip.');
    const offline=new Offline(source.numberOfChannels,length,source.sampleRate);
    const fx=new ThePulseStudioEngine(offline);
    const player=offline.createBufferSource();player.buffer=source;
    let processor;
    switch(mode){
      case 'bass':processor=fx.createBassBooster(amount);break;
      case 'rumble':processor=fx.createNoiseReductionFilter(amount);break;
      case 'voice':processor=fx.createAIVoiceCleaner();
        processor.presence.gain.setValueAtTime(amount,offline.currentTime);break;
      case 'mix':processor=fx.createAIMixEngine();processor.applyProfile(preset);break;
      case 'master':processor=fx.createAIMasteringEngine();processor.applyPreset(preset);break;
      case 'fade-in':case 'fade-out':
        processor={input:fx.createVolumeNode(1),output:null};
        fx.applyFade(processor.input,Math.min(source.duration,fadeLength),mode==='fade-in',
          mode==='fade-in'?0:Math.max(0,source.duration-fadeLength));
        break;
      case 'volume':processor=fx.createVolumeNode(amount/100);break;
      case 'speed':fx.setPlaybackRate(player,ratio);break;
      default:throw Error('Unsupported engine effect.');
    }
    if(processor?.input){
      player.connect(processor.input);
      (processor.output||processor.input).connect(offline.destination);
    }else if(processor){player.connect(processor);processor.connect(offline.destination);}
    else player.connect(offline.destination);
    player.start(0);
    return offline.startRendering();
  }
  async function render(){
    const source=project.snapshot().working;
    if(!source)throw Error('Load audio in the shared waveform workspace first.');
    if(!source.length)throw Error('This audio file is empty.');
    if(source.duration>180&& !['reverse','trim','normalize'].includes(select.value))
      throw Error('This processing mode supports clips up to 3 minutes. Trim a section first.');
    const key=settingsKey(source);
    if(candidate&&isSame(key,candidate.key))return candidate.buffer;
    if(renderPromise)throw Error('Processing in progress.');
    const ticket=revision,mode=select.value,amount=Number(strength.value),preset=profile.value,fadeLength=Number(seconds.value);
    if(source.length*source.numberOfChannels*4>240*1024*1024)
      throw Error('Audio exceeds the available processing memory. Use a shorter file.');
    status.textContent='Rendering '+(labels[mode]||mode)+'…';
    renderPromise=process(source,mode,amount,preset,fadeLength);
    try{
      const buffer=await renderPromise;
      if(ticket!==revision||source!==project.snapshot().working)throw Error('Settings or workspace changed while rendering. Retry.');
      candidate={key,buffer};status.textContent='Ready · '+buffer.duration.toFixed(2)+' s · '+buffer.numberOfChannels+' channel(s).';
      return buffer;
    }finally{renderPromise=null;}
  }
  async function action(which){
    if(renderPromise)return;
    btns.forEach(b=>b.disabled=true);
    try{
      stopPreview();
      const buffer=await render();
      if(which==='preview'){
        const Context=window.AudioContext||window.webkitAudioContext;
        if(!Context)throw Error('Audio playback is not supported.');
        previewCtx=new Context();
        const player=previewCtx.createBufferSource();player.buffer=buffer;
        const gain=previewCtx.createGain();gain.gain.value=.85;
        player.connect(gain);gain.connect(previewCtx.destination);
        const vizEngine=new ThePulseStudioEngine(previewCtx);
        visualizer=vizEngine.createVisualizer(gain,canvas);
        preview=player;player.onended=()=>{visualizer?.stop();status.textContent='Preview complete. Apply or export to keep the change.';};
        await previewCtx.resume();visualizer.start();player.start(0);
        status.textContent='Previewing · original project is unchanged.';
      }else if(which==='apply'){
        if(project.snapshot().working!==candidate.key[0])throw Error('Workspace changed. Render again.');
        project.workspace.apply(buffer);
        window.dispatchEvent(new Event('pulse:advanced-applied'));
        invalidate();
        status.textContent='Applied to shared workspace. Undo is available.';
      }else if(which==='export'){
        const wav=encodeWav(toChannels(buffer),buffer.sampleRate,24);
        const url=URL.createObjectURL(wav),link=document.createElement('a');
        link.href=url;link.download='pulse-engine-'+select.value+'.wav';
        document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),45000);
        status.textContent='24-bit WAV exported. Workspace unchanged.';
      }
    }catch(e){status.textContent=errorText(e);}
    finally{btns.forEach(b=>b.disabled=false);}
  }
  select.addEventListener('change',sync);
  strength.addEventListener('input',()=>{updateValue();invalidate();});
  seconds.addEventListener('input',()=>{updateValue();invalidate();});
  profile.addEventListener('change',invalidate);
  get('engine-stop').addEventListener('click',()=>{stopPreview();status.textContent='Preview stopped.';});
  for(const task of ['preview','apply','export'])get('engine-'+task).addEventListener('click',()=>void action(task));
  project.subscribe(({type})=>{if(type==='load'||type==='clear'){invalidate();status.textContent='Load audio to use the engine.';}});
  window.addEventListener('pagehide',stopPreview);
  sync();return {stopPreview};
}
