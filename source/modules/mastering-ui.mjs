/** A single, non-destructive interface for AI Mix & Master and Smart Master. */
import {workspace as w} from './workspace.mjs';
import {encodeWav} from './dsp.mjs';
import {MASTER_PRESETS,masteringSettings} from './mastering-engine.mjs';
import {runMasteringWorker} from './mastering-client.mjs';

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
  const presetButtons=presetList.map((id,i)=>`<button type="button" data-master-preset="${id}" aria-pressed="${i===0}">${safe(MASTER_PRESETS[id].name)}</button>`).join('');
  const fieldRows=rows.map(([id,name,min,max,step,unit])=>
    `<label class="pulse-master-field"><span>${name}</span><input data-param="${id}" data-unit="${unit}" type="number" min="${min}" max="${max}" step="${step}" value="${MASTER_PRESETS[first][id]??0}" aria-label="${name}"></label>`).join('');
  host.innerHTML=`<section class="tool-view pulse-master-work" data-master-mode="${mode}">
    <div class="tool-view-header"><span>04 / ${label}</span><span>ADAPTIVE DSP / WORKER</span></div>
    <h3>${isMix?'Mix character.<br><span>Master control.</span>':'Master your track.<br><span>Keep its character.</span>'}</h3>
    <p class="tool-description">Analyze spectral balance, dynamics, loudness and stereo correlation. Automatically adapt gentle EQ, compression and output limiting. Local DSP, not a trained neural AI model.</p>
    <p class="pulse-detail-label">${isMix?'MIX CHARACTER':'MASTER CHARACTER'}</p>
    <div class="pulse-master-presets" role="group" aria-label="Mastering character presets">${presetButtons}</div>
    <label class="pulse-master-auto"><input type="checkbox" data-master-auto checked><span>AUTO ANALYZE &amp; ADAPT</span><small>Adapt EQ, compression and stereo width to the track before rendering. Disable for manual settings.</small></label>
    <div class="pulse-master-control-head"><span>PROCESSING CONTROLS</span><span>NON-DESTRUCTIVE UNTIL APPLY</span></div>
    <div class="pulse-master-fields">${fieldRows}</div>
    <p class="pulse-master-analysis" data-master-analysis aria-live="polite">Automatic recommendations appear after analysis.</p>
    <div class="pulse-master-actions"><button type="button" data-master-action="analyze">ANALYZE TRACK</button><button type="button" data-master-action="render">RENDER MASTER <span aria-hidden="true">↗</span></button></div>
    <div class="pulse-master-reports" aria-label="Before and after audio measurements">
      <div><span>INPUT LOUDNESS</span><strong data-master-metric="before-lufs">--</strong></div>
      <div><span>OUTPUT LOUDNESS</span><strong data-master-metric="after-lufs">--</strong></div>
      <div><span>EST. TRUE PEAK</span><strong data-master-metric="after-tp">--</strong></div>
      <div><span>STEREO CORRELATION</span><strong data-master-metric="correlation">--</strong></div>
      <div><span>MAX COMP. REDUCTION</span><strong data-master-metric="compression">--</strong></div>
      <div><span>MAX LIMITER REDUCTION</span><strong data-master-metric="limiter">--</strong></div>
    </div>
    <div class="pulse-master-audition"><div role="group" aria-label="Preview original or mastered audio"><button type="button" data-master-ab="a" aria-pressed="true">A / ORIGINAL</button><button type="button" data-master-ab="b" aria-pressed="false">B / MASTER</button></div><button type="button" data-master-action="listen">PLAY PREVIEW</button></div>
    <label class="pulse-master-match"><input type="checkbox" data-master-match checked> LEVEL-MATCH A/B FOR FAIR COMPARISON</label>
    <div class="pulse-master-output"><button type="button" data-master-action="apply" disabled>APPLY MASTER TO WORKSPACE <span aria-hidden="true">↗</span></button><button type="button" data-master-action="export" disabled>EXPORT 24-BIT WAV <span aria-hidden="true">↗</span></button></div>
    <p class="pulse-master-status" role="status" aria-live="polite">Load audio into SOURCE AUDIO, then analyze or render. Undo is available after applying.</p>
    <p class="pulse-master-disclaimer">Automatic settings use conservative spectral and dynamic heuristics, not a neural model. LUFS-I is an approximate gated K-weighted meter; 4x inter-sample peak is not certified dBTP compliance. Always verify mastering by ear.</p>
  </section>`;
  const $=selector=>host.querySelector(selector);
  const all=selector=>[...host.querySelectorAll(selector)];
  const setText=(key,value)=>{const el=$('[data-master-metric="'+key+'"]');if(el)el.textContent=value;};
  const status=$('.pulse-master-status'),play=$('[data-master-action="listen"]');
  const renderButton=$('[data-master-action="render"]'),analysisButton=$('[data-master-action="analyze"]');
  const applyButton=$('[data-master-action="apply"]'),exportButton=$('[data-master-action="export"]');
  let activePreset=first,prepared=null,sourceRef=null,disposed=false,busy=false,selected='a',previewNode=null,previewGain=null,previewPosition=0,startedAt=0,jobController=null;
  function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
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
    all('[data-param], [data-master-preset], [data-master-auto]').forEach(el=>el.disabled=value);
    applyButton.disabled=value||!prepared;exportButton.disabled=value||!prepared;
  };
  let updating=false;
  const auto=$('[data-master-auto]');
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
    updating=true;
    for(const control of all('[data-param]'))control.value=String(result.settings[control.dataset.param]);
    updating=false;
    setText('before-lufs',fmt(result.before.integratedLufs,'LUFS'));
    setText('correlation',result.before.stereoCorrelation===null?'MONO':fmt(result.before.stereoCorrelation,'',2));
    const a=result.analysis;
    $('[data-master-analysis]').textContent='ANALYSIS · Crest '+a.crestDb.toFixed(1)+' dB / Stereo '+(a.stereoCorrelation===null?'MONO':a.stereoCorrelation.toFixed(2))+
      ' / EQ: Bass '+a.spectralCorrectionDb.bass.toFixed(1)+' dB, Mid '+a.spectralCorrectionDb.mid.toFixed(1)+' dB, Treble '+a.spectralCorrectionDb.treble.toFixed(1)+' dB.';
    return result;
  }
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
        message('Analyzing and adapting mastering settings…');
        await recommend(input);
      }
      if(disposed||jobController.signal.aborted||w.buffer!==input)return;
      const settings=currentSettings();
      message('Rendering mastering EQ, compression and limiter in a Web Worker…');
      const output=await runMasteringWorker('render',input,{settings,signal:jobController.signal});
      if(disposed||jobController.signal.aborted)return;
      if(w.buffer!==input)throw Error('SOURCE AUDIO changed while rendering. Render again.');
      prepared=output;sourceRef=input;selected='b';previewPosition=0;
      display(output.before,output.after,output.processing);
      all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.masterAb==='b')));
      message('Master ready. Target '+settings.target.toFixed(1)+' LUFS; reached '+fmt(output.after.integratedLufs,'LUFS')+
        (output.processing.targetReached?'.':' (limited by dynamics and peak ceiling).')+
        ' A/B preview is level-matched by default.');
    }catch(e){invalidate();if(!disposed&&e?.name!=='AbortError')message(e.message||'Mastering failed.',true);}
    finally{if(!disposed)setBusy(false)}
  };
  const audition=async()=>{
    if(busy)return;
    try{
      if(previewNode){stopPreview();return;}
      const buffer=selected==='b'?prepared?.buffer:w.ensureAudio();
      if(!buffer)throw Error('Render the master before selecting B.');
      if(selected==='b'&&sourceRef!==w.buffer)throw Error('SOURCE AUDIO changed. Render the master again.');
      w.stop();const ctx=await w.ensureContext();if(disposed)return;
      if(previewPosition>=buffer.duration)previewPosition=0;
      const node=ctx.createBufferSource();node.buffer=w.toNative(buffer);
      const gain=ctx.createGain();
      if($('[data-master-match]').checked&&prepared&&sourceRef===w.buffer){
        const quieter=Math.min(prepared.before.integratedLufs,prepared.after.integratedLufs);
        const level=selected==='a'?prepared.before.integratedLufs:prepared.after.integratedLufs;
        gain.gain.value=Math.pow(10,(quieter-level)/20); // Monitor-only attenuation.
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
    const next=button.dataset.masterAb;if(next==='b'&&(!prepared||w.buffer!==sourceRef)){
      message('Render a master to enable B comparison.',true);return;
    }
    const hadPreview=Boolean(previewNode);stopPreview(!hadPreview);
    selected=next;
    all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    if(hadPreview)void audition();
  }));
  analysisButton.onclick=analyze;renderButton.onclick=render;play.onclick=audition;
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
  return ()=>{disposed=true;jobController?.abort();stopPreview(true);prepared=null;sourceRef=null};
}
