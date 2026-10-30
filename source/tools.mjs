import {encodeWav,extractSegment,getAudioPeaks} from './studio-audio.mjs';
import {encodeFlac16,encodeM4aWithMediaRecorder,isAacM4aSupported} from './dsp/audio-export.mjs';
import {reverseAudio,bpmDurations,detectSilenceBounds,trimAudio,normalizeAudio} from './dsp/quick-tools.mjs';
import {pulseProject} from './core/project-session.mjs';
import {decodeLocalAudio,decodedAudioBytes} from './core/media-loader.mjs';
import {createStoredZip} from './dsp/zip-store.mjs';
import {clampPlayhead,pointerToTime,nudgePlayhead,viewportRange,viewportTime,viewportPercent,snapBeat,loopTime} from './playhead.mjs';
import {analysisRange,midiLabel,tuningCorrection} from './dsp/harmonic-workflow.mjs';
import {audioFileError} from './file-support.mjs';

function createProductionWorker(){return new Worker(new URL('./production-worker.mjs',import.meta.url),{type:'module'});}
function createKeyWorker(){return new Worker(new URL('./key-worker.mjs',import.meta.url),{type:'module'});}

export function initStudioTools(getBpmTrack){
  const el=id=>document.getElementById(id);
  const workspace=pulseProject.workspace;
  const tools={eqNodes:null,eqOutputGain:null,eqAnalyser:null,eqSelection:null,eqSelectMode:false,eqDragId:null,eqDragStart:0,peaksRight:null,category:'analyze',masterCandidate:null,reference:null,referenceGeneration:0,bpmEdited:false,productionCandidate:null,productionWorker:null,bpmWorker:null,markers:[],selectedSlice:0,dragMarker:-1,dragSeekId:null,scrubTransport:null,playhead:0,zoom:1,viewStart:0,snap:false,loopEnabled:false,loopFrom:0,loopTo:0,transport:null,raf:0,quickCandidate:null,quickBounds:null,file:null,buffer:null,loading:false,operation:0,tab:'key',context:null,source:null,playing:false,previewTimer:null,keyWorker:null,keyResult:null,tunerResult:null,from:0,to:8,peaks:[],bpm:120,bpmOffset:0};
  let extraApi=null,denoiseApi=null;
  const durationText=seconds=>{const s=Math.max(0,Number(seconds)||0),m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
  const precise=seconds=>`${durationText(seconds)}.${String(Math.floor((seconds%1)*100)).padStart(2,'0')}`;
  const filename=ext=>(tools.file?.name||'Pulse audio').replace(/\.[^.]+$/,'')+'.'+ext;
  const readableSize=bytes=>`${(bytes/(1024*1024)).toLocaleString('en-US',{maximumFractionDigits:1})} MB`;
  let overviewPaintedFor=null,overviewPaintedWidth=0;
  function updateEqOverviewPosition(){
    const duration=tools.buffer?.duration;
    if(!duration||tools.tab!=='equalizer')return;
    const view=viewportRange(duration,tools.zoom,tools.viewStart);
    const windowEl=el('eq-overview-window');
    windowEl.style.left=(view.start/duration*100)+'%';
    windowEl.style.width=Math.max(.35,(view.span/duration)*100)+'%';
    const line=el('eq-overview-playhead');
    line.style.left=(tools.playhead/duration*100)+'%';
    const slider=el('eq-overview-canvas');
    slider.setAttribute('aria-valuemax',String(duration));
    slider.setAttribute('aria-valuenow',String(Number(tools.playhead.toFixed(3))));
    slider.setAttribute('aria-valuetext',tools.playhead.toFixed(3)+' seconds');
    status('eq-overview-duration',duration.toFixed(3)+'s');
    status('eq-overview-start',view.start.toFixed(3)+'s');
  }
  function drawEqOverview(){
    if(!tools.buffer||tools.tab!=='equalizer')return;
    const canvas=el('eq-overview-canvas'),rect=canvas.getBoundingClientRect();
    const w=Math.max(240,rect.width||720),h=68,dpr=Math.min(window.devicePixelRatio||1,2);
    const key=tools.buffer;
    if(overviewPaintedFor!==key||overviewPaintedWidth!==Math.round(w)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      const ctx=canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle='#000000';ctx.fillRect(0,0,w,h);
      const mono=tools.peaks||[],stereo=tools.peaksRight||null;
      const bars=Math.min(900,Math.max(100,Math.round(w/2)));
      const gap=w/bars;
      for(let i=0;i<bars;i++){
        const index=Math.min(mono.length-1,Math.floor((i+.5)/bars*mono.length));
        const l=mono[Math.max(0,index)]||0,r=stereo?.[Math.max(0,index)]||l;
        const peak=Math.min(1,Math.max(l,r));
        const height=Math.max(1,peak*(h-10));
        ctx.fillStyle='#FF0000';
        ctx.fillRect(i*gap,(h-height)/2,Math.max(1,gap*.72),height);
      }
      overviewPaintedFor=key;overviewPaintedWidth=Math.round(w);
      let peak=0;for(const p of mono)peak=Math.max(peak,p);
      for(const p of stereo||[])peak=Math.max(peak,p);
      status('eq-peak-info',peak>0?'PEAK '+(20*Math.log10(peak)).toFixed(1)+' dBFS':'PEAK −∞ dBFS');
    }
    updateEqOverviewPosition();
  }
  function seekOverview(event){
    if(!tools.buffer||tools.loading)return;
    const rect=el('eq-overview-canvas').getBoundingClientRect();
    const fraction=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));
    const seconds=fraction*tools.buffer.duration;
    if(tools.zoom>1){
      const span=tools.buffer.duration/tools.zoom;
      tools.viewStart=viewportRange(tools.buffer.duration,tools.zoom,seconds-span/2).start;
      drawToolWave();updateWaveControls();
    }else{
      if(tools.playing)void seekTool(seconds,true);
      else updatePlayhead(seconds);
    }
  }
  el('eq-overview-canvas').addEventListener('pointerdown',event=>{
    if(event.button!==0||!tools.buffer)return;
    el('eq-overview-canvas').setPointerCapture(event.pointerId);
    seekOverview(event);
  });
  el('eq-overview-canvas').addEventListener('pointermove',event=>{
    if(el('eq-overview-canvas').hasPointerCapture(event.pointerId))seekOverview(event);
  });
  el('eq-overview-canvas').addEventListener('keydown',event=>{
    if(!tools.buffer)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();
      const delta=tools.buffer.duration*(event.shiftKey?.1:.02)*(event.key==='ArrowRight'?1:-1);
      const next=Math.max(0,Math.min(tools.buffer.duration,tools.playhead+delta));
      if(tools.zoom>1)tools.viewStart=viewportRange(tools.buffer.duration,tools.zoom,next-tools.buffer.duration/tools.zoom/2).start;
      updatePlayhead(next);drawToolWave();updateWaveControls();
    }
  });
  el('eq-fit-track').onclick=()=>setZoom(1);
  el('eq-split-channels').onchange=()=>drawToolWave();
  function syncEqEditor(){
    const loaded=Boolean(tools.buffer),eq=tools.tab==='equalizer';
    el('eq-wave-editor').hidden=!eq||!loaded;
    el('pulse-eq-left').hidden=!eq||!loaded;
    el('eq-overview').hidden=!eq||!loaded;
    el('eq-select-region').setAttribute('aria-pressed',String(tools.eqSelectMode));
    const selection=tools.eqSelection,duration=tools.buffer?.duration||0;
    updateEqOverviewPosition();
    el('eq-region-in').max=String(duration);el('eq-region-out').max=String(duration);
    if(document.activeElement!==el('eq-region-in'))el('eq-region-in').value=(selection?.from??0).toFixed(3);
    if(document.activeElement!==el('eq-region-out'))el('eq-region-out').value=(selection?.to??duration).toFixed(3);
    el('eq-play-region').disabled=!selection||!loaded;
    el('eq-clear-region').disabled=!selection;
    el('wave-trim-range').disabled=!selection;el('wave-delete-range').disabled=!selection;
    status('eq-range-length',selection?precise(selection.to-selection.from)+' SELECTED':'FULL TRACK');
    status('eq-scope-info',selection?'PROCESSING SCOPE · '+selection.from.toFixed(3)+'s – '+selection.to.toFixed(3)+'s':'PROCESSING SCOPE · ENTIRE TRACK');
    el('tool-waveform').setAttribute('aria-label',eq?'EQ waveform: click to seek; Select Range and drag, or Shift and drag':'Waveform playback position; click or drag to seek');
  }
  function setEqSelection(from,to){
    if(!tools.buffer)return;
    const duration=tools.buffer.duration,start=clampPlayhead(Math.min(from,to),duration),end=clampPlayhead(Math.max(from,to),duration);
    tools.eqSelection=end-start>=.02?{from:start,to:end}:null;
    syncEqEditor();drawToolWave();
  }
  el('eq-select-region').onclick=()=>{tools.eqSelectMode=!tools.eqSelectMode;syncEqEditor();};
  el('eq-clear-region').onclick=()=>{tools.eqSelection=null;syncEqEditor();drawToolWave();};
  el('eq-play-region').onclick=()=>{void extraApi?.previewEqRange?.();};
  for(const side of ['in','out'])el('eq-region-'+side).onchange=event=>{
    if(!tools.buffer)return;
    const selection=tools.eqSelection;
    const from=side==='in'?Number(event.target.value):selection?.from??0;
    const to=side==='out'?Number(event.target.value):selection?.to??tools.buffer.duration;
    if(!Number.isFinite(from)||!Number.isFinite(to)){syncEqEditor();return;}
    setEqSelection(from,to);
  };
  el('wave-noise-reduction').oninput=()=>status('wave-noise-level',el('wave-noise-reduction').value+' dB');
  async function waveEditAction(action){
    if(!tools.buffer||tools.loading)return;
    const original=tools.buffer,selected=tools.eqSelection;
    const rate=original.sampleRate,source=channels(original);
    const statusId='wave-edit-status',token=++tools.operation;
    stopPreview();setBusy(true);
    status(statusId,'Processing audio locally…');
    try{
      await new Promise(resolve=>setTimeout(resolve,0));
      if(token!==tools.operation)return;
      if(action==='split'){
        const parts=splitWaveform(source,rate,tools.playhead,5);
        const files=[{name:'split-A.wav',data:encodeWav(parts.left,rate,24)},
          {name:'split-B.wav',data:encodeWav(parts.right,rate,24)}];
        download(await createStoredZip(files),filename('split-parts.zip'));
        status(statusId,'Two split WAV clips exported in one ZIP. Workspace unchanged.');
        return;
      }
      let result,report='';
      if(action==='trim'||action==='delete'){
        if(!selected)throw Error('Choose an IN–OUT range in the waveform first.');
        if(action==='trim'){
          result=trimWaveform(source,rate,selected.from,selected.to,5);
          tools.playhead=0;report='Selection trimmed to clip with 5 ms fades.';
        }else{
          result=deleteWaveformRange(source,rate,selected.from,selected.to,5);
          tools.playhead=selected.from;report='Selection deleted with micro-fades at the cut.';
        }
      }else if(action==='silence'){
        const thresholdDb=Number(el('wave-quiet-db').value),minPauseMs=Number(el('wave-quiet-ms').value);
        const removed=removeQuietPauses(source,rate,{thresholdDb,minPauseMs,keepMs:120,fadeMs:5});
        result=removed.channels;report=removed.removed+' long pause(s) shortened. Undo is available.';
      }else if(action==='noise'){
        result=reduceNoiseGate(source,rate,{
          thresholdDb:Number(el('wave-quiet-db').value),
          maxReductionDb:Number(el('wave-noise-reduction').value)
        });
        report='Conservative noise gate applied; this is not neural denoising. Compare by ear.';
      }else return;
      if(original!==tools.buffer)throw Error('The audio changed during processing.');
      tools.eqSelection=null;
      workspace.apply(asAudioBuffer(result,rate));workingChanged();
      status(statusId,report);
    }catch(err){status(statusId,err.message||'Waveform operation failed.');}
    finally{if(token===tools.operation)setBusy(false);}
  }
  el('wave-trim-range').onclick=()=>void waveEditAction('trim');
  el('wave-delete-range').onclick=()=>void waveEditAction('delete');
  el('wave-split').onclick=()=>void waveEditAction('split');
  el('wave-remove-pauses').onclick=()=>void waveEditAction('silence');
  el('wave-denoise').onclick=()=>void waveEditAction('noise');
  document.addEventListener('keydown',event=>{
    if(!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='z')return;
    if(!document.activeElement?.closest('#toolkit')||document.activeElement?.closest('#producer-studio')||event.defaultPrevented)return;
    if(document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))return;
    if(tools.loading)return;
    event.preventDefault();
    if(event.shiftKey){if(workspace.redo())workingChanged();}
    else if(workspace.undo())workingChanged();
  });
  function workingChanged(){
    tools.masterCandidate=null;resetMasterUI();stopPreview();tools.productionWorker?.terminate();tools.productionWorker=null;tools.productionCandidate=null;tools.masterCandidate=null;tools.markers=[];tools.selectedSlice=0;tools.quickCandidate=null;tools.quickBounds=null;
    extraApi?.onWorkspaceChanged?.();
    denoiseApi?.invalidate?.();
    const snapshot=workspace.snapshot();tools.file=snapshot.file;tools.buffer=snapshot.working;
    overviewPaintedFor=null;
    extraApi?.updateSeparationAvailability?.();tools.playhead=clampPlayhead(tools.playhead,tools.buffer?.duration);
    if(tools.eqSelection){const {from,to}=tools.eqSelection;tools.eqSelection=to<=tools.buffer?.duration?{from,to}:null;}
    el('workspace-undo').disabled=!snapshot.canUndo;el('workspace-redo').disabled=!snapshot.canRedo;el('workspace-original').disabled=!snapshot.hasChanges;
    status('workspace-state',snapshot.hasChanges?'WORKING AUDIO':'ORIGINAL');
    if(!tools.buffer){el('tool-loaded').hidden=true;el('tool-empty').hidden=false;updatePlayhead(0);return;}
    const buffer=tools.buffer;
    overviewPaintedFor=null;
    tools.peaks=getAudioPeaks(buffer.getChannelData(0),2160);
    tools.peaksRight=buffer.numberOfChannels>1?getAudioPeaks(buffer.getChannelData(1),2160):null;
    tools.from=0;tools.to=Math.min(buffer.duration,8);
    // Keep the producer's timeline context through Apply / Undo / Redo.
    tools.playhead=clampPlayhead(tools.playhead,buffer.duration);
    tools.viewStart=viewportRange(buffer.duration,tools.zoom,tools.viewStart).start;
    tools.loopFrom=clampPlayhead(tools.loopFrom,buffer.duration);
    tools.loopTo=clampPlayhead(tools.loopTo,buffer.duration);
    if(tools.loopTo-tools.loopFrom<.05){tools.loopEnabled=false;tools.loopFrom=0;tools.loopTo=buffer.duration;}
    updateWaveControls();
    el('tool-name').textContent=tools.file?.name||'Audio';
    status('tool-details',`${durationText(buffer.duration)} · ${buffer.numberOfChannels} ch. · ${(buffer.sampleRate/1000).toFixed(1)} kHz`);
    el('tool-loaded').hidden=false;el('tool-empty').hidden=true;
    updateTrimInputs();drawToolWave();updatePlayhead(tools.playhead);resetKey();updateButtons();syncEqEditor();
    el('tool-insights').hidden=!['mix','master'].includes(tools.tab);
  }
  window.addEventListener('pulse:advanced-applied',workingChanged);
  function asAudioBuffer(data,rate){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw new Error('Web Audio API unavailable.');
    tools.context||=new Ctx();
    const buffer=tools.context.createBuffer(data.length,data[0].length,rate);
    data.forEach((channel,i)=>buffer.copyToChannel(channel,i));
    return buffer;
  }
  function clearQuick(){tools.quickCandidate=null;tools.quickBounds=null;drawToolWave();}
  async function prepareQuick(kind){
    if(!tools.buffer)throw new Error('Load audio first.');
    const buffer=tools.buffer,rate=buffer.sampleRate,source=channels(buffer);
    let result;
    if(kind==='reverse'){
      result=reverseAudio(source,rate);status('reverse-status','Channels reversed. Duration and sample rate unchanged.');
    }else if(kind==='trim'){
      const threshold=Number(el('trim-threshold').value),padding=Number(el('trim-padding').value);
      const bounds=detectSilenceBounds(source,rate,threshold,padding);
      tools.quickBounds=bounds;
      result=trimAudio(source,bounds);
      status('trim-status',`Removed ${bounds.removedSeconds.toFixed(3)} s of silence · new range ${bounds.startSeconds.toFixed(3)}–${bounds.endSeconds.toFixed(3)} s.`);
    }else if(kind==='normalizer'){
      const options={mode:el('norm-mode').value,targetPeak:Number(el('norm-peak').value),targetLufs:Number(el('norm-lufs').value),ceiling:Number(el('norm-ceiling').value)};
      const normalization=normalizeAudio(source,rate,options);
      result=normalization.channels;
      status('norm-status',`Gain ${normalization.gainDb.toFixed(2)} dB · Peak ${normalization.outputPeakDb.toFixed(2)} dBFS${normalization.outputLufs===null?'':` · LUFS ${normalization.outputLufs.toFixed(2)}`}${normalization.limited?' · Target limited by peak ceiling.':''}`);
    }else throw new Error('Unknown tool.');
    if(result[0].length*result.length*3>300*1024*1024)throw new Error('Output too large. Use a shorter file.');
    tools.quickCandidate={kind,buffer:asAudioBuffer(result,rate)};
    drawToolWave();
    return tools.quickCandidate.buffer;
  }
  async function quickAction(kind,action){
    if(tools.loading||!tools.buffer){error('Load audio first.');return;}
    clearError();stopPreview();setBusy(true);
    const token=++tools.operation;
    try{
      await new Promise(resolve=>setTimeout(resolve,0));
      if(token!==tools.operation)return;
      const buffer=await prepareQuick(kind);
      if(action==='apply'){
        workspace.apply(buffer);workingChanged();
        status(kind==='normalizer'?'norm-status':kind==='trim'?'trim-status':'reverse-status','Applied to workspace. Other tools use the updated audio.');
      }else if(action==='export'){
        const data=channels(buffer),wav=encodeWav(data,buffer.sampleRate,24);
        download(wav,filename(kind+'-pulse.wav').replace(/\.wav\.wav$/,'.wav'));
        status(kind==='normalizer'?'norm-status':kind==='trim'?'trim-status':'reverse-status',`WAV exported (${readableSize(wav.size)}).`);
      }else if(action==='preview'){
        await playBuffer(buffer,clampPlayhead(tools.playhead,buffer.duration));
      }
    }catch(e){if(token===tools.operation)error(e.message||'Processing failed.');}
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
          const btn=document.createElement('button');btn.type='button';btn.title='Copy '+val.toFixed(2)+' ms';btn.textContent=val.toFixed(2)+' ms';
          btn.onclick=async()=>{try{await navigator.clipboard.writeText(val.toFixed(2));status('calc-status','Copied: '+val.toFixed(2)+' ms');}catch{status('calc-status','Copy this value: '+val.toFixed(2)+' ms');}};
          target.append(btn);
        }
      }
      status('calc-status',`Timing values for ${value.toLocaleString('en-US')} BPM.`);
    }catch(e){target.replaceChildren();status('calc-status',e.message);}
  }
  function status(id,text){el(id).textContent=text;}
  function error(message){el('tool-error').textContent=message;el('tool-error').hidden=false;const near=el('tool-file-feedback');if(near){near.textContent=message;near.hidden=false;}}
  function clearError(){el('tool-error').hidden=true;const near=el('tool-file-feedback');if(near)near.hidden=true;}
  function setBusy(busy){tools.loading=busy;for(const id of ['master-render','master-preview-a','master-preview-b','master-apply','master-export'])el(id).disabled=busy||!tools.buffer||(id!=='master-render'&&!tools.masterCandidate&&id!=='master-preview-a');for(const id of ['pt-preview','pt-apply','pt-export','tuner-analyze','tuner-preview','tuner-apply','tuner-export','slice-auto','slice-preview','slice-export-one','slice-export-all'])el(id).disabled=busy||!tools.buffer;document.querySelectorAll('[data-quick-preview],[data-quick-apply],[data-quick-export]').forEach(button=>button.disabled=busy||!tools.buffer);el('tool-select-file').disabled=busy;el('conv-export').disabled=busy||!tools.buffer;el('cut-export').disabled=busy||!tools.buffer;el('cut-audition').disabled=busy||!tools.buffer;el('key-analyze').disabled=busy||!tools.buffer;el('tool-file-input').disabled=busy;el('master-reference-file').disabled=busy||!tools.buffer;el('master-preview-r').disabled=busy||!tools.reference;}
  function updateButtons(){setBusy(tools.loading);el('tool-reuse-bpm').hidden=!getBpmTrack()?.buffer;}
  function syncOutput(){const format=el('conv-format').value,mp3=format==='mp3',wav=format==='wav';el('conv-depth-box').hidden=!wav;el('conv-bitrate-box').hidden=!mp3;el('conv-dither-box').hidden=!wav||el('conv-depth').value!=='16';const sourceRate=tools.buffer?.sampleRate||48000;const selected=el('conv-rate').value;const rate=selected==='original'?sourceRate:Number(selected);if(mp3&&![44100,48000].includes(rate)){el('conv-rate').value='48000';}for(const rateValue of ['88200','96000'])el('conv-rate').querySelector('option[value="'+rateValue+'"]').disabled=mp3;}
  function updateBpmFromAnalyzer(){
    const project=pulseProject.snapshot(),other=getBpmTrack();
    const bpm=project.bpm||other?.bpm;
    if(bpm){tools.bpm=bpm;tools.bpmOffset=Number(project.beatOffset??other?.beatOffset)||0;el('cut-bpm').value=bpm;}
  }
  function resetKey(){
    tools.keyResult=null;tools.tunerResult=null;
    updatePitchKey();el('key-result').hidden=true;el('key-idle').hidden=false;el('key-alternatives').hidden=true;
    el('tuner-target').replaceChildren(new Option('Analyze first',''));el('tuner-target').disabled=true;
    el('tuner-semitones').value='0';el('tuner-cents-adjust').value='0';updateTunerLabels();
    for(const id of ['tuner-note','tuner-frequency','tuner-cents'])status(id,'—');
    status('tuner-confidence','AWAITING ANALYSIS');status('tuner-stability','STABILITA —');
    status('key-range-readout','Full track');status('tuner-range-readout','Analysis starts at playhead. Optionally skip attack.');
    status('key-status','Key estimation is approximate.');
  }
  function updateWaveControls(){
    const duration=tools.buffer?.duration||0;
    const label=el('wave-zoom-label');if(label)label.textContent=tools.zoom+'×';
    el('wave-zoom-out').disabled=tools.zoom<=1;el('wave-zoom-in').disabled=tools.zoom>=Math.min(65536,Math.max(8,Math.ceil(duration/.02)));
    const current=viewportRange(duration,tools.zoom,tools.viewStart);
    el('wave-pan-left').disabled=current.start<.001;el('wave-pan-right').disabled=current.end>=duration-.001;
    el('wave-loop').setAttribute('aria-pressed',String(tools.loopEnabled));el('wave-loop').textContent=tools.loopEnabled?'LOOP ON':'LOOP OFF';
    el('wave-snap').setAttribute('aria-pressed',String(tools.snap));el('wave-snap').textContent=tools.snap?'SNAP ON':'SNAP OFF';
    const out=duration?tools.loopTo:0;
    status('wave-loop-info',`LOOP ${precise(tools.loopFrom)} – ${precise(out)} · ${tools.loopEnabled?'ON':'OFF'} · Grid ${Number(tools.bpm)||120} BPM (offset ${tools.bpmOffset.toFixed(2)}s)`);
  }
  function resetWaveView(duration){
    tools.zoom=1;tools.viewStart=0;tools.loopEnabled=false;tools.snap=false;tools.loopFrom=0;tools.loopTo=duration||0;
    updateWaveControls();
  }
  function setZoom(next){
    if(!tools.buffer)return;
    const old=viewportRange(tools.buffer.duration,tools.zoom,tools.viewStart);
    const focus=tools.playhead>=old.start&&tools.playhead<=old.end?tools.playhead:old.start+old.span/2;
    tools.zoom=Math.max(1,Math.min(Math.min(65536,Math.max(8,Math.ceil(tools.buffer.duration/.02))),next));
    tools.viewStart=viewportRange(tools.buffer.duration,tools.zoom,focus-tools.buffer.duration/tools.zoom/2).start;
    drawToolWave();updatePlayhead(tools.playhead);updateWaveControls();
  }
  function panWave(direction){
    if(!tools.buffer)return;
    const view=viewportRange(tools.buffer.duration,tools.zoom,tools.viewStart);
    tools.viewStart=viewportRange(tools.buffer.duration,tools.zoom,view.start+view.span*.75*direction).start;
    drawToolWave();updatePlayhead(tools.playhead);updateWaveControls();
  }
  function markLoop(which){
    if(!tools.buffer)return;
    const duration=tools.buffer.duration,where=clampPlayhead(tools.playhead,duration);
    if(which==='in'){tools.loopFrom=Math.min(where,duration-.05);tools.loopTo=Math.max(tools.loopTo,tools.loopFrom+.05);}
    else{tools.loopTo=Math.max(.05,where);tools.loopFrom=Math.min(tools.loopFrom,tools.loopTo-.05);}
    tools.loopFrom=clampPlayhead(tools.loopFrom,duration);tools.loopTo=clampPlayhead(tools.loopTo,duration);
    updateWaveControls();drawToolWave();
  }
  function updatePlayhead(time){
    const duration=tools.buffer?.duration||0;
    tools.playhead=clampPlayhead(time,duration);
    let view=viewportRange(duration,tools.zoom,tools.viewStart);
    if(tools.playing&&tools.zoom>1&&tools.playhead>view.end-.03&&tools.playhead<duration-.03){
      tools.viewStart=viewportRange(duration,tools.zoom,tools.playhead-view.span*.1).start;
      view=viewportRange(duration,tools.zoom,tools.viewStart);drawToolWave();updateWaveControls();
    }
    const marker=el('tool-playhead');if(marker){const percent=viewportPercent(tools.playhead,duration,tools.zoom,tools.viewStart);marker.hidden=percent<0||percent>100;marker.style.left=Math.max(0,Math.min(100,percent))+'%';}
    const canvas=el('tool-waveform');if(canvas){canvas.setAttribute('aria-valuemax',String(duration));canvas.setAttribute('aria-valuenow',String(Number(tools.playhead.toFixed(2))));canvas.setAttribute('aria-valuetext',precise(tools.playhead));}
    status('tool-time',`${precise(tools.playhead)} / ${precise(duration)}`);
    updateEqOverviewPosition();
  }
  function positionDuringPlayback(){
    const transport=tools.transport;
    if(!transport||!tools.playing)return tools.playhead;
    const elapsed=Math.max(0,tools.context.currentTime-transport.startedAt);
    if(transport.loop)return loopTime(transport.from,transport.loopFrom,transport.loopTo,elapsed);
    return clampPlayhead(Math.min(transport.to,transport.from+elapsed),tools.buffer?.duration);
  }
  function stopPreview(){
    if(tools.playing)updatePlayhead(positionDuringPlayback());
    clearInterval(tools.previewTimer);tools.previewTimer=null;
    cancelAnimationFrame(tools.raf);tools.raf=0;
    if(tools.source){tools.source.onended=null;try{tools.source.stop();}catch{}tools.source.disconnect();tools.source=null;}
    if(tools.spectralNode){tools.spectralNode.disconnect();tools.spectralNode=null;}
    tools.playing=false;tools.transport=null;tools.eqNodes=null;tools.eqOutputGain=null;tools.eqAnalyser=null;
    el('tool-preview').textContent='▶';el('tool-preview').setAttribute('aria-label','Play audio');
  }
  function advancePlayhead(){
    if(!tools.playing)return;
    updatePlayhead(positionDuringPlayback());
    tools.raf=requestAnimationFrame(advancePlayhead);
  }
  async function seekTool(time,autoplay=true,sourceTransport=tools.transport){
    if(!tools.buffer||tools.loading)return;
    const active=sourceTransport;
    const buffer=active?.buffer||tools.buffer,volume=active?.volume??1;
    const eqOptions=tools.tab==='equalizer'?(extraApi?.eqPreviewOptions?.()||{}):{};
    const eqBands=active?.eqBands??eqOptions.eqBands??null,eqGainDb=active?.eqGainDb??eqOptions.eqGainDb??0;
    const next=clampPlayhead(time,tools.buffer.duration);
    const inPreviousRange=active&&next>=active.from&&next<active.to;
    const end=inPreviousRange?active.to:buffer.duration;
    stopPreview();updatePlayhead(next);
    if(autoplay)await playBuffer(buffer,clampPlayhead(next,buffer.duration),end,volume,{eqBands,eqGainDb});
  }
  function remove(){clearMasterReference();tools.masterCandidate=null;resetMasterUI();tools.bpmWorker?.terminate();tools.bpmWorker=null;tools.productionWorker?.terminate();tools.productionWorker=null;tools.productionCandidate=null;tools.markers=[];workspace.clear();tools.quickCandidate=null;tools.quickBounds=null;el('workspace-undo').disabled=true;el('workspace-redo').disabled=true;el('workspace-original').disabled=true;status('workspace-state','ORIGINAL');tools.operation++;tools.keyWorker?.terminate();tools.keyWorker=null;stopPreview();tools.file=null;tools.buffer=null;tools.peaks=[];tools.peaksRight=null;tools.eqSelection=null;tools.from=0;tools.to=8;tools.playhead=0;resetWaveView(0);tools.transport=null;updatePlayhead(0);el('tool-file-input').value='';pulseProject.clear('toolkit');el('tool-loaded').hidden=true;el('tool-empty').hidden=false;resetKey();clearError();setBusy(false);updateButtons();}
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
    const invalid=audioFileError(file);if(invalid){error(invalid);return;}
    const token=++tools.operation;tools.bpmEdited=false;
    stopPreview();tools.keyWorker?.terminate();tools.keyWorker=null;
    setBusy(true);status('conv-status','Loading audio…');const feedback=el('tool-file-feedback');feedback.textContent='Reading '+file.name+'…';feedback.hidden=false;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw new Error('Audio decoding is not supported in this browser.');
      tools.context||=new Ctx();
      const OfflineContext=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      const {buffer}=await decodeLocalAudio(file,{context:tools.context,OfflineContext});
      const mobile=typeof navigator!=='undefined'&&/iPhone|iPad|Android/i.test(navigator.userAgent);
      if(decodedAudioBytes(buffer)>(mobile?160:600)*1024*1024)throw Error('Decoded audio exceeds available memory. Choose a shorter track.');
      if(token!==tools.operation)return;
      clearMasterReference();
      if(buffer.duration>1200)throw new Error('Maximum duration is 20 minutes.');
      tools.bpmWorker?.terminate();tools.bpmWorker=null;tools.productionWorker?.terminate();tools.productionWorker=null;tools.productionCandidate=null;tools.masterCandidate=null;resetMasterUI();tools.markers=[];pulseProject.load(buffer,file,'toolkit');tools.file=file;tools.buffer=buffer;tools.peaks=getAudioPeaks(buffer.getChannelData(0),2160);tools.peaksRight=buffer.numberOfChannels>1?getAudioPeaks(buffer.getChannelData(1),2160):null;tools.eqSelection=null;tools.from=0;
      tools.to=Math.min(buffer.duration,8);tools.playhead=0;resetWaveView(buffer.duration);updatePlayhead(0);updateBpmFromAnalyzer();
      el('tool-name').textContent=file.name;el('tool-name').title=file.name;
      status('tool-ext',file.name.split('.').pop().toUpperCase());
      status('tool-details',`${durationText(buffer.duration)} · ${readableSize(file.size)} · ${buffer.numberOfChannels} ch. · ${(buffer.sampleRate/1000).toFixed(1)} kHz`);
      el('tool-loaded').hidden=false;el('tool-empty').hidden=true;resetKey();updateTrimInputs();syncEqEditor();drawToolWave();
      el('tool-insights').hidden=!['mix','master'].includes(tools.tab);
      syncOutput();el('tool-file-feedback').hidden=true;status('conv-status','Ready to export.');status('cut-status','Set loop length or select a number of bars.');
      updatePlayhead(0);
    }catch(e){if(token===tools.operation){error('Cannot decode audio: '+(e?.message||'unsupported codec')+'. MP4/M4A/FLAC support depends on the browser.');status('conv-status','Failed to load file.');}}
    finally{if(token===tools.operation){setBusy(false);updateButtons();if(tools.buffer?.duration>=6)detectTrackBpm();}}
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
      const script=document.createElement('script');script.src='/vendor/lamejs.iife.js';script.async=true;
      script.onload=()=>window.lamejs?.Mp3Encoder?resolve(window.lamejs):reject(new Error('MP3 encoder unavailable.'));
      script.onerror=()=>reject(new Error('Cannot load locally bundled MP3 encoder. Reload PULSE or export WAV.'));
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
      const format=el('conv-format').value,requestedRate=el('conv-rate').value,rate=requestedRate==='original'?tools.buffer.sampleRate:Number(requestedRate),bitDepth=Number(el('conv-depth').value),bitrate=Number(el('conv-bitrate').value),dither=el('conv-dither').checked&&bitDepth===16;
      if(format==='mp3'&&!([44100,48000].includes(rate)))throw new Error('MP3 encoder supports only 44.1 or 48 kHz.');
      const approx=tools.buffer.duration*rate*Math.min(2,tools.buffer.numberOfChannels)*(bitDepth/8);
      if(format==='wav'&&approx>300*1024*1024)throw new Error('WAV would exceed 300 MB. Reduce sample rate or duration.');
      status('conv-status',rate===tools.buffer.sampleRate?'Preparing export…':'Resampling audio…');
      let data=await renderedChannels(rate);
      if(el('conv-normalize').value!=='off'){
        status('conv-status','Measuring loudness and normalizing…');
        const {runProducerWorker}=await import('/modules/producer-studio.mjs');
        const normalized=await runProducerWorker('normalize',data,rate,{mode:el('conv-normalize').value,targetPeak:Number(el('conv-peak-target').value),targetLufs:Number(el('conv-lufs-target').value),ceiling:Number(el('conv-ceiling').value)});
        data=normalized.channels;const measured=normalized.stats;
        status('conv-normalization-result',`PCM: ${measured.peakDb.toFixed(1)} dBFS · ${measured.truePeakDb.toFixed(1)} dBTP${measured.lufs!==null?' · '+measured.lufs.toFixed(1)+' LUFS':''}${measured.constrained?' · Gain capped by ceiling.':''}`);
      }else status('conv-normalization-result','Normalization off.');
      if(token!==tools.operation)return;
      if(format==='flac'){
        status('conv-status','Encoding local lossless FLAC…');const blob=encodeFlac16(data,rate);if(token!==tools.operation)return;
        download(blob,filename('flac'));status('conv-status',`FLAC 16-bit · ${(rate/1000).toFixed(1)} kHz · ${readableSize(blob.size)}.`);
      }else if(format==='m4a'){
        if(!isAacM4aSupported())throw Error('Your browser does not offer an AAC/MP4 MediaRecorder encoder. Use WAV, FLAC or MP3.');
        status('conv-status','Recording AAC locally in real time…');
        const out=asAudioBuffer(data,rate),blob=await encodeM4aWithMediaRecorder(out,192000,pct=>status('conv-status',`Encoding AAC… ${pct}%`));
        if(token!==tools.operation)return;download(blob,filename('m4a'));status('conv-status',`AAC/M4A ~192 kbps · ${readableSize(blob.size)}.`);
      }else if(format==='wav'){status('conv-status','Encoding WAV…');const blob=encodeWav(data,rate,bitDepth,{dither});download(blob,filename('wav'));const peakDb=samplePeakDbfs(data);status('conv-status',`WAV ${bitDepth===32?'32-bit float':bitDepth+'-bit PCM'} · ${(rate/1000).toFixed(1)} kHz · ${data.length} ch · ${durationText(tools.buffer.duration)} · ${readableSize(blob.size)} · Peak ${Number.isFinite(peakDb)?peakDb.toFixed(1)+' dBFS':'silence'}`);}
      else if(format==='mp3'){status('conv-status','Loading MP3 encoder…');const blob=await toMp3(data,rate,bitrate,token);download(blob,filename('mp3'));status('conv-status',`MP3 ${bitrate} kbps · ${(rate/1000).toFixed(1)} kHz · ${data.length} ch · ${readableSize(blob.size)} (lossy).`);}else throw Error('Unknown export format.');
    }catch(e){if(token===tools.operation){error(e.message);status('conv-status','Export failed.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  async function exportCleanAudio(buffer,format){
    if(!buffer)throw Error('No cleaned audio available.');
    const data=channels(buffer),rate=buffer.sampleRate;
    if(format==='wav'){const blob=encodeWav(data,rate,16,{dither:true});download(blob,filename('clean.wav'));return 'Clean WAV 16-bit downloaded.';}
    if(format==='flac'){const blob=encodeFlac16(data,rate);download(blob,filename('clean.flac'));return 'Clean FLAC 16-bit downloaded.';}
    if(format==='m4a'){
      if(!isAacM4aSupported())throw Error('AAC/M4A encoding is unavailable in this browser. Choose WAV, FLAC or MP3.');
      const blob=await encodeM4aWithMediaRecorder(buffer,192000,pct=>status('denoise-status','Encoding AAC '+pct+'%'));
      download(blob,filename('clean.m4a'));return 'Clean AAC/M4A 192 kbps downloaded.';
    }
    if(/^mp3-(64|128|192|320)$/.test(format)){
      const bitrate=Number(format.slice(4));
      if(![44100,48000].includes(rate))throw Error('MP3 requires 44.1 or 48 kHz. Convert sample rate first.');
      const token=tools.operation;
      const blob=await toMp3(data,rate,bitrate,token);
      download(blob,filename('clean.mp3'));
      return 'Clean MP3 '+bitrate+' kbps downloaded.';
    }
    throw Error('Unsupported clean export format.');
  }
  const groups={
    analyze:['key','tuner','calculator'],
    edit:['cutter','pitch','slicer','reverse','trim','equalizer','denoise'],
    export:['converter','normalizer'],
    ai:['master','mix']
  };
  function selectCategory(category,selectFirst=true){
    if(!groups[category])return;
    tools.category=category;
    document.querySelectorAll('[data-category]').forEach(button=>{
      const active=button.dataset.category===category;
      button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
    });
    document.querySelectorAll('[data-group]').forEach(button=>button.hidden=button.dataset.group!==category);
    el('analyze-shortcuts').hidden=category!=='analyze';

    document.querySelectorAll('[data-group-nav]').forEach(link=>{
      const active=link.dataset.groupNav===category;
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
    });
    const bpmNav=document.querySelector('[data-nav-bpm]');if(bpmNav){bpmNav.classList.remove('active');bpmNav.removeAttribute('aria-current');}
    if(selectFirst&&!groups[category].includes(tools.tab))selectTab(groups[category][0]);
  }
  const bpmNav=document.querySelector('[data-nav-bpm]');
  if(bpmNav)bpmNav.addEventListener('click',()=>{
    document.querySelectorAll('[data-group-nav]').forEach(link=>{link.classList.remove('active');link.removeAttribute('aria-current');});
    bpmNav.classList.add('active');bpmNav.setAttribute('aria-current','location');
  });
  function selectTab(which){
    const category=Object.keys(groups).find(group=>groups[group].includes(which));
    if(!category)return;
    if(category!==tools.category)selectCategory(category,false);
    tools.tab=which;stopPreview();syncEqEditor();
    for(const name of Object.values(groups).flat()){
      const selected=which===name,tab=el('tab-'+name);
      tab.classList.toggle('selected',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;el('panel-'+name).hidden=!selected;
    }
    document.querySelectorAll('.pulse-feature-explainer[data-feature]').forEach(section=>{section.hidden=section.dataset.feature!==which;});
    const showingResults=which==='mix'||which==='master';
    el('tool-insights').hidden=!showingResults||!tools.buffer;
    for(const name of ['mix','master'])el('insights-'+name).hidden=which!==name;
    drawToolWave();updatePlayhead(tools.playhead);
  }
  function updateTrimInputs(){
    if(!tools.buffer)return;
    const duration=tools.buffer.duration;
    for(const id of ['cut-start','cut-end'])el(id).max=duration.toFixed(3);
    el('cut-start').value=tools.from;el('cut-end').value=tools.to;
    status('cut-start-label',precise(tools.from));status('cut-end-label',precise(tools.to));
    const bpm=Number(el('cut-bpm').value),segmentLength=Math.max(0,tools.to-tools.from);
    const bars=Number.isFinite(bpm)&&bpm>0?segmentLength*bpm/240:0;
    status('cut-loop-info',`${precise(segmentLength)} · ${Number.isFinite(bars)?bars.toFixed(2):'—'} bars at ${Number.isFinite(bpm)?bpm:'—'} BPM`);
    // Keep the live loop aligned with the Cutter selection after slider edits.
    if(tools.loopEnabled&&tools.tab==='cutter'&&segmentLength>=.05){
      tools.loopFrom=tools.from;tools.loopTo=tools.to;
      if(tools.transport?.loop&&tools.source?.loop){
        tools.source.loopStart=tools.from;tools.source.loopEnd=tools.to;
        tools.transport.loopFrom=tools.from;tools.transport.loopTo=tools.to;
      }
      updateWaveControls();
    }
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
    if(tools.snap){const beat=60/bpm;tools.from=Math.max(0,Math.min(duration,Math.round((tools.from-tools.bpmOffset)/beat)*beat+tools.bpmOffset));}
    tools.to=Math.min(duration,tools.from+span);
    if(tools.to-tools.from<.02)tools.from=Math.max(0,duration-span);
    updateTrimInputs();drawToolWave();
    status('cut-status',span>duration-tools.from+.001?'Track is shorter than selected bar count.':'Loop duration: '+precise(tools.to-tools.from));
  }
  function drawToolWave(){
    const canvas=el('tool-waveform');if(!canvas||!tools.buffer)return;
    const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=rect.width||canvas.width,h=rect.height||140;
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const duration=tools.buffer.duration,view=viewportRange(duration,tools.zoom,tools.viewStart),bars=Math.max(80,Math.floor(w/2.5)),bar=w/bars;
    const fine=view.span<=15,rate=tools.buffer.sampleRate;
    const left=tools.buffer.getChannelData(0),right=tools.peaksRight?tools.buffer.getChannelData(1):null;
    const peakAt=(channel,precomputed,t)=>{
      if(!fine){
        const idx=Math.min(precomputed?.length-1||0,Math.floor(t/duration*(precomputed?.length||1)));
        return precomputed?.[Math.max(0,idx)]||0;
      }
      const from=Math.max(0,Math.floor((t-view.span/(bars*2))*rate));
      const to=Math.min(channel.length,Math.max(from+1,Math.ceil((t+view.span/(bars*2))*rate)));
      let peak=0;
      for(let sample=from;sample<to;sample++)peak=Math.max(peak,Math.abs(channel[sample]));
      return peak;
    };
    const px=time=>(time-view.start)/Math.max(view.span,.001)*w;
    const selection=tools.tab==='equalizer'&&tools.eqSelection?[tools.eqSelection.from,tools.eqSelection.to]:tools.tab==='cutter'?[tools.from,tools.to]:tools.tab==='trim'&&tools.quickBounds?[tools.quickBounds.startSeconds,tools.quickBounds.endSeconds]:null;
    ctx.fillStyle='#000000';ctx.fillRect(0,0,w,h);
    if(tools.tab==='equalizer'){ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(0,(h+17)/2,w,1);}
    // Time ruler remains in the same audio coordinate system as the waveform.
    const tickStep=([.001,.002,.005,.01,.02,.05,.1,.25,.5,1,2,5,10,15,30,60,120,300,600].find(v=>v>=view.span/6)||600);
    ctx.font='9px Arial, sans-serif';ctx.textBaseline='top';
    for(let t=Math.ceil(view.start/tickStep)*tickStep;t<=view.end+.0001;t+=tickStep){
      const x=px(t);ctx.fillStyle='rgba(255,255,255,.10)';ctx.fillRect(x,0,1,h);ctx.fillStyle='#c2c2ba';ctx.fillText(tickStep<.1?t.toFixed(3)+'s':precise(t),Math.max(2,Math.min(w-67,x+3)),3);
    }
    if(tools.snap&&Number.isFinite(tools.bpm)&&tools.bpm>=20&&tools.bpm<=400){
      const step=60/tools.bpm;
      if(view.span/step<=120){ctx.fillStyle='rgba(255,43,32,.21)';for(let t=Math.ceil((view.start-tools.bpmOffset)/step)*step+tools.bpmOffset;t<=view.end;t+=step)ctx.fillRect(px(t),17,1,h-17);}
    }
    if(selection){ctx.fillStyle='rgba(0,0,0,.27)';ctx.fillRect(0,17,Math.max(0,px(selection[0])),h-17);ctx.fillRect(Math.max(0,px(selection[1])),17,w-Math.max(0,px(selection[1])),h-17);}
    if(tools.loopEnabled){ctx.fillStyle='rgba(255,43,32,.10)';ctx.fillRect(Math.max(0,px(tools.loopFrom)),17,Math.max(0,Math.min(w,px(tools.loopTo))-Math.max(0,px(tools.loopFrom))),h-17);}
    for(let i=0;i<bars;i++){
      const t=view.start+(i+.5)/bars*view.span;
      const amp=Math.max(2,Math.pow(peakAt(left,tools.peaks,t),.55)*(h-20)*.78),x=i*bar;
      const isSelected=!selection||(t>=selection[0]&&t<=selection[1]);
      const peakLevel=peakAt(left,tools.peaks,t);
      ctx.fillStyle=isSelected?'#FF0000':'rgba(255,0,0,.28)';
      if(tools.tab==='equalizer'&&tools.peaksRight&&el('eq-split-channels').checked){
        const other=Math.max(2,Math.pow(peakAt(right,tools.peaksRight,t),.55)*(h-20)*.37);
        const half=(h-17)/2;
        ctx.fillRect(x,17+(half-amp*.48)/2,Math.max(1,bar*.68),amp*.48);
        ctx.fillRect(x,17+half+(half-other)/2,Math.max(1,bar*.68),other);
      }else ctx.fillRect(x,17+(h-17-amp)/2,Math.max(1,bar*(tools.tab==='equalizer'?.82:.68)),amp);
    }
    if(selection){for(const boundary of selection){const x=px(boundary);if(x<0||x>w)continue;ctx.fillStyle='#f5f4f0';ctx.fillRect(x-1,17,2,h-17);ctx.beginPath();ctx.arc(x,(h+17)/2,5,0,Math.PI*2);ctx.fill();}}
    if(tools.loopEnabled){for(const [boundary,label] of [[tools.loopFrom,'IN'],[tools.loopTo,'OUT']]){const x=px(boundary);if(x<0||x>w)continue;ctx.fillStyle='#FF0000';ctx.fillRect(x-1,17,2,h-17);ctx.fillText(label,Math.max(3,Math.min(w-30,x+4)),21);}}
    if(tools.tab==='equalizer'&&tools.peaksRight&&el('eq-split-channels').checked){
      ctx.fillStyle='#aaa9a2';ctx.fillText('L',Math.max(2,w-14),18);ctx.fillText('R',Math.max(2,w-14),(h+17)/2+3);
    }
    if(tools.tab==='slicer'&&tools.markers.length>1){
      tools.markers.slice(1,-1).forEach((value,i)=>{const x=px(value);if(x<0||x>w)return;ctx.fillStyle=i+1===tools.selectedSlice?'#fff':'#ff2b20';ctx.fillRect(x-1,17,2,h-17);ctx.fillRect(x-5,17,10,9);});
      const a=px(tools.markers[tools.selectedSlice]),b=px(tools.markers[tools.selectedSlice+1]);
      ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(Math.max(0,a),17,Math.max(0,Math.min(w,b)-Math.max(0,a)),h-17);
    }
    drawEqOverview();
  }
  async function preview(){
    if(!tools.buffer||tools.loading)return;
    if(tools.playing){stopPreview();return;}
    try{
      const cut=tools.tab==='cutter',slice=tools.tab==='slicer'&&tools.markers.length>1,eq=tools.tab==='equalizer';
      const from=eq?(tools.eqSelection?.from??tools.playhead):cut?tools.from:slice?tools.markers[tools.selectedSlice]:0;
      const to=eq?(tools.eqSelection?.to??tools.buffer.duration):cut?tools.to:slice?tools.markers[tools.selectedSlice+1]:tools.buffer.duration;
      if(to-from<.02)return;
      const offset=tools.playhead>=from&&tools.playhead<to?tools.playhead:from;
      await playBuffer(tools.buffer,offset,to,1,eq?{allowLoop:false,...(extraApi?.eqPreviewOptions?.()||{})}:{allowLoop:!slice});
    }catch(e){stopPreview();error('Playback failed: '+e.message);}
  }
  async function exportCut(){
    if(!tools.buffer||tools.loading)return;
    const token=++tools.operation;clearError();setBusy(true);stopPreview();
    try{
      if(tools.to-tools.from<.03)throw new Error('Loop must be at least 30 ms.');
      const data=extractSegment(channels(tools.buffer),tools.buffer.sampleRate,tools.from,tools.to,Math.max(5,Number(el('cut-fade').value)));
      const bitDepth=Number(el('cut-depth').value),bytes=data[0].length*data.length*(bitDepth/8);
      if(bytes>300*1024*1024)throw new Error('Loop too long. Shorten selection.');
      status('cut-status','Rendering loop…');await new Promise(r=>setTimeout(r,0));
      if(token!==tools.operation)return;
      const wav=encodeWav(data,tools.buffer.sampleRate,bitDepth);
      const stem=(tools.file.name||'loop').replace(/\.[^.]+$/,'');
      download(wav,`${stem}_${Math.round(Number(el('cut-bpm').value))}bpm_loop.wav`);
      status('cut-status',`Loop exported (${precise(tools.to-tools.from)}, ${readableSize(wav.size)}).`);
    }catch(e){if(token===tools.operation){error(e.message);status('cut-status','Export failed.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function describeRange(range){return `${range.label}: ${precise(range.from)} – ${precise(range.to)}`;}
  function selectedRange(kind){
    const mode=el(kind==='key'?'key-range':'tuner-range').value;
    return analysisRange(mode,tools.buffer.duration,tools.playhead,tools.loopFrom,tools.loopTo,tools.loopEnabled,kind==='key'?12:2,kind==='key'?2:.13);
  }
  function getKeyInput(buffer,range){
    const sr=buffer.sampleRate,step=Math.max(1,Math.round(sr/11025)),dstRate=sr/step;
    const startFrame=Math.floor(range.from*sr),endFrame=Math.min(buffer.length,Math.ceil(range.to*sr));
    // Pick the higher-energy channel, preventing out-of-phase stereo cancellation.
    const energy=Array.from({length:buffer.numberOfChannels},(_,channel)=>{
      const arr=buffer.getChannelData(channel);let sum=0;
      for(let i=startFrame;i<endFrame;i+=32)sum+=arr[i]*arr[i];return sum;
    });
    const best=buffer.getChannelData(energy.indexOf(Math.max(...energy)));
    const available=(endFrame-startFrame)/sr,chunk=Math.min(available,8);
    const fractions=available>18?[0,.45,1]:[0],segments=[];
    const chunkFrames=Math.max(1,Math.floor(chunk*sr));
    for(const fraction of fractions){
      const segmentStart=Math.min(endFrame-chunkFrames,startFrame+Math.floor((endFrame-startFrame-chunkFrames)*fraction));
      const count=Math.floor(chunkFrames/step),data=new Float32Array(count);
      for(let i=0;i<count;i++){const at=segmentStart+i*step;let total=0;for(let k=0;k<step;k++)total+=best[Math.min(endFrame-1,at+k)];data[i]=total/step;}
      segments.push(data);
    }
    const merged=new Float32Array(segments.reduce((a,b)=>a+b.length,0));let off=0;
    for(const part of segments){merged.set(part,off);off+=part.length;}
    return {samples:merged,sampleRate:dstRate};
  }
  async function analyzeKey(){
    if(!tools.buffer||tools.loading)return;
    clearError();const token=++tools.operation;setBusy(true);status('key-status','Analyzing harmony…');
    try{
      const range=selectedRange('key');
      status('key-range-readout',describeRange(range));
      const worker=createKeyWorker();tools.keyWorker=worker;
      const samples=getKeyInput(tools.buffer,range);
      const result=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Analysis timed out.'));},30000);
        worker.onmessage=({data})=>{clearTimeout(timeout);data.error?reject(new Error(data.error)):resolve(data.result);};
        worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Analysis could not start.'));};
        worker.postMessage(samples,[samples.samples.buffer]);
      });
      worker.terminate();if(token!==tools.operation)return;
      tools.keyResult=result;updatePitchKey();el('key-result').hidden=false;el('key-idle').hidden=true;el('key-alternatives').hidden=false;
      status('key-name',result.primary.display);status('key-mode',result.primary.mode==='major'?'MAJOR':'MINOR');
      status('key-camelot',result.primary.camelot);
      status('key-confidence',({higher:'STRONG MATCH',moderate:'MODERATE',low:'LOW CONFIDENCE'})[result.confidence]);
      status('key-alternatives','Other possible keys: '+result.alternatives.map(a=>`${a.display} (${a.camelot})`).join(' · '));
      status('key-status',`Result for ${describeRange(range)}. Harmonic match is not a calibrated probability. Try another section if the key changes.`);
    }catch(e){if(token===tools.operation){error(e.message);status('key-status','Key not detected.');}}
    finally{tools.keyWorker?.terminate();tools.keyWorker=null;if(token===tools.operation)setBusy(false);}
  }

  // Production audio computation runs off the main thread. The current working
  // buffer stays immutable; applying results pushes a bounded undo revision.
  async function runProduction(kind,options,overrideBuffer=null){
    if(!tools.buffer)throw Error('Load audio first.');
    const token=tools.operation,worker=createProductionWorker();tools.productionWorker?.terminate();tools.productionWorker=worker;
    const input=overrideBuffer||tools.buffer;
    const rate=input.sampleRate;
    const chosen=kind==='tuner'?options?.analysisRange:null;
    const source=channels(input).map(x=>chosen?x.slice(Math.floor(chosen.from*rate),Math.ceil(chosen.to*rate)):x.slice());
    try{
      const result=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{worker.terminate();reject(Error('Processing timed out. Use shorter audio.'));},150000);
        worker.onmessage=({data})=>{clearTimeout(timeout);data.ok?resolve(data.result):reject(Error(data.error||'Processing failed.'));};
        worker.onerror=()=>{clearTimeout(timeout);reject(Error('Background processing failed.'));};
        worker.postMessage({id:token,kind,rate,options,channels:source},source.map(x=>x.buffer));
      });
      if(token!==tools.operation)throw Error('Operation canceled because file changed.');
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
        status('pt-status',`Tempo: ~${bpm} BPM (possible half/double-time: ${(bpm/2).toFixed(1)} / ${(bpm*2).toFixed(1)}). Verify by listening. Manual values take priority.`);
      }else status('pt-status','Unable to detect reliable BPM. Enter manually.');
    };
    worker.onerror=()=>{worker.terminate();if(tools.bpmWorker===worker)tools.bpmWorker=null;};
    worker.postMessage({kind:'bpm',channels:data,rate,options:{}},[data[0].buffer]);
  }
  function updatePitchLabels(){updatePitchKey();status('pt-semitone-label',el('pt-semitones').value+' st');status('pt-cent-label',el('pt-cents').value+' cents');tools.productionCandidate=null;}
  function updateTunerLabels(){
    const step=Number(el('tuner-semitones').value),cents=Number(el('tuner-cents-adjust').value);
    status('tuner-semitone-label',`${step>0?'+':''}${step} st`);
    status('tuner-cent-label',`${cents>0?'+':''}${cents} cents`);
    const note=tools.tunerResult?.note;
    if(note){
      el('tuner-target').value=String(note.midi+step);
      status('tuner-shift-info',`${note.note} (${note.cents>=0?'+':''}${note.cents.toFixed(1)} cents) → ${midiLabel(note.midi+step)} · correction ${cents>0?'+':''}${cents} cents`);
    }else status('tuner-shift-info','Analyze sample first. Without a detected note, tuning is manual.');
    tools.productionCandidate=null;
  }
  const pitchOptions=()=>({originalBpm:Number(el('pt-original').value),targetBpm:Number(el('pt-target').value),semitones:Number(el('pt-semitones').value),cents:Number(el('pt-cents').value),preservePitch:el('pt-preserve').checked});
  async function prepareProduction(kind){
    const options=kind==='pitch'?pitchOptions():{originalBpm:120,targetBpm:120,semitones:Number(el('tuner-semitones').value),cents:Number(el('tuner-cents-adjust').value),preservePitch:true};
    if(tools.productionCandidate&&tools.productionCandidate.kind===kind&&tools.productionCandidate.input===tools.buffer&&tools.productionCandidate.settings===JSON.stringify(options))return tools.productionCandidate.buffer;
    const data=await runProduction('pitch',options);
    const out=asAudioBuffer(data,tools.buffer.sampleRate);
    tools.productionCandidate={kind,input:tools.buffer,settings:JSON.stringify(options),buffer:out};
    status(kind==='pitch'?'pt-status':'tuner-status',`Render complete · ${out.duration.toFixed(3)} s · ${out.sampleRate} Hz. Preview, Apply nebo export WAV.`);
    return out;
  }
  async function productionAction(kind,action){
    if(!tools.buffer||tools.loading){error('Load audio first.');return;}
    clearError();stopPreview();setBusy(true);const token=++tools.operation;
    try{
      status(kind==='pitch'?'pt-status':'tuner-status','Processing audio…');
      const buffer=await prepareProduction(kind);
      if(token!==tools.operation)return;
      if(action==='apply'){workspace.apply(buffer);workingChanged();status(kind==='pitch'?'pt-status':'tuner-status','Applied to workspace. Undo restores previous audio.');}
      else if(action==='export'){const blob=encodeWav(channels(buffer),buffer.sampleRate,24);download(blob,filename(kind+'-pulse.wav').replace(/\.wav\.wav$/,'.wav'));status(kind==='pitch'?'pt-status':'tuner-status',`Exported ${readableSize(blob.size)}.`);}
      else if(action==='preview')await playBuffer(buffer);
    }catch(e){if(token===tools.operation)error(e.message);}
    finally{if(token===tools.operation)setBusy(false);}
  }
  async function playBuffer(buffer,from=tools.playhead,to=buffer.duration,volume=1,{allowLoop=true,eqBands=null,eqGainDb=0,spectralProfile=null,spectralOptions=null}={}){
    stopPreview();const Ctx=window.AudioContext||window.webkitAudioContext;
    tools.context||=new Ctx();if(tools.context.state==='suspended')await tools.context.resume();
    from=clampPlayhead(from,buffer.duration);to=clampPlayhead(to,buffer.duration);
    if(to-from<.001){from=0;to=buffer.duration;}
    const looping=allowLoop&&tools.loopEnabled&&buffer===tools.buffer&&tools.loopTo-tools.loopFrom>=.05;
    if(looping){if(from<tools.loopFrom||from>=tools.loopTo)from=tools.loopFrom;to=tools.loopTo;}
    const src=tools.context.createBufferSource();src.buffer=buffer;
    if(looping){src.loop=true;src.loopStart=tools.loopFrom;src.loopEnd=tools.loopTo;}
    const gain=tools.context.createGain();gain.gain.value=Math.max(0,volume);let previous=src;
    tools.eqNodes=null;tools.eqOutputGain=null;
    if(eqBands&&eqBands.length){
      tools.eqNodes=[];
      for(const band of eqBands){
        const filter=tools.context.createBiquadFilter();
        filter.type=band.enabled?band.type:'allpass';filter.frequency.value=Math.min(band.frequency,tools.context.sampleRate*.49);
        filter.Q.value=band.q;filter.gain.value=band.gain;
        previous.connect(filter);previous=filter;tools.eqNodes.push(filter);
      }
    }
    if(eqBands){
      tools.eqOutputGain=tools.context.createGain();tools.eqOutputGain.gain.value=10**(eqGainDb/20);
      previous.connect(tools.eqOutputGain);previous=tools.eqOutputGain;
    }
    if(eqBands){
      tools.eqAnalyser=tools.context.createAnalyser();
      tools.eqAnalyser.fftSize=4096;tools.eqAnalyser.smoothingTimeConstant=.8;
      previous.connect(tools.eqAnalyser);previous=tools.eqAnalyser;
    }
    if(spectralProfile){
      if(!tools.context.audioWorklet)throw Error('AudioWorklet is unavailable in this browser. Use rendered preview.');
      await tools.context.audioWorklet.addModule('/vendor/pulse-spectral-worklet.js');
      const node=new AudioWorkletNode(tools.context,'pulse-spectral-denoiser',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[Math.min(2,buffer.numberOfChannels)]});
      node.port.postMessage({type:'configure',profiles:spectralProfile,sampleRate:buffer.sampleRate,options:spectralOptions});
      previous.connect(node);previous=node;tools.spectralNode=node;
    }
    previous.connect(gain);gain.connect(tools.context.destination);
    const startedAt=tools.context.currentTime;
    tools.transport={buffer,from,to,volume,eqBands,eqGainDb,startedAt,loop:looping,loopFrom:tools.loopFrom,loopTo:tools.loopTo};tools.source=src;tools.playing=true;
    src.onended=()=>{if(tools.source!==src)return;updatePlayhead(Math.min(to,tools.buffer?.duration||to));stopPreview();};
    if(looping)src.start(0,from);else src.start(0,from,to-from);
    updatePlayhead(Math.min(from,tools.buffer?.duration||from));
    el('tool-preview').textContent='Ⅱ';el('tool-preview').setAttribute('aria-label','Pause audio');
    advancePlayhead();
    if(tools.tab==='equalizer'&&eqBands)extraApi?.startSpectrum?.();
  }
  async function analyze808(){
    if(!tools.buffer||tools.loading)return;
    clearError();setBusy(true);const token=++tools.operation;
    status('tuner-status','Detecting fundamental frequency…');
    try{
      const range=selectedRange('tuner');
      const skip=Number(el('tuner-attack').value)/1000;
      if(range.to-range.from-skip<.13)throw Error('Region too short after skipping attack (minimum 130 ms).');
      const region={from:range.from+skip,to:Math.min(range.to,range.from+Math.max(2.5,6))};
      status('tuner-range-readout',`${describeRange(region)} · attack ${Math.round(skip*1000)} ms`);
      const result=await runProduction('tuner',{analysisRange:region});if(token!==tools.operation)return;
      tools.tunerResult=result;
      status('tuner-note',result.note?.note||'—');
      status('tuner-frequency',result.hz?result.hz.toFixed(2)+' Hz':'— Hz');
      status('tuner-cents',result.note?`${result.note.cents>=0?'+':''}${result.note.cents.toFixed(1)} cents`:'— cents');
      status('tuner-confidence',`${result.label.toUpperCase()} JISTOTA (${Math.round(result.confidence*100)}%)`);
      status('tuner-stability',result.spreadCents===null?'STABILITA —':`STABILITA ±${result.spreadCents.toFixed(1)} CENTS · ${result.stableFrames}/${result.frames} OKEN`);
      const select=el('tuner-target');select.replaceChildren();select.disabled=!result.note;
      if(result.note){
        for(let midi=result.note.midi-12;midi<=result.note.midi+12;midi++){
          if(midi<0||midi>127)continue;
          const opt=new Option(midiLabel(midi),String(midi));select.add(opt);
        }
        el('tuner-semitones').value='0';
        el('tuner-cents-adjust').value=String(result.confidence>=.52?Math.round(-result.note.cents):0);
        updateTunerLabels();
      }
      status('tuner-status',!result.note?'Cannot detect reliable pitch. Select a stable sustained section.':result.confidence<.52?'Low confidence: automatic tuning disabled. Select a stable section or tune manually.':`Detected ${result.note.note}. Suggested cents correction. Target note can be changed.`);
    }catch(e){if(token===tools.operation){error(e.message);status('tuner-status','Analysis failed.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function updateSliceUI(){
    const selection=el('slice-selection');selection.replaceChildren();
    for(let i=0;i<tools.markers.length-1;i++){
      const item=document.createElement('option');item.value=String(i);item.textContent=`Slice ${String(i+1).padStart(2,'0')} · ${tools.markers[i].toFixed(2)}–${tools.markers[i+1].toFixed(2)} s`;selection.append(item);
    }
    tools.selectedSlice=Math.min(tools.selectedSlice,Math.max(0,tools.markers.length-2));selection.value=String(tools.selectedSlice);
    status('slice-status',`${Math.max(0,tools.markers.length-1)} slices · click to seek, Shift+click to add/remove marker, drag marker to move.`);
    drawToolWave();
  }
  async function sliceAuto(){
    if(!tools.buffer||tools.loading)return;clearError();setBusy(true);const token=++tools.operation;
    try{
      status('slice-status','Detecting transients…');const markers=await runProduction('transients',{sensitivity:Number(el('slice-sensitivity').value)/100});if(token!==tools.operation)return;
      tools.markers=markers;tools.selectedSlice=0;updateSliceUI();
    }catch(e){if(token===tools.operation)error(e.message);}
    finally{if(token===tools.operation)setBusy(false);}
  }
  function sliceWav(index){
    if(!tools.buffer||index<0||index>=tools.markers.length-1)throw Error('Invalid slice.');
    const data=extractSegment(channels(tools.buffer),tools.buffer.sampleRate,tools.markers[index],tools.markers[index+1],Number(el('slice-fade').value));
    return encodeWav(data,tools.buffer.sampleRate,24);
  }
  async function sliceExport(all=false){
    if(!tools.buffer||tools.loading||tools.markers.length<2){error('Set slice markers first.');return;}
    clearError();setBusy(true);try{
      if(!all){download(sliceWav(tools.selectedSlice),`${tools.file.name.replace(/\.[^.]+$/,'')}_slice_${String(tools.selectedSlice+1).padStart(2,'0')}.wav`);}
      else{
        const entries=[];const base=tools.file.name.replace(/\.[^.]+$/,'');
        if(tools.markers.length>201)throw Error('Maximum 200 slices per ZIP.');
        for(let i=0;i<tools.markers.length-1;i++){
          const blob=sliceWav(i);entries.push({name:`${base}_slice_${String(i+1).padStart(3,'0')}.wav`,data:blob});
          if(i%8===0){status('slice-status',`Creating ZIP… ${i+1}/${tools.markers.length-1}`);await new Promise(r=>setTimeout(r,0));}
        }
        const zip=await createStoredZip(entries);download(zip,base+'_slices.zip');
      }
      status('slice-status',all?'ZIP includes all current slices.':'Slice exported to WAV.');
    }catch(e){error(e.message);}finally{setBusy(false);}
  }
  function slicePosition(event){const rect=el('tool-waveform').getBoundingClientRect();const time=viewportTime(event.clientX,rect.left,rect.width,tools.buffer.duration,tools.zoom,tools.viewStart);return tools.snap?snapBeat(time,tools.bpm,tools.buffer.duration,tools.bpmOffset):time;}
  function slicePointerDown(event){
    if(tools.tab!=='slicer'||!tools.buffer||tools.loading)return false;
    const value=slicePosition(event),markers=tools.markers;
    if(markers.length<2)tools.markers=[0,tools.buffer.duration];
    const rect=el('tool-waveform').getBoundingClientRect(),tolerance=Math.min(.10,Math.max(.004,6/Math.max(1,rect.width)*(tools.buffer.duration/tools.zoom)));
    let closest=-1,distance=Infinity;
    for(let i=1;i<tools.markers.length-1;i++){const d=Math.abs(markers[i]-value);if(d<distance){distance=d;closest=i;}}
    if(closest>=1&&distance<tolerance){
      if(event.shiftKey){markers.splice(closest,1);tools.selectedSlice=Math.max(0,closest-1);updateSliceUI();return true;}
      tools.dragMarker=closest;el('tool-waveform').setPointerCapture(event.pointerId);tools.selectedSlice=closest-1;
      updateSliceUI();return true;
    }
    if(!event.shiftKey)return false; // click anywhere else seeks, Shift+click inserts a slice marker.
    if(markers.length>=201){error('Maximum 200 slices.');return true;}
    const index=markers.findIndex(x=>x>value);if(index<=0)return true;
    const min=.02;if(value-markers[index-1]<min||markers[index]-value<min)return true;
    markers.splice(index,0,value);tools.selectedSlice=index-1;updateSliceUI();return true;
  }
  function masterOptions(){return {preset:document.querySelector('input[name="master-preset"]:checked')?.value||'balanced',targetLufs:Number(el('master-lufs').value),intensity:Number(el('master-intensity').value),ceilingDb:Number(el('master-ceiling').value),stereoWidth:Number(el('master-width').value)/100,eqMode:el('master-eq-mode').value,dynamicsMode:el('master-dynamics').value,inputGainDb:Number(el('master-input').value),glueRatio:Number(el('master-glue').value),glueThresholdDb:Number(el('master-threshold').value),bassCenterHz:Number(el('master-bass-center').value)};}
  function resetMasterUI(){
    el('master-fix-in-mix').disabled=true;
    el('master-results').hidden=true;
    el('master-readouts').hidden=true;
    for(const id of ['master-before','master-after','master-peak','master-crest','master-correlation','master-gr'])status(id,'—');
    el('master-eq').hidden=true;el('master-eq-response').hidden=true;el('master-mix-health').hidden=true;el('master-spectrum').hidden=true;el('master-report').disabled=true;
    status('master-status','Load a track, choose preset and Generate Master.');
    for(const id of ['master-preview-b','master-apply','master-export'])el(id).disabled=true;
  }
  function masterMetric(value,suffix=''){
    return Number.isFinite(value)?value.toFixed(1)+suffix:'—';
  }
  function clearMasterReference(){
    tools.referenceGeneration++;tools.reference=null;
    el('master-reference-file').value='';
    el('master-reference-clear').disabled=true;
    el('master-preview-r').disabled=true;
    el('master-reference-details').hidden=true;
    status('master-reference-status','No reference loaded. Import audio to compare it with your master.');
  }
  function updateReferenceReadout(masterAnalysis=null){
    const reference=tools.reference;
    const details=el('master-reference-details');
    if(!reference){details.hidden=true;return;}
    const a=reference.analysis;
    const lines=[
      'REFERENCE · '+reference.file.name,
      'Integrated loudness: '+masterMetric(a.lufs)+' LUFS',
      'True peak: '+masterMetric(a.truePeakDb)+' dBTP (4× est.)',
      'Crest factor: '+masterMetric(a.crestDb)+' dB'
    ];
    if(masterAnalysis){
      const comparison=compareReference(masterAnalysis,a);
      lines.push('MASTER − REFERENCE · '+(comparison.lufsDelta>=0?'+':'')+masterMetric(comparison.lufsDelta)+' LUFS');
      lines.push('CREST DIFFERENCE · '+(comparison.crestDelta>=0?'+':'')+masterMetric(comparison.crestDelta)+' dB');
      lines.push('RELATIVE TONAL ENERGY · '+comparison.bands
        .filter(b=>b.relativeDeltaDb!==null)
        .map(b=>b.label+' '+(b.relativeDeltaDb>=0?'+':'')+b.relativeDeltaDb.toFixed(1)+' dB').join(' · '));
    }
    details.replaceChildren();
    for(const label of lines){const line=document.createElement('div');line.textContent=label;details.append(line);}
    details.hidden=false;
  }
  async function loadMasterReference(file){
    if(!file||!tools.buffer){error('Load your own track before selecting a reference.');return;}
    const invalid=audioFileError(file);if(invalid){status('master-reference-status',invalid);return;}
    const id=++tools.referenceGeneration,workspaceToken=tools.operation;
    tools.reference=null;el('master-preview-r').disabled=true;el('master-reference-clear').disabled=true;
    el('master-reference-details').hidden=true;
    status('master-reference-status','Reading '+file.name+'…');
    setBusy(true);
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw Error('Audio decoding is unavailable in this browser.');
      tools.context||=new Ctx();
      const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      const {buffer}=await decodeLocalAudio(file,{context:tools.context,OfflineContext:Offline});
      const mobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
      if(buffer.length*buffer.numberOfChannels>(mobile?10_000_000:24_000_000))
        throw Error('Reference exceeds the device memory limit. Choose a shorter extract.');
      if(buffer.duration<.8)throw Error('Reference audio must be at least 0.8 seconds.');
      if(id!==tools.referenceGeneration||workspaceToken!==tools.operation)return;
      status('master-reference-status','Measuring reference loudness and spectrum…');
      const analysis=await runProduction('reference',{},buffer);
      if(id!==tools.referenceGeneration||workspaceToken!==tools.operation)return;
      tools.reference={file,buffer,analysis};
      el('master-reference-clear').disabled=false;
      status('master-reference-status',file.name+' · '+masterMetric(analysis.lufs)+' LUFS · ready for A/B/R monitoring.');
      updateReferenceReadout(tools.masterCandidate?.analysis?.after);
    }catch(e){
      if(id===tools.referenceGeneration){status('master-reference-status',e.message||'Reference could not be analyzed.');}
    }finally{if(id===tools.referenceGeneration){setBusy(false);el('master-preview-r').disabled=!tools.reference;}}
  }
  function showMasterResult(result){
    el('master-results').hidden=false;
    el('master-readouts').hidden=false;
    el('master-fix-in-mix').disabled=false;
    status('master-before',masterMetric(result.before.lufs));
    status('master-after',masterMetric(result.after.lufs));
    status('master-peak',masterMetric(result.after.truePeakDb));status('master-crest',masterMetric(result.after.crestDb));status('master-correlation',masterMetric(result.after.correlation));status('master-gr',masterMetric(result.settings.maxReductionDb));
    status('master-low','LOW '+result.settings.lowDb.toFixed(1)+' dB');
    status('master-high','HIGH '+result.settings.highDb.toFixed(1)+' dB · MID '+result.settings.midDb.toFixed(1)+' dB · '+result.settings.dynamicsMode.toUpperCase()+' '+result.settings.attackMs+'/'+result.settings.releaseMs+' ms');
    el('master-eq').hidden=false;
    const curve=el('master-eq-response');const points=result.eqCurve||[];
    curve.textContent='MEASURED EQ RESPONSE · '+points.map(p=>p.hz+' Hz '+(p.db>=0?'+':'')+p.db.toFixed(2)+' dB').join(' · ');
    curve.hidden=!points.length;
    updateReferenceReadout(result.after);
    const health=el('master-mix-health');health.replaceChildren();
    for(const finding of result.findings||[]){const line=document.createElement('p');line.textContent=finding.label+' · '+finding.evidence+' — '+finding.detail;health.append(line);}health.hidden=false;
    const bars=el('master-spectrum-bars');bars.replaceChildren();
    for(const band of result.before.spectrum||[]){const row=document.createElement('div');const name=document.createElement('span');const amount=document.createElement('span');name.textContent=band.label;amount.textContent=band.available?(band.share*100).toFixed(1)+'%':'N/A';row.append(name,amount);bars.append(row);}el('master-spectrum').hidden=false;el('master-report').disabled=false;
    status('master-status',`Done · ${result.settings.preset.toUpperCase()} · target ${result.settings.targetLufs} LUFS, measured ${masterMetric(result.after.lufs)} LUFS. True-peak estimate ${masterMetric(result.after.truePeakDb)} dBTP · ceiling ${result.settings.ceilingDb.toFixed(1)} dBTP.`);
  }
  async function prepareMaster(){
    if(!tools.buffer)throw Error('Load audio first.');
    const options=masterOptions(),settings=JSON.stringify(options);
    if(tools.masterCandidate?.input===tools.buffer&&tools.masterCandidate.settings===settings)return tools.masterCandidate;
    const input=tools.buffer;
    const result=await runProduction('master',options);
    const buffer=asAudioBuffer(result.channels,input.sampleRate);
    const candidate={input,settings,buffer,analysis:result};
    tools.masterCandidate=candidate;showMasterResult(result);
    return candidate;
  }
  function masterMonitoringGain(result,side){
    if(!el('master-match').checked)return 1;
    const a=result?.before,b=result?.after,r=tools.reference?.analysis;
    const selected=side==='reference'?r:side==='original'?a:b;
    if(!selected)return 1;
    return 10**(monitoringGainDb(selected,[a,b,r].filter(x=>x&&x!==selected))/20);
  }
  async function masterAction(action){
    if(tools.loading||!tools.buffer){error('Load audio first.');return;}
    clearError();
    if(action!=='original'&&action!=='mastered'&&action!=='reference')stopPreview();
    const position=tools.playing?positionDuringPlayback():tools.playhead;
    const token=++tools.operation;setBusy(true);
    try{
      if(action==='reference'){
        if(!tools.reference)throw Error('Choose a reference track first.');
        const reference=tools.reference;
        const gain=masterMonitoringGain(tools.masterCandidate?.analysis,'reference');
        const from=clampPlayhead(position,Math.max(0,reference.buffer.duration-.05));
        await playBuffer(reference.buffer,from,reference.buffer.duration,gain,{allowLoop:false});
        status('master-status','R / REFERENCE · '+(el('master-match').checked?'loudness-matched monitoring':'original reference level')+'.');
        return;
      }
      if(action==='original'){
        const cached=tools.masterCandidate?.input===tools.buffer?tools.masterCandidate:null;
        const gain=cached?masterMonitoringGain(cached.analysis,'original'):1;
        await playBuffer(tools.buffer,clampPlayhead(position,tools.buffer.duration),tools.buffer.duration,gain,{allowLoop:true});
        status('master-status','A / ORIGINAL · '+(cached&&el('master-match').checked?'loudness-matched monitoring':'actual source level')+'.');
        return;
      }
      status('master-status','Analyzing tonal balance and dynamics; rendering master…');
      const candidate=await prepareMaster();if(token!==tools.operation)return;
      if(action==='apply'){
        workspace.apply(candidate.buffer);workingChanged();
        status('master-status','Master applied. Undo restores previous audio.');
      }else if(action==='export'){
        const audio=candidate.buffer,blob=encodeWav(channels(audio),audio.sampleRate,24);
        download(blob,filename('master.wav'));
        status('master-status',`Exported ${readableSize(blob.size)} · 24-bit WAV · ${masterMetric(candidate.analysis.after.lufs)} LUFS.`);
      }else if(action==='mastered'){
        // Monitoring gain never modifies the mastered buffer or export.
        const gain=masterMonitoringGain(candidate.analysis,'mastered');
        await playBuffer(candidate.buffer,clampPlayhead(position,candidate.buffer.duration),candidate.buffer.duration,gain,{allowLoop:false});
        status('master-status',`B / MASTER · ${el('master-match').checked?'loudness-matched':'actual export level'} · Preview does not change WAV export.`);
      }
    }catch(e){if(token===tools.operation){error(e.message||'Mastering failed.');status('master-status','Mastering could not be completed.');}}
    finally{if(token===tools.operation)setBusy(false);}
  }
  // Master controls
  document.querySelectorAll('input[name="master-preset"]').forEach(input=>input.addEventListener('change',()=>{
    const config=getMasterPreset(input.value);
    const values={'master-lufs':config.targetLufs,'master-ceiling':config.ceilingDb,
      'master-intensity':config.intensity,'master-width':Math.round(config.stereoWidth*100),
      'master-eq-mode':config.eqMode,'master-dynamics':config.dynamicsMode};
    for(const [id,value] of Object.entries(values))el(id).value=String(value);
    status('master-intensity-label',config.intensity+'%');
    status('master-width-label',Math.round(config.stereoWidth*100)+'%');
    status('master-preset-description',config.description);
    tools.masterCandidate=null;resetMasterUI();updateButtons();
  }));
  el('master-lufs').addEventListener('input',()=>{tools.masterCandidate=null;resetMasterUI();updateButtons();});for(const id of ['master-ceiling','master-intensity','master-width','master-eq-mode','master-dynamics','master-input','master-glue','master-threshold','master-bass-center'])el(id).addEventListener('input',()=>{status('master-intensity-label',el('master-intensity').value+'%');status('master-width-label',el('master-width').value+'%');status('master-input-label',Number(el('master-input').value).toFixed(1)+' dB');status('master-threshold-label',el('master-threshold').value+' dB');status('master-bass-center-label',el('master-bass-center').value+' Hz');tools.masterCandidate=null;resetMasterUI();updateButtons();});
  el('master-fix-in-mix').onclick=()=>{
    const result=tools.masterCandidate?.analysis;
    if(!result||tools.masterCandidate?.input!==tools.buffer)return;
    selectTab('mix');extraApi?.showFixAdvice(result);
  };
  el('master-render').onclick=()=>masterAction('render');
  el('master-preview-a').onclick=()=>masterAction('original');
  el('master-preview-b').onclick=()=>masterAction('mastered');
  el('master-preview-r').onclick=()=>masterAction('reference');
  el('master-reference-file').addEventListener('change',event=>{const input=event.currentTarget,file=input.files?.[0];input.value='';if(file)void loadMasterReference(file);});
  el('master-reference-clear').onclick=()=>{stopPreview();clearMasterReference();updateButtons();};
  el('master-apply').onclick=()=>masterAction('apply');
  el('master-export').onclick=()=>masterAction('export');
  el('master-report').onclick=()=>{const data=tools.masterCandidate?.analysis;if(!data)return;const json={version:'Smart Master 2.3',source:tools.file?.name||'Audio',before:data.before,after:data.after,eqCurve:data.eqCurve,settings:data.settings,findings:data.findings,reference:tools.reference?{filename:tools.reference.file.name,analysis:tools.reference.analysis,comparison:compareReference(data.after,tools.reference.analysis)}:null,notes:data.notes};download(new Blob([JSON.stringify(json,null,2)],{type:'application/json'}),filename('master-report.json'));};
  // Phase 2 controls
  for(const id of ['pt-original','pt-target','pt-semitones','pt-cents','pt-preserve'])el(id).addEventListener('input',()=>{if(id==='pt-original'||id==='pt-target')tools.bpmEdited=true;updatePitchLabels();});
  for(const id of ['tuner-semitones','tuner-cents-adjust'])el(id).addEventListener('input',updateTunerLabels);
  el('tuner-target').addEventListener('change',()=>{
    const note=tools.tunerResult?.note;if(!note)return;
    const target=Number(el('tuner-target').value);
    const shift=tuningCorrection(note.midi,note.cents,target);
    el('tuner-semitones').value=String(shift.semitones);
    el('tuner-cents-adjust').value=String(shift.cents);
    updateTunerLabels();
  });
  for(const action of ['preview','apply','export']){
    el('pt-'+action).onclick=()=>productionAction('pitch',action);
    el('tuner-'+action).onclick=()=>productionAction('tuner',action);
  }
  el('tuner-analyze').onclick=analyze808;
  for(const id of ['key-range','tuner-range','tuner-attack'])el(id).addEventListener('change',()=>{
    if(id==='key-range')status('key-range-readout','Analyzed region will appear after analysis.');
    else status('tuner-range-readout','Analyzed region will appear after analysis.');
  });
  el('slice-sensitivity').oninput=()=>{status('slice-sensitivity-label',el('slice-sensitivity').value+'%');};
  el('slice-auto').onclick=sliceAuto;
  el('slice-selection').onchange=()=>{tools.selectedSlice=Number(el('slice-selection').value);drawToolWave();};
  el('slice-preview').onclick=async()=>{
    if(!tools.buffer||tools.markers.length<2){error('Create slice markers first.');return;}
    if(tools.playing){stopPreview();return;}
    try{const from=tools.markers[tools.selectedSlice],to=tools.markers[tools.selectedSlice+1];await playBuffer(tools.buffer,tools.playhead>=from&&tools.playhead<to?tools.playhead:from,to,1,{allowLoop:false});}
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
  document.querySelectorAll('[data-group-nav]').forEach(link=>link.addEventListener('click',()=>selectCategory(link.dataset.groupNav)));
  document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>selectCategory(button.dataset.category)));
  document.querySelectorAll('[data-tool]').forEach(button=>{
    button.addEventListener('click',()=>selectTab(button.dataset.tool));
    button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=groups[tools.category];const next=tabs[(tabs.indexOf(tools.tab)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];selectTab(next);el('tab-'+next).focus();});
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
  el('norm-target-preset').onchange=()=>{
    el('norm-lufs').value=el('norm-target-preset').value;
    el('norm-mode').value='lufs';el('norm-mode').onchange();
    clearQuick();
  };
  for(const id of ['norm-peak','norm-lufs','norm-ceiling'])el(id).oninput=clearQuick;
  el('tool-select-file').onclick=el('tool-change').onclick=()=>el('tool-file-input').click();
  const selectToolkitFile=e=>{
    const input=e.currentTarget,file=input.files?.[0];
    if(!file)return;
    input.value='';
    void decode(file);
  };
  el('tool-file-input').addEventListener('change',selectToolkitFile);
  pulseProject.subscribe(({type,origin,state})=>{
    if(type==='load'&&origin==='bpm'){
      tools.bpmEdited=false;tools.from=0;tools.to=Math.min(8,state.working.duration);
      tools.playhead=0;resetWaveView(state.working.duration);
      workingChanged();updateBpmFromAnalyzer();syncOutput();
      status('tool-ext',state.file.name.split('.').pop().toUpperCase());
      status('tool-details',`${durationText(state.working.duration)} · ${readableSize(state.file.size)} · ${state.working.numberOfChannels} ch · ${(state.working.sampleRate/1000).toFixed(1)} kHz`);
    }
    if(type==='tempo'&&origin==='bpm'&&state.bpm){
      tools.bpm=state.bpm;tools.bpmOffset=state.beatOffset;
      for(const id of ['calc-bpm','pt-original','cut-bpm'])el(id).value=String(state.bpm);
      updateCalculator();updateWaveControls();drawToolWave();
      if(tools.buffer&&el('cut-bars').value!=='custom')setByBars();
    }
  });
  el('tool-remove').onclick=remove;
  el('tool-preview').onclick=preview;
  el('wave-loop').onclick=()=>{
    if(!tools.buffer)return;const wasPlaying=tools.playing&&tools.transport?.buffer===tools.buffer;
    const position=wasPlaying?positionDuringPlayback():tools.playhead;
    tools.loopEnabled=!tools.loopEnabled;
    if(tools.loopEnabled&&tools.tab==='cutter'){tools.loopFrom=tools.from;tools.loopTo=tools.to;}
    updateWaveControls();drawToolWave();
    if(wasPlaying)void seekTool(position,true).catch(e=>error('Cannot start loop: '+e.message));
  };
  el('wave-snap').onclick=()=>{if(!tools.buffer)return;tools.snap=!tools.snap;updateWaveControls();drawToolWave();};
  el('wave-mark-in').onclick=()=>markLoop('in');el('wave-mark-out').onclick=()=>markLoop('out');
  el('wave-zoom-in').onclick=()=>setZoom(tools.zoom*2);el('wave-zoom-out').onclick=()=>setZoom(tools.zoom/2);
  el('wave-pan-left').onclick=()=>panWave(-1);el('wave-pan-right').onclick=()=>panWave(1);
  el('tool-reuse-bpm').onclick=()=>{const x=getBpmTrack();if(x?.buffer&&x?.file){tools.productionWorker?.terminate();tools.productionCandidate=null;tools.masterCandidate=null;resetMasterUI();tools.markers=[];workspace.load(x.buffer,x.file);tools.file=x.file;tools.buffer=x.buffer;tools.peaks=getAudioPeaks(x.buffer.getChannelData(0),2160);tools.peaksRight=x.buffer.numberOfChannels>1?getAudioPeaks(x.buffer.getChannelData(1),2160):null;tools.eqSelection=null;tools.from=0;tools.to=Math.min(8,x.buffer.duration);tools.playhead=0;resetWaveView(x.buffer.duration);updatePlayhead(0);el('tool-name').textContent=x.file.name;el('tool-name').title=x.file.name;status('tool-ext',x.file.name.split('.').pop().toUpperCase());status('tool-details',`${durationText(x.buffer.duration)} · ${readableSize(x.file.size)} · ${x.buffer.numberOfChannels} ch. · ${(x.buffer.sampleRate/1000).toFixed(1)} kHz`);el('tool-loaded').hidden=false;el('tool-empty').hidden=true;updateBpmFromAnalyzer();resetKey();updateTrimInputs();drawToolWave();status('conv-status','Loaded from BPM Analyzer.');updateButtons();}};
  el('conv-format').onchange=syncOutput;el('conv-depth').onchange=syncOutput;el('conv-rate').onchange=syncOutput;
  el('conv-export').onclick=exportConvert;
  el('key-analyze').onclick=analyzeKey;
  el('cut-bpm').oninput=()=>{tools.bpm=Number(el('cut-bpm').value);updateWaveControls();drawToolWave();if(el('cut-bars').value!=='custom')setByBars();};
  el('cut-bars').onchange=()=>{if(el('cut-bars').value!=='custom')setByBars();};
  el('cut-start').oninput=e=>setStart(e.target.value,true);
  el('cut-end').oninput=e=>setEnd(e.target.value);
  el('cut-export').onclick=exportCut;
  el('cut-audition').onclick=()=>{
    if(!tools.buffer||tools.to-tools.from<.05){error('Select at least 50 ms of audio.');return;}
    tools.loopFrom=tools.from;tools.loopTo=tools.to;tools.loopEnabled=true;
    updateWaveControls();drawToolWave();
    void playBuffer(tools.buffer,tools.from,tools.to).catch(e=>error('Preview failed: '+e.message));
  };
  // Click = relocate transport and start playback; drag = scrub then play from release.
  // Shift+click in Cutter changes its selection edge; Shift+click in Slicer adds/removes a marker.
  const waveform=el('tool-waveform');
  waveform.addEventListener('pointerdown',event=>{
    if(event.button!==0||!tools.buffer||tools.loading)return;
    if(slicePointerDown(event))return;
    const time=slicePosition(event);
    if(tools.tab==='equalizer'&&(tools.eqSelectMode||event.shiftKey)){
      tools.eqDragId=event.pointerId;tools.eqDragStart=time;stopPreview();
      tools.eqSelection=null;setEqSelection(time,time);
      waveform.setPointerCapture(event.pointerId);return;
    }
    if(tools.tab==='cutter'&&event.shiftKey){
      if(Math.abs(time-tools.from)<Math.abs(time-tools.to))setStart(time,true);else setEnd(time);
      return;
    }
    tools.scrubTransport=tools.transport;
    stopPreview();updatePlayhead(time);tools.dragSeekId=event.pointerId;
    waveform.setPointerCapture(event.pointerId);
  });
  waveform.addEventListener('pointermove',event=>{
    if(tools.eqDragId===event.pointerId&&tools.buffer){
      setEqSelection(tools.eqDragStart,slicePosition(event));return;
    }
    if(tools.dragSeekId===event.pointerId&&tools.buffer)updatePlayhead(slicePosition(event));
  });
  const finishSeek=event=>{
    if(tools.eqDragId===event.pointerId){
      const at=slicePosition(event),start=tools.eqDragStart;
      tools.eqDragId=null;setEqSelection(start,at);
      if(!tools.eqSelection)updatePlayhead(at);
      return;
    }
    if(tools.dragSeekId!==event.pointerId)return;
    tools.dragSeekId=null;
    updatePlayhead(slicePosition(event));
    const transport=tools.scrubTransport;tools.scrubTransport=null;
    void seekTool(tools.playhead,true,transport).catch(e=>error('Playback failed: '+e.message));
  };
  waveform.addEventListener('pointerup',finishSeek);
  waveform.addEventListener('pointercancel',()=>{tools.dragSeekId=null;tools.scrubTransport=null;tools.eqDragId=null;});
  waveform.addEventListener('keydown',event=>{
    if(!tools.buffer)return;
    let time;
    if(event.key==='Home')time=0;
    else if(event.key==='End')time=tools.buffer.duration;
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight')time=nudgePlayhead(tools.playhead,tools.buffer.duration,(event.shiftKey?5:1)*(event.key==='ArrowRight'?1:-1));
    else if(event.code==='Space'&&!event.repeat){event.preventDefault();void preview();return;}
    else if(['i','I','o','O','l','L','+','=','-','_'].includes(event.key)&&!event.repeat){
      event.preventDefault();
      if(event.key.toLowerCase()==='i')markLoop('in');
      else if(event.key.toLowerCase()==='o')markLoop('out');
      else if(event.key.toLowerCase()==='l')el('wave-loop').click();
      else setZoom(tools.zoom*(event.key==='+'||event.key==='='?2:.5));
      return;
    }else return;
    event.preventDefault();void seekTool(time,tools.playing).catch(e=>error(e.message));
  });
  const drop=el('tool-drop-zone');
  drop.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!tools.loading)drop.classList.add('tool-dragover');}});
  drop.addEventListener('dragleave',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('tool-dragover');});
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('tool-dragover');if(e.dataTransfer.files.length!==1){error('Upload one file at a time.');return;}decode(e.dataTransfer.files[0]);});
  window.addEventListener('pulse:bpm-track-ready',updateButtons);
  window.addEventListener('pulse:tempo-apply',event=>{
    const bpm=Number(event.detail?.bpm);if(!Number.isFinite(bpm)||bpm<20||bpm>400)return;
    tools.bpm=bpm;tools.bpmOffset=Number.isFinite(Number(event.detail?.beatOffset))?Number(event.detail.beatOffset):0;tools.bpmEdited=true;
    for(const id of ['calc-bpm','pt-original','pt-target','cut-bpm'])el(id).value=String(bpm);
    if(el('cut-bars').value!=='custom')setByBars();
    updateCalculator();updateWaveControls();drawToolWave();
    status('pt-status',`Manual tempo ${bpm} BPM from BPM Analyzer. You can adjust it anytime.`);
  });
  const resize=new ResizeObserver(()=>{drawToolWave();updatePlayhead(tools.playhead);});resize.observe(el('tool-waveform'));
  window.addEventListener('pagehide',()=>{stopPreview();tools.bpmWorker?.terminate();tools.productionWorker?.terminate();tools.keyWorker?.terminate();tools.context?.close();});
  // Result surfaces remain live DOM nodes: no duplicate IDs or detached listeners.
  const leftMaster=el('insights-master'),leftMix=el('insights-mix');
  for(const id of ['master-readouts','master-reference-details','master-mix-health',
    'master-spectrum','master-eq-response','master-eq']){
    const node=el(id);if(node)leftMaster.append(node);
  }
  for(const id of ['mix-quick-report','mix-fix-advice','mix-advice','mix-separation-status']){
    const node=el(id);if(node)leftMix.append(node);
  }
  extraApi=initExtraTools({el,tools,channels,asAudioBuffer,playBuffer,stopPreview,workspace,workingChanged,
    download,filename,status,decodeLocalAudio,audioFileError,encodeWav});
  denoiseApi=initSpectralDenoise({el,tools,channels,asAudioBuffer,playBuffer,stopPreview,workspace,workingChanged,download,filename,status,encodeWav,exportCleanAudio});
  selectCategory('analyze',false);syncOutput();updateCalculator();resetWaveView(0);updateButtons();
  return {reset:remove};
}
