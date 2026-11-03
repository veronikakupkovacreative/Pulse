/** A single, non-destructive interface for AI Mix & Master and Smart Master. */
import {workspace as w} from './workspace.mjs';
import {encodeWav} from './dsp.mjs';
import {MASTER_PRESETS,masteringSettings,measureMasteringAudio,renderMasteringAudio} from './mastering-engine.mjs';

const rows=[
  ['target','TARGET LOUDNESS',-20,-8,.5,'LUFS'],
  ['ceiling','OUTPUT CEILING',-3,-.3,.1,'dBTP est.'],
  ['threshold','COMPRESSOR THRESHOLD',-36,-6,.5,'dBFS'],
  ['ratio','COMPRESSION RATIO',1,8,.1,':1'],
  ['attack','ATTACK',5,100,1,'ms'],
  ['release','RELEASE',60,800,5,'ms'],
  ['tone','TONAL TILT',-4,4,.1,''],
  ['width','STEREO WIDTH',.65,1.35,.01,'x'],
  ['drive','BUS SATURATION',0,35,1,'%']
];
const fmt=(value,suffix,digits=1)=>Number.isFinite(value)?value.toFixed(digits)+' '+suffix:'--';
const cleanName=value=>(value||'pulse-master').replace(/[^a-z0-9_-]+/gi,'-').slice(0,70);
const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));

export function mountMasteringTool({host,mode='mix'}={}){
  if(!host)throw Error('Mastering UI requires a host');
  if(!['mix','smart'].includes(mode))throw Error('Unsupported mastering mode');
  const isMix=mode==='mix',first=isMix?'balanced':'streaming';
  const label=isMix?'AI MIX & MASTER':'SMART MASTER';
  const presetList=isMix?['balanced','warm','punch','wide','streaming','glue']:['streaming','balanced','warm','punch','glue'];
  const presetButtons=presetList.map((id,i)=>`<button type="button" data-master-preset="${id}" aria-pressed="${i===0}">${safe(MASTER_PRESETS[id].name)}</button>`).join('');
  const fieldRows=rows.filter(([id])=>isMix||!['tone','width','drive'].includes(id)).map(([id,name,min,max,step,unit])=>
    `<label class="pulse-master-field"><span>${name}</span><input data-param="${id}" data-unit="${unit}" type="number" min="${min}" max="${max}" step="${step}" value="${MASTER_PRESETS[first][id]}" aria-label="${name}"></label>`).join('');
  host.innerHTML=`<section class="tool-view pulse-master-work" data-master-mode="${mode}">
    <div class="tool-view-header"><span>04 / ${label}</span><span>ADAPTIVE / LOCAL DSP</span></div>
    <h3>${isMix?'Mix character.<br><span>Master control.</span>':'Ready to release.<br><span>Master precisely.</span>'}</h3>
    <p class="tool-description">${isMix?'Shape a finished mix with subtle bus color, stereo-linked compression and a controlled output ceiling.':'Refine dynamics, reach a practical loudness target and protect output peaks with a linked compressor and limiter.'} No neural model is involved.</p>
    <p class="pulse-detail-label">${isMix?'MIX CHARACTER':'MASTER CHARACTER'}</p>
    <div class="pulse-master-presets" role="group" aria-label="Mastering character presets">${presetButtons}</div>
    <div class="pulse-master-control-head"><span>PROCESSING CONTROLS</span><span>NON-DESTRUCTIVE UNTIL APPLY</span></div>
    <div class="pulse-master-fields">${fieldRows}</div>
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
    <div class="pulse-master-output"><button type="button" data-master-action="apply" disabled>APPLY MASTER TO WORKSPACE <span aria-hidden="true">↗</span></button><button type="button" data-master-action="export" disabled>EXPORT 24-BIT WAV <span aria-hidden="true">↗</span></button></div>
    <p class="pulse-master-status" role="status" aria-live="polite">Load audio into SOURCE AUDIO, then analyze or render. Undo is available after applying.</p>
    <p class="pulse-master-disclaimer">LUFS-I uses an approximate gated K-weighted meter. 4x inter-sample peak is an estimate, not certified dBTP compliance; output loudness is limited by the selected ceiling.</p>
  </section>`;
  const $=selector=>host.querySelector(selector);
  const all=selector=>[...host.querySelectorAll(selector)];
  const setText=(key,value)=>{const el=$('[data-master-metric="'+key+'"]');if(el)el.textContent=value;};
  const status=$('.pulse-master-status'),play=$('[data-master-action="listen"]');
  const renderButton=$('[data-master-action="render"]'),analysisButton=$('[data-master-action="analyze"]');
  const applyButton=$('[data-master-action="apply"]'),exportButton=$('[data-master-action="export"]');
  let activePreset=first,prepared=null,sourceRef=null,disposed=false,busy=false,selected='a',previewNode=null,previewPosition=0,startedAt=0;
  function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
  function stopPreview(reset=false){
    if(previewNode){
      if(!reset&&w.context)previewPosition=Math.max(0,w.context.currentTime-startedAt);
      previewNode.onended=null;try{previewNode.stop()}catch{}previewNode.disconnect();previewNode=null;
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
    all('[data-param], [data-master-preset]').forEach(el=>el.disabled=value);
    applyButton.disabled=value||!prepared;exportButton.disabled=value||!prepared;
  };
  all('[data-param]').forEach(input=>input.addEventListener('input',()=>{
    invalidate();all('[data-master-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));
    message('Settings changed. Render again to hear the new mastering result.');
  }));
  all('[data-master-preset]').forEach(button=>button.addEventListener('click',()=>{
    const preset=MASTER_PRESETS[button.dataset.masterPreset];if(!preset||busy)return;
    activePreset=button.dataset.masterPreset;
    invalidate();for(const control of all('[data-param]')){
      control.value=String(preset[control.dataset.param]);
      control.dispatchEvent(new Event('input',{bubbles:true}));
    }
    all('[data-master-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    message(preset.name+' selected. Render to process the track.');
  }));
  const analyze=async()=>{
    if(busy)return;
    try{
      const input=w.ensureAudio();setBusy(true);message('Measuring complete track...');await frame();
      const metrics=measureMasteringAudio(input);
      if(disposed||w.buffer!==input)return;
      setText('before-lufs',fmt(metrics.integratedLufs,'LUFS'));
      setText('correlation',metrics.stereoCorrelation===null?'MONO':fmt(metrics.stereoCorrelation,'',2));
      message('Analysis complete. Current sample peak: '+fmt(metrics.samplePeakDb,'dBFS')+'.');
    }catch(e){message(e.message||'Unable to analyze audio.',true)}
    finally{if(!disposed)setBusy(false)}
  };
  const render=async()=>{
    if(busy)return;
    try{
      const input=w.ensureAudio(),settings=currentSettings();
      setBusy(true);stopPreview(true);message('Rendering compressor and peak-safe master locally...');await frame();
      const output=renderMasteringAudio(input,settings);
      if(disposed)return;
      if(w.buffer!==input)throw Error('SOURCE AUDIO changed while rendering. Render again.');
      prepared=output;sourceRef=input;selected='b';previewPosition=0;
      display(output.before,output.after,output.processing);
      all('[data-master-ab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.masterAb==='b')));
      message('Master ready. Target '+settings.target.toFixed(1)+' LUFS; reached '+fmt(output.after.integratedLufs,'LUFS')+'. Audition A/B before applying.');
    }catch(e){invalidate();message(e.message||'Mastering failed.',true)}
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
      const node=ctx.createBufferSource();node.buffer=w.toNative(buffer);node.connect(ctx.destination);
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
  return ()=>{disposed=true;stopPreview(true);prepared=null;sourceRef=null};
}
