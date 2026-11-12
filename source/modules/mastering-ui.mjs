/** A single, non-destructive interface for AI Mix & Master and Smart Master. */
import {workspace as w} from './workspace.mjs';
import {encodeWav} from './dsp.mjs';
import {MASTER_PRESETS,masteringSettings} from './mastering-engine.mjs';
import {runMasteringWorker} from './mastering-client.mjs';
import {mountMusicGPTMasteringCloud} from './musicgpt-mastering.mjs';
import {interpretMasteringRequest,MASTER_ASSISTANT_EXAMPLES,MASTER_BANDS} from './mastering-advanced.mjs';

const rows=[
  ['target','TARGET LOUDNESS',-20,-8,.5,'LUFS'],
  ['ceiling','OUTPUT CEILING',-3,-.3,.1,'dBTP est.'],
  ['threshold','COMPRESSOR THRESHOLD',-36,-6,.5,'dBFS'],
  ['ratio','COMPRESSION RATIO',1,8,.1,':1'],
  ['attack','ATTACK',5,100,1,'ms'],
  ['release','RELEASE',60,800,5,'ms'],
  ['tone','TONAL TILT',-4,4,.1,''],
  ['width','STEREO WIDTH',.65,1.35,.01,'x'],
  ['drive','BUS SATURATION',0,35,1,'%'],
  ['bassEq','BASS EQ',-3,3,.1,'dB'],
  ['midEq','MID EQ',-3,3,.1,'dB'],
  ['trebleEq','TREBLE EQ',-3,3,.1,'dB']
];
const fmt=(value,suffix,digits=1)=>Number.isFinite(value)?value.toFixed(digits)+' '+suffix:'--';
const cleanName=value=>(value||'pulse-master').replace(/[^a-z0-9_-]+/gi,'-').slice(0,70);
const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountMasteringTool({host,mode='mix'}={}){
  if(!host)throw Error('Mastering UI requires a host');
  if(!['mix','smart'].includes(mode))throw Error('Unsupported mastering mode');
  const isMix=mode==='mix',first=isMix?'balanced':'streaming';
  const label=isMix?'AI MIX & MASTER':'AI MASTERING';
  const presetList=['trap','hiphop','edm','pop','streaming','balanced','warm','punch','glue','wide'];
  const presetButtons=presetList.map((id,i)=>`<button type="button" data-master-preset="${id}" aria-pressed="${id===first}">${safe(MASTER_PRESETS[id].name)}</button>`).join('');
  const fieldRows=rows.map(([id,name,min,max,step,unit])=>
    `<label class="pulse-master-field"><span>${name}</span><input data-param="${id}" data-unit="${unit}" type="number" min="${min}" max="${max}" step="${step}" value="${MASTER_PRESETS[first][id]??0}" aria-label="${name}"></label>`).join('');
  host.innerHTML=`<section class="tool-view pulse-master-work" data-master-mode="${mode}">
    <div class="tool-view-header"><span>04 / ${label}</span><span>LOCAL DSP / MUSICGPT CLOUD</span></div>
    <h3>${isMix?'Mix character.<br><span>Master control.</span>':'Master your track.<br><span>Keep its character.</span>'}</h3>
    <p class="tool-description">Analyze spectral balance, dynamics, loudness and stereo correlation. Automatically adapt gentle EQ, compression and output limiting. Local DSP is on-device; MusicGPT can also master a source against a reference via its paid cloud API.</p>
    <div class="pulse-master-engines" role="group" aria-label="Mastering processing engine">
      <button type="button" data-master-engine="local" aria-pressed="true">01 / LOCAL DSP</button>
      <button type="button" data-master-engine="cloud" aria-pressed="false">02 / MUSICGPT MASTERING</button>
    </div>
    <div class="pulse-master-cloud" data-master-cloud hidden></div>
    <p class="pulse-detail-label">${isMix?'MIX CHARACTER':'MASTER CHARACTER'}</p>
    <div class="pulse-master-presets" role="group" aria-label="Mastering character presets">${presetButtons}</div>
    <div class="pulse-master-reference">
      <div class="pulse-master-section-head"><strong>REFERENCE MASTERING</strong><span>OPTIONAL / LOCAL ANALYSIS</span></div>
      <p>Import a reference to guide loudness, dynamics and spectral EQ. The reference is never mixed into the track.</p>
      <label class="pulse-master-file"><span>CHOOSE REFERENCE AUDIO</span><input type="file" data-master-reference accept="audio/*,.wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff"></label>
      <div class="pulse-master-reference-foot"><span data-master-reference-name>NO REFERENCE LOADED</span><button type="button" data-master-action="match" disabled>MATCH REFERENCE ↗</button><button type="button" data-master-action="clear-reference" disabled>REMOVE</button></div>
    </div>
    <div class="pulse-master-assistant">
      <div class="pulse-master-section-head"><strong>SMART MASTERING ASSISTANT</strong><span>TEXT → DSP CONTROLS</span></div>
      <p>Describe the sound you want. Instructions map to EQ, compression and stereo settings. Transparent rule-based assistant, not a neural chat model.</p>
      <div class="pulse-master-assistant-examples">${MASTER_ASSISTANT_EXAMPLES.map((phrase)=>'<button type="button" data-master-suggest="'+safe(phrase)+'">'+safe(phrase)+'</button>').join('')}</div>
      <div class="pulse-master-assistant-entry"><label for="pulse-master-instruction">MASTERING INSTRUCTION</label><input type="text" id="pulse-master-instruction" data-master-instruction maxlength="240" placeholder="More punch, warmer bass, less harsh highs…"><button type="button" data-master-action="assist">APPLY SETTINGS ↗</button></div>
      <p data-master-assistant-feedback aria-live="polite">Changes are reversible until you apply the master.</p>
    </div>
    <label class="pulse-master-auto"><input type="checkbox" data-master-auto checked><span>AUTO ANALYZE &amp; ADAPT</span><small>Adapt EQ, compression and stereo width to the track before rendering. Disable for manual settings.</small></label>
    <div class="pulse-master-control-head"><span>PROCESSING CONTROLS</span><span>NON-DESTRUCTIVE UNTIL APPLY</span></div>
    <div class="pulse-master-fields">${fieldRows}</div>
    <p class="pulse-master-analysis" data-master-analysis aria-live="polite">Automatic recommendations appear after analysis.</p>
    <div class="pulse-master-actions"><button type="button" data-master-action="analyze">ANALYZE TRACK</button><button type="button" data-master-action="render">RENDER MASTER <span aria-hidden="true">↗</span></button></div>
    <div class="pulse-master-section-head pulse-master-dashboard-head"><strong>MASTERING ANALYSIS DASHBOARD</strong><span>INPUT / MASTER / REFERENCE</span></div>
    <div class="pulse-master-dashboard" aria-label="Audio analysis dashboard">
      <div class="pulse-master-table-head"><span>METRIC</span><span>ORIGINAL</span><span>MASTER</span><span>REFERENCE</span></div>
      ${[
        ['integratedLufs','LUFS-I','LUFS',1],
        ['truePeakEstimateDb','TRUE PEAK · EST.','dBTP',1],
        ['crestDb','CREST / DYNAMICS','dB',1],
        ['stereoCorrelation','STEREO CORR.','',2]
      ].map(([key,label,unit,digits])=>'<div class="pulse-master-table-row" data-master-table="'+key+'"><span>'+label+'</span><strong data-master-data="original">—</strong><strong data-master-data="master">—</strong><strong data-master-data="reference">—</strong></div>').join('')}
      <div class="pulse-master-spectrum-head"><strong>SPECTRAL BALANCE</strong><span>8 BANDS · RELATIVE ENERGY</span></div>
      <div class="pulse-master-spectrum" data-master-spectrum><p>Analyze a mix to display the frequency profile.</p></div>
      <div class="pulse-master-spectrum-legend"><span>ORIGINAL</span><span>MASTER</span><span>REFERENCE</span></div>
    </div>
    <div class="pulse-master-reports" aria-label="Before and after audio measurements">
      <div><span>INPUT LOUDNESS</span><strong data-master-metric="before-lufs">--</strong></div>
      <div><span>OUTPUT LOUDNESS</span><strong data-master-metric="after-lufs">--</strong></div>
      <div><span>EST. TRUE PEAK</span><strong data-master-metric="after-tp">--</strong></div>
      <div><span>STEREO CORRELATION</span><strong data-master-metric="correlation">--</strong></div>
      <div><span>MAX COMP. REDUCTION</span><strong data-master-metric="compression">--</strong></div>
      <div><span>MAX LIMITER REDUCTION</span><strong data-master-metric="limiter">--</strong></div>
    </div>
    <div class="pulse-master-audition"><div role="group" aria-label="Preview original, mastered or reference audio"><button type="button" data-master-ab="a" aria-pressed="true">A / ORIGINAL</button><button type="button" data-master-ab="b" aria-pressed="false">B / MASTER</button><button type="button" data-master-ab="c" aria-pressed="false" disabled>C / REFERENCE</button></div><button type="button" data-master-action="listen">PLAY PREVIEW</button></div>
    <label class="pulse-master-match"><input type="checkbox" data-master-match checked> LEVEL-MATCH A/B FOR FAIR COMPARISON</label>
    <div class="pulse-master-output"><button type="button" data-master-action="apply" disabled>APPLY MASTER TO WORKSPACE <span aria-hidden="true">↗</span></button><button type="button" data-master-action="export" disabled>EXPORT 24-BIT WAV <span aria-hidden="true">↗</span></button></div>
    <p class="pulse-master-status" role="status" aria-live="polite">Load audio into SOURCE AUDIO, then analyze or render. Undo is available after applying.</p>
    <p class="pulse-master-disclaimer">Automatic settings use conservative spectral and dynamic heuristics, not a neural model. LUFS-I is an approximate gated K-weighted meter; 4x inter-sample peak is not certified dBTP compliance. Always verify mastering by ear.</p>
  </section>`;
  const $=selector=>host.querySelector(selector);
  const all=selector=>[...host.querySelectorAll(selector)];
  const setText=(key,value)=>{const el=$('[data-master-metric="'+key+'"]');if(el)el.textContent=value;};
  const status=$('.pulse-master-status'),play=$('[data-master-action="listen"]');
  const refFile=$('[data-master-reference]'),matchButton=$('[data-master-action="match"]'),
   clearRefButton=$('[data-master-action="clear-reference"]'),refName=$('[data-master-reference-name]'),
   cloudPane=$('[data-master-cloud]');
  const renderButton=$('[data-master-action="render"]'),analysisButton=$('[data-master-action="analyze"]');
  const applyButton=$('[data-master-action="apply"]'),exportButton=$('[data-master-action="export"]');
  let activePreset=first,prepared=null,sourceRef=null,disposed=false,busy=false,selected='a',previewNode=null,previewGain=null,previewPosition=0,startedAt=0,jobController=null;
  let referenceAudio=null,referenceFile=null,referenceStats=null,engine='local';
  let dashboard={original:null,master:null,reference:null,spectrumOriginal:null,spectrumMaster:null,spectrumReference:null};
  function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
  function dashboardView(){
    for(const key of ['integratedLufs','truePeakEstimateDb','crestDb','stereoCorrelation']){
      const row=$('[data-master-table="'+key+'"]');
      const metrics=['original','master','reference'];
      for(const type of metrics){
        const value=dashboard[type]?.[key],field=row.querySelector('[data-master-data="'+type+'"]');
        field.textContent=value===null&&key==='stereoCorrelation'?'MONO':
          Number.isFinite(value)?value.toFixed(key==='stereoCorrelation'?2:1):'—';
      }
    }
    const root=$('[data-master-spectrum]');root.replaceChildren();
    const spectra=[dashboard.spectrumOriginal,dashboard.spectrumMaster,dashboard.spectrumReference];
    if(!spectra.some(x=>Array.isArray(x)&&x.length===8)){
      root.textContent='Load and analyze a mix to display the frequency profile.';return;
    }
    for(let i=0;i<MASTER_BANDS.length;i++){
      const group=document.createElement('div');group.className='pulse-master-band-group';
      const bars=document.createElement('div');bars.className='pulse-master-band-bars';
      for(const [index,profile] of spectra.entries()){
        const bar=document.createElement('span');
        bar.className='pulse-master-band pulse-master-band-'+['original','master','reference'][index];
        const energy=Array.isArray(profile)?profile[i]:0;
        bar.style.height=(Number.isFinite(energy)?Math.max(3,Math.min(90,12+22*Math.log10(1+energy*400))):3)+'px';
        bar.title=['Original','Master','Reference'][index]+': '+(energy>0?(energy*100).toFixed(2)+'% spectrum share':'unavailable');
        bars.append(bar);
      }
      const freq=document.createElement('small');freq.textContent=MASTER_BANDS[i];
      group.append(bars,freq);root.append(group);
    }
  }
  function setDashboard(part){
    dashboard={...dashboard,...part};dashboardView();
  }
  function setSettings(inputs){
    updating=true;
    try{for(const control of all('[data-param]'))control.value=String(inputs[control.dataset.param]);}
    finally{updating=false;}
  }
  function stopPreview(reset=false){
    if(previewNode){
      if(!reset&&w.context)previewPosition=Math.max(0,w.context.currentTime-startedAt);
      previewNode.onended=null;try{previewNode.stop()}catch{}previewNode.disconnect();previewGain?.disconnect();previewGain=null;previewNode=null;
    }
    if(reset)previewPosition=0;
    play.textContent='PLAY PREVIEW';
  }
  function invalidate(){
    prepared=null;sourceRef=null;stopPreview(true);
    setDashboard({master:null,spectrumMaster:null});
    applyButton.disabled=true;exportButton.disabled=true;
    for(const key of ['after-lufs','after-tp','compression','limiter'])setText(key,'--');
  }
  function currentSettings(){
    const base={...MASTER_PRESETS[activePreset]};
    for(const field of all('[data-param]'))base[field.dataset.param]=Number(field.value);
    return masteringSettings(base);
  }
  function display(before,after=null,processing=null){
    setText('before-lufs',fmt(before.integratedLufs,'LUFS'));
    setText('correlation',before.stereoCorrelation===null?'MONO':fmt(before.stereoCorrelation,'',2));
    if(after){
      setText('after-lufs',fmt(after.integratedLufs,'LUFS'));
      setText('after-tp',fmt(after.truePeakEstimateDb,'dBTP est.'));
      setText('compression',fmt(processing.maxCompressionDb,'dB'));
      setText('limiter',fmt(processing.maxLimiterDb,'dB'));
    }
  }
  const setBusy=value=>{
    busy=value;renderButton.disabled=value;analysisButton.disabled=value;
    all('[data-param], [data-master-preset], [data-master-auto], [data-master-engine], [data-master-reference], [data-master-instruction], [data-master-action="assist"], [data-master-suggest]').forEach(el=>el.disabled=value);
    matchButton.disabled=value||!referenceAudio;
    clearRefButton.disabled=value||!referenceAudio;
    applyButton.disabled=value||!prepared;exportButton.disabled=value||!prepared;
  };
  let updating=false;
  const auto=$('[data-master-auto]');
  const refAB=$('[data-master-ab="c"]');
  auto.addEventListener('change',()=>{
    invalidate();
    message(auto.checked?'Automatic analysis enabled. Render to adapt the mastering chain.':'Manual settings kept. Render with current controls.');
  });
  all('[data-param]').forEach(input=>input.addEventListener('input',()=>{
    if(updating)return;
    auto.checked=false;invalidate();
    all('[data-master-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));
    message('Manual settings selected. Automatic adaptation is off until re-enabled.');
  }));
  all('[data-master-preset]').forEach(button=>button.addEventListener('click',()=>{
    const preset=MASTER_PRESETS[button.dataset.masterPreset];if(!preset||busy)return;
    activePreset=button.dataset.masterPreset;
    invalidate();updating=true;
    for(const control of all('[data-param]'))control.value=String(preset[control.dataset.param]??0);
    updating=false;auto.checked=true;
    all('[data-master-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    message(preset.name+' selected. Render to process the track.');
  }));
  async function recommend(input){
    const result=await runMasteringWorker('analyze',input,{preset:activePreset,signal:jobController.signal});
    if(disposed||jobController.signal.aborted||w.buffer!==input)throw Error('Audio changed. Retry analysis.');
    setSettings(result.settings);
    setText('before-lufs',fmt(result.before.integratedLufs,'LUFS'));
    setDashboard({original:result.before,spectrumOriginal:result.spectrum?.input??null});
    setText('correlation',result.before.stereoCorrelation===null?'MONO':fmt(result.before.stereoCorrelation,'',2));
    const a=result.analysis;
    $('[data-master-analysis]').textContent='ANALYSIS · Crest '+a.crestDb.toFixed(1)+' dB / Stereo '+(a.stereoCorrelation===null?'MONO':a.stereoCorrelation.toFixed(2))+
      ' / EQ: Bass '+a.spectralCorrectionDb.bass.toFixed(1)+' dB, Mid '+a.spectralCorrectionDb.mid.toFixed(1)+' dB, Treble '+a.spectralCorrectionDb.treble.toFixed(1)+' dB.';
    return result;
  }
  async function matchReference(input){
    if(!referenceAudio)throw Error('Load a reference track first.');
    const referenceSnapshot=referenceAudio;
    const result=await runMasteringWorker('reference',input,{
      settings:currentSettings(),reference:referenceSnapshot,signal:jobController.signal
    });
    if(disposed||jobController.signal.aborted||w.buffer!==input||referenceSnapshot!==referenceAudio)
      throw Error('Source or reference audio changed. Retry.');
    setSettings(result.settings);
    referenceStats=result.reference;
    setDashboard({original:result.before,reference:result.reference,
      spectrumOriginal:result.spectrum.input,spectrumReference:result.spectrum.reference});
    setText('before-lufs',fmt(result.before.integratedLufs,'LUFS'));
    setText('correlation',result.before.stereoCorrelation===null?'MONO':fmt(result.before.stereoCorrelation,'',2));
    $('[data-master-analysis]').textContent='REFERENCE MATCH · Estimated target '+result.settings.target.toFixed(1)+' LUFS / EQ Bass '+result.settings.bassEq.toFixed(1)+
      ' dB, Mid '+result.settings.midEq.toFixed(1)+' dB, Treble '+result.settings.trebleEq.toFixed(1)+' dB. This is a conservative tonal/dynamic target, not an identical master.';
    return result;
  }
  const match=async()=>{
    if(busy)return;
    jobController?.abort();jobController=new AbortController();
    try{
      const input=w.ensureAudio();
      setBusy(true);invalidate();
      message('Comparing spectrum, LUFS, crest factor and stereo against the reference…');
      await matchReference(input);
      if(!disposed){auto.checked=false;message('Reference comparison complete. Render with the suggested controls or edit them manually.');}
    }catch(error){if(!disposed&&error?.name!=='AbortError')message(error.message||'Reference analysis failed.',true);}
    finally{if(!disposed)setBusy(false);}
  };
  const analyze=async()=>{
    if(busy)return;
    let input;
    jobController?.abort();jobController=new AbortController();
    try{
      input=w.ensureAudio();setBusy(true);invalidate();
      message('Analyzing spectrum, crest factor and stereo image in the background…');
      await recommend(input);
      if(disposed)return;
      auto.checked=false; // Analysis freezes the recommendation as editable manual controls.
      message('Analysis complete. The recommended controls are editable. Render with these settings.');
    }catch(e){if(!disposed&&e?.name!=='AbortError')message(e.message||'Unable to analyze audio.',true);}
    finally{if(!disposed)setBusy(false)}
  };
  const render=async()=>{
    if(busy)return;
    let input;
    jobController?.abort();jobController=new AbortController();
    try{
      input=w.ensureAudio();setBusy(true);stopPreview(true);
      if(auto.checked){
        message(referenceAudio?'Matching to reference…':'Analyzing and adapting mastering settings…');
        if(referenceAudio)await matchReference(input);
        else await recommend(input);
      }
      if(disposed||jobController.signal.aborted||w.buffer!==input)return;
      const settings=currentSettings();
      message('Rendering mastering EQ, compression and limiter in a Web Worker…');
      const output=await runMasteringWorker('render',input,{settings,signal:jobController.signal});
      if(disposed||jobController.signal.aborted)return;
      if(w.buffer!==input)throw Error('SOURCE AUDIO changed while rendering. Render again.');
      prepared=output;sourceRef=input;selected='b';previewPosition=0;
      display(output.before,output.after,output.processing);
      setDashboard({original:output.before,master:output.after,
        spectrumOriginal:output.spectrum?.input??dashboard.spectrumOriginal,
        spectrumMaster:output.spectrum?.master??null});
      all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.masterAb==='b')));
      message('Master ready. Target '+settings.target.toFixed(1)+' LUFS; reached '+fmt(output.after.integratedLufs,'LUFS')+
        (output.processing.targetReached?'.':' (limited by dynamics and peak ceiling).')+
        ' A/B preview is level-matched by default.');
    }catch(e){invalidate();if(!disposed&&e?.name!=='AbortError')message(e.message||'Mastering failed.',true);}
    finally{if(!disposed)setBusy(false)}
  };

  refFile.addEventListener('change',async()=>{
    const file=refFile.files?.[0];if(!file)return;
    if(busy)return;
    try{
      if(file.size>100*1024*1024)throw Error('Reference exceeds the 100 MB local input limit.');
      setBusy(true);message('Decoding reference audio locally…');
      const ctx=await w.ensureContext();
      const audio=await ctx.decodeAudioData(await file.arrayBuffer());
      if(disposed)return;
      if(audio.duration>1200||audio.length*audio.numberOfChannels*4>240*1024*1024)
        throw Error('Reference exceeds 20 minutes or 240 MB decoded audio.');
      message('Measuring reference loudness and spectral balance in the background…');
      const analyzed=await runMasteringWorker('analyze',audio,{preset:activePreset});
      if(disposed)return;
      referenceAudio=audio;referenceFile=file;referenceStats=analyzed.before;cloudController.discard();
      setDashboard({reference:analyzed.before,spectrumReference:analyzed.spectrum?.input??null});
      refName.textContent=file.name;
      clearRefButton.disabled=false;matchButton.disabled=false;refAB.disabled=false;
      invalidate();message('Reference analyzed locally. Click MATCH REFERENCE to adapt settings, or compare C / REFERENCE against the analyzed mix.');
    }catch(error){if(!disposed){refFile.value='';message(error.message||'Reference could not be decoded.',true);}}
    finally{if(!disposed)setBusy(false);}
  });
  clearRefButton.onclick=()=>{
    if(busy)return;
    stopPreview(true);referenceAudio=null;referenceFile=null;referenceStats=null;cloudController.discard();
    refFile.value='';refName.textContent='NO REFERENCE LOADED';refAB.disabled=true;
    if(selected==='c')selected='a';
    all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.masterAb===selected)));
    matchButton.disabled=true;clearRefButton.disabled=true;
    setDashboard({reference:null,spectrumReference:null});
    invalidate();message('Reference cleared. Local mastering remains available.');
  };
  matchButton.onclick=match;
  function performAssistant(text){
    try{
      if(busy)return;
      const result=interpretMasteringRequest(text,currentSettings());
      invalidate();setSettings(result.settings);auto.checked=false;
      all('[data-master-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));
      $('[data-master-assistant-feedback]').textContent=result.changes.join(' · ')+'. Render to hear the result.';
      message('Mastering settings updated from your instruction. No audio processed yet.');
    }catch(error){message(error.message||'Instruction not recognized.',true);}
  }
  all('[data-master-suggest]').forEach(b=>b.addEventListener('click',()=>{
    $('[data-master-instruction]').value=b.dataset.masterSuggest;
    performAssistant(b.dataset.masterSuggest);
  }));
  $('[data-master-action="assist"]').onclick=()=>performAssistant($('[data-master-instruction]').value);
  $('[data-master-instruction]').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();performAssistant(event.currentTarget.value);}
  });
  const cloudController=mountMusicGPTMasteringCloud({
    host:cloudPane,workspace:w,
    getReference:()=>({buffer:referenceAudio,file:referenceFile}),
    onMessage:message,
    onResult:async(audioUrl,signal,{sourceMethod}={})=>{
      const input=w.buffer;
      // Never A/B a six-second preview against a full song or assume
      // URL input represents the currently loaded workspace source.
      if(!input||sourceMethod!=='preview'||input.duration>6.01)return false;
      try{
        // Some provider output servers disallow cross-origin downloads.
        // PULSE always presents the external player/link as a fallback.
        const response=await fetch(audioUrl,{mode:'cors',signal});
        if(!response.ok)return false;
        const advertised=Number(response.headers.get('content-length')||0);
        if(advertised>100_000_000)return false;
        const audio=await response.arrayBuffer();
        if(audio.byteLength>100_000_000)return false;
        const ctx=await w.ensureContext(),decoded=await ctx.decodeAudioData(audio);
        if(signal?.aborted||disposed||w.buffer!==input)return false;
        const [before,after]=await Promise.all([
          runMasteringWorker('analyze',input,{preset:activePreset,signal}),
          runMasteringWorker('analyze',decoded,{preset:activePreset,signal})
        ]);
        if(signal?.aborted||disposed||w.buffer!==input)return false;
        prepared={buffer:decoded,before:before.before,after:after.before,
          processing:{maxCompressionDb:0,maxLimiterDb:0,targetReached:false}};
        sourceRef=input;selected='b';previewPosition=0;
        display(prepared.before,prepared.after,prepared.processing);
        setDashboard({original:before.before,master:after.before,
          spectrumOriginal:before.spectrum?.input,spectrumMaster:after.spectrum?.input});
        applyButton.disabled=false;exportButton.disabled=false;
        all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.masterAb==='b')));
        return true;
      }catch{return false;}
    }
  });
  all('[data-master-engine]').forEach(button=>button.onclick=()=>{
    if(busy)return;
    engine=button.dataset.masterEngine;
    all('[data-master-engine]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    cloudPane.hidden=engine!=='cloud';
    renderButton.textContent=engine==='cloud'?'RUN MUSICGPT MASTERING ↗':'RENDER MASTER ↗';
    invalidate();
    message(engine==='cloud'?
      'MusicGPT matches the source and a REQUIRED reference. Explicit consent and paid credits are required.':
      'Local DSP selected. EQ, compressor and limiter run entirely in your browser.');
  });

  const audition=async()=>{
    if(busy)return;
    try{
      if(previewNode){stopPreview();return;}
      const buffer=selected==='b'?prepared?.buffer:selected==='c'?referenceAudio:w.ensureAudio();
      if(!buffer)throw Error('Load the requested audio before previewing.');
      if(selected==='b'&&sourceRef!==w.buffer)throw Error('SOURCE AUDIO changed. Render the master again.');
      w.stop();const ctx=await w.ensureContext();if(disposed)return;
      if(previewPosition>=buffer.duration)previewPosition=0;
      const node=ctx.createBufferSource();node.buffer=w.toNative(buffer);
      const gain=ctx.createGain();
      if($('[data-master-match]').checked){
        const levels=[dashboard.original?.integratedLufs,dashboard.master?.integratedLufs,
         dashboard.reference?.integratedLufs].filter(Number.isFinite);
        const current=selected==='a'?dashboard.original?.integratedLufs:
         selected==='b'?dashboard.master?.integratedLufs:dashboard.reference?.integratedLufs;
        if(Number.isFinite(current)&&levels.length>=2){
          gain.gain.value=Math.pow(10,(Math.min(...levels)-current)/20); // Monitor-only attenuation; export is unaffected.
        }
      }
      node.connect(gain);gain.connect(ctx.destination);previewGain=gain;
      previewNode=node;startedAt=ctx.currentTime-previewPosition;
      node.onended=()=>{if(previewNode===node)stopPreview(true)};
      node.start(0,previewPosition);
      play.textContent='PAUSE PREVIEW';
    }catch(e){message(e.message||'Preview unavailable.',true)}
  };
  all('[data-master-ab]').forEach(button=>button.addEventListener('click',()=>{
    if(busy)return;
    const next=button.dataset.masterAb;
    if(next==='c'&&!referenceAudio){message('Load a reference audio file first.',true);return;}
    if(next==='b'&&(!prepared||w.buffer!==sourceRef)){
      message('Render a master to enable B comparison.',true);return;
    }
    const hadPreview=Boolean(previewNode);stopPreview(!hadPreview);
    selected=next;
    all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    if(hadPreview)void audition();
  }));
  analysisButton.onclick=analyze;renderButton.onclick=async()=>{if(engine==='cloud'){if(busy)return;setBusy(true);try{await cloudController.run();}finally{if(!disposed)setBusy(false);}}else await render();};play.onclick=audition;
  const unsubscribe=w.subscribe((snapshot,reason)=>{
    if(!['load','clear','commit','undo','redo'].includes(reason))return;
    jobController?.abort();invalidate();setDashboard({original:null,spectrumOriginal:null});
    selected='a';all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.masterAb==='a')));
  });
  applyButton.onclick=()=>{
    try{
      if(!prepared||w.buffer!==sourceRef)throw Error('Render a fresh master before applying.');
      stopPreview(true);
      const result=prepared.buffer;w.commit(result,'PULSE Master applied. Undo is available.');
      invalidate();message('Master applied to SOURCE AUDIO. Undo restores the previous track.');
    }catch(e){message(e.message||'Unable to apply master.',true)}
  };
  exportButton.onclick=()=>{
    try{
      if(!prepared||w.buffer!==sourceRef)throw Error('Render a fresh master before exporting.');
      const blob=encodeWav(prepared.buffer,24),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=cleanName(w.name)+'-pulse-master-24bit.wav';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      message('Exported 24-bit mastered WAV. The current workspace was not changed.');
    }catch(e){message(e.message||'Export failed.',true)}
  };
  return ()=>{disposed=true;jobController?.abort();cloudController.dispose();unsubscribe();stopPreview(true);prepared=null;sourceRef=null;referenceAudio=null;referenceFile=null};
}
