import {workspace as w} from './workspace.mjs';
import {fromChannels,encodeWav} from './dsp.mjs';
import {choose808Region,frequencyNote} from './808-tuner-dsp.mjs';

const midiHz=midi=>440*Math.pow(2,(midi-69)/12);
const midiName=midi=>frequencyNote(midiHz(midi))?.note||'—';
const signed=value=>(value>0?'+':'')+value;
const safeMessage=error=>error?.message||'Audio processing failed.';
const fmtSeconds=n=>Number(n).toFixed(2)+' s';

/**
 * Recovered 808 Tuner: analysis from original YIN DSP, and the original
 * WSOLA pitch/time renderer. Only the UI and workspace transport are new.
 */
function mount808Tuner({host}){
  if(!document.querySelector('link[data-808-tuner-style]')){
    const link=document.createElement('link');link.rel='stylesheet';
    link.href='/modules/808-tuner.css';link.dataset['808TunerStyle']='true';
    document.head.append(link);
  }
  host.innerHTML=[
    '<section class="tool-view module-work pulse-808-tuner">',
      '<div class="tool-view-header"><span>01 / 808 TUNER</span><span>LOW-FREQUENCY PITCH</span></div>',
      '<h3>Find the<br><span>fundamental.</span></h3>',
      '<p class="tool-description">Identify the fundamental note of an 808 bass sample, measure detuning and make precise pitch corrections. All DSP runs locally.</p>',
      '<div class="pulse-tuner-source">',
        '<label>ANALYZE REGION<select id="pulse808-range" data-pulse-slider-ready="true">',
          '<option value="cursor">2 seconds from playhead</option>',
          '<option value="full">First 6 seconds</option>',
          '<option value="loop">Selected range (IN / OUT)</option>',
        '</select></label>',
        '<label>SKIP ATTACK<select id="pulse808-attack" data-pulse-slider-ready="true">',
          '<option value="0">0 ms</option><option value="30">30 ms</option>',
          '<option value="60" selected>AUTO · 60 ms</option>',
          '<option value="100">100 ms</option><option value="150">150 ms</option>',
        '</select></label>',
      '</div>',
      '<div class="pulse-tuner-meter" aria-label="Detected 808 pitch">',
        '<div><small>DETECTED NOTE</small><strong id="pulse808-note">—</strong></div>',
        '<div class="pulse-tuner-readings">',
          '<span id="pulse808-hz">— Hz</span>',
          '<span id="pulse808-cents">— cents</span>',
          '<small id="pulse808-confidence">AWAITING ANALYSIS</small>',
        '</div>',
      '</div>',
      '<p class="pulse-tuner-stability" id="pulse808-stability">STABILITY —</p>',
      '<p class="pulse-tuner-range" id="pulse808-region">Analysis from playhead, skipping 60 ms of attack.</p>',
      '<button class="pulse-tuner-primary" type="button" data-tuner-action="analyze">ANALYZE 808 <span aria-hidden="true">↗</span></button>',
      '<div class="pulse-tuner-controls">',
        '<label class="pulse-tuner-note-select">TARGET NOTE',
          '<select id="pulse808-target" data-pulse-slider-ready="true" disabled>',
            '<option value="">Analyze 808 first</option>',
          '</select>',
        '</label>',
        '<label>TRANSPOSE <output id="pulse808-semi-output">0 st</output>',
          '<input id="pulse808-semi" type="range" min="-12" max="12" value="0" step="1" data-unit="st" />',
        '</label>',
        '<label>FINE TUNE <output id="pulse808-fine-output">0 cents</output>',
          '<input id="pulse808-fine" type="range" min="-100" max="100" value="0" step="1" data-unit="cents" />',
        '</label>',
      '</div>',
      '<p class="pulse-tuner-shift" id="pulse808-shift">Analyze a sustained 808 sample to receive tuning guidance. Manual controls are also available.</p>',
      '<div class="pulse-tuner-actions">',
        '<button type="button" data-tuner-action="preview">PREVIEW TUNED AUDIO <span aria-hidden="true">↗</span></button>',
        '<button type="button" data-tuner-action="apply">APPLY TO WORKSPACE <span aria-hidden="true">↗</span></button>',
        '<button type="button" data-tuner-action="export">EXPORT WAV · 24-BIT <span aria-hidden="true">↗</span></button>',
      '</div>',
      '<p role="status" aria-live="polite" class="pulse-tuner-status" id="pulse808-status">Upload a clean, sustained 808 sample into SOURCE AUDIO.</p>',
      '<p class="pulse-tuner-note">YIN detection · 28–260 Hz · WSOLA pitch processing. Pitch detection may be unreliable on kicks, glides or polyphonic recordings.</p>',
    '</section>'
  ].join('');
  const $=selector=>host.querySelector(selector);
  const status=$('#pulse808-status'),semis=$('#pulse808-semi'),fine=$('#pulse808-fine'),target=$('#pulse808-target');
  const previewButton=$('[data-tuner-action="preview"]');
  const actions=[...host.querySelectorAll('[data-tuner-action]')];
  let alive=true,sourceBuffer=w.buffer,analysis=null,cache=null,preview=null,pending=null;
  let busy=false,jobSeq=0;
  function report(message,kind=''){if(!alive)return;status.textContent=message;status.dataset.kind=kind;}
  function stopPreview(){
    if(!preview)return;
    const node=preview;preview=null;node.onended=null;
    try{node.stop();}catch{}
    try{node.disconnect();}catch{}
    document.dispatchEvent(new CustomEvent('pulse:audio-source',{detail:{source:null}}));
    previewButton.firstChild.textContent='PREVIEW TUNED AUDIO ';
  }
  function cancelJob(){
    if(!pending)return;
    const job=pending;pending=null;
    clearTimeout(job.timeout);job.worker.terminate();
    job.reject(Error('Operation cancelled because the audio or tool changed.'));
  }
  function setBusy(on){
    busy=on;
    actions.forEach(btn=>btn.disabled=on||!w.buffer);
  }
  function clearAnalysis(){
    analysis=null;cache=null;stopPreview();
    $('#pulse808-note').textContent='—';
    $('#pulse808-hz').textContent='— Hz';
    $('#pulse808-cents').textContent='— cents';
    $('#pulse808-confidence').textContent='AWAITING ANALYSIS';
    $('#pulse808-stability').textContent='STABILITY —';
    $('#pulse808-region').textContent='Analysis from playhead, skipping 60 ms of attack.';
    target.replaceChildren(new Option('Analyze 808 first',''));
    target.disabled=true;semis.value='0';fine.value='0';
    updateTuning();
  }
  function checkAudio(){
    if(!alive)return;
    if(sourceBuffer!==w.buffer){
      sourceBuffer=w.buffer;cancelJob();clearAnalysis();
      report(w.buffer?'New source detected. Analyze the 808 again.':'Upload a clean, sustained 808 sample into SOURCE AUDIO.');
    }
    actions.forEach(btn=>btn.disabled=busy||!w.buffer);
  }
  function updateTuning(){
    const step=Number(semis.value),cents=Number(fine.value);
    $('#pulse808-semi-output').textContent=signed(step)+' st';
    $('#pulse808-fine-output').textContent=signed(cents)+' cents';
    if(analysis?.note){
      const note=analysis.note,expected=midiName(note.midi+step);
      $('#pulse808-shift').textContent=note.note+' ('+signed(note.cents.toFixed(1))+' cents) → '+expected+
        ' · '+signed(step)+' semitones, '+signed(cents)+' cents fine tune.';
      if(target.options.length>1)target.value=String(note.midi+step);
    }else{
      $('#pulse808-shift').textContent=(step||cents)?'Manual correction: '+signed(step)+' st / '+signed(cents)+' cents.':'Analyze a sustained 808 sample to receive tuning guidance. Manual controls are also available.';
    }
    cache=null;
  }
  function runWorker(kind,channels,rate,options={},timeoutMs=30000){
    if(!alive) return Promise.reject(Error('Tool is closed.'));
    if(typeof Worker==='undefined')return Promise.reject(Error('Audio processing requires a browser with Web Worker support.'));
    cancelJob();
    const id=++jobSeq;
    return new Promise((resolve,reject)=>{
      let worker;
      try{worker=new Worker(new URL('./808-tuner-worker.mjs',import.meta.url),{type:'module'});}
      catch(error){reject(error);return;}
      const job={worker,reject,timeout:null};
      const finish=(error,result)=>{
        if(pending!==job)return;
        pending=null;clearTimeout(job.timeout);worker.terminate();
        if(error)reject(error);else resolve(result);
      };
      job.timeout=setTimeout(()=>finish(Error(kind==='analyze'?'Pitch analysis timed out.':'Pitch rendering timed out. Try a shorter 808 sample.')),timeoutMs);
      worker.onmessage=event=>{
        const data=event.data;
        if(data?.id!==id)return;
        finish(data.ok?null:Error(data.error||'808 DSP failed.'),data.result);
      };
      worker.onerror=()=>finish(Error('Audio Worker could not process this track.'));
      pending=job;
      try{worker.postMessage({id,kind,channels,rate,options},channels.map(c=>c.buffer));}
      catch(error){finish(error);}
    });
  }
  function audioSlices(audio,first=0,last=audio.length){
    if(audio.numberOfChannels>2)throw Error('808 Tuner supports mono or stereo audio. Convert multi-channel input first.');
    return Array.from({length:audio.numberOfChannels},(_,ch)=>audio.getChannelData(ch).slice(first,last));
  }
  async function analyze(){
    const audio=w.ensureAudio();
    stopPreview();report('Scanning bass fundamental…');
    const range=choose808Region(audio.duration,w.position,w.selection,$('#pulse808-range').value,Number($('#pulse808-attack').value));
    $('#pulse808-region').textContent=range.label+' · '+fmtSeconds(range.from)+' – '+fmtSeconds(range.to)+' · skipped '+range.attackMs+' ms';
    const a=Math.floor(range.from*audio.sampleRate),z=Math.min(audio.length,Math.ceil(range.to*audio.sampleRate));
    const result=await runWorker('analyze',audioSlices(audio,a,z),audio.sampleRate,{},30000);
    if(!alive||audio!==w.buffer)throw Error('Source changed during analysis.');
    analysis=result;
    $('#pulse808-note').textContent=result.note?.note||'—';
    $('#pulse808-hz').textContent=result.hz?result.hz.toFixed(2)+' Hz':'— Hz';
    $('#pulse808-cents').textContent=result.note?signed(result.note.cents.toFixed(1))+' cents':'— cents';
    $('#pulse808-confidence').textContent=result.label.toUpperCase()+' CONFIDENCE · '+Math.round(result.confidence*100)+'%';
    $('#pulse808-stability').textContent=result.spreadCents==null?'STABILITY —':'STABILITY ±'+result.spreadCents.toFixed(1)+' CENTS · '+result.stableFrames+'/'+result.frames+' WINDOWS';
    target.replaceChildren();
    if(result.note){
      for(let midi=Math.max(0,result.note.midi-12);midi<=Math.min(127,result.note.midi+12);midi++)target.add(new Option(midiName(midi),String(midi)));
      target.disabled=false;
      semis.value='0';fine.value=String(result.confidence>=.52?Math.max(-100,Math.min(100,Math.round(-result.note.cents))):0);
      updateTuning();
      report(result.confidence<.52?'Low confidence. Select a stable sustained section or tune manually.':'Detected '+result.note.note+'. A fine-tune correction is suggested.','success');
    }else{
      target.add(new Option('Pitch not detected',''));target.disabled=true;updateTuning();
      report('Unable to find a stable 808 fundamental. Try another section or adjust manually.','error');
    }
  }
  async function rendered(){
    const audio=w.ensureAudio();
    if(audio.duration<.13)throw Error('808 Tuner needs at least 130 ms of audio.');
    if(audio.duration>90||audio.length*audio.numberOfChannels>12000000)
      throw Error('Pitch rendering supports 808 samples up to 90 s / 12 million samples. Choose a shorter file.');
    const options={semitones:Number(semis.value),cents:Number(fine.value)};
    const sig=String(options.semitones)+'|'+String(options.cents);
    if(cache&&cache.input===audio&&cache.sig===sig)return cache.buffer;
    if(options.semitones===0&&options.cents===0)return audio;
    report('Rendering corrected pitch locally…');
    const channels=await runWorker('tune',audioSlices(audio),audio.sampleRate,options,90000);
    if(!alive||audio!==w.buffer||String(Number(semis.value))+'|'+String(Number(fine.value))!==sig)
      throw Error('Source or pitch settings changed during rendering. Try again.');
    const next=fromChannels(channels,audio.sampleRate);
    cache={input:audio,sig,buffer:next};
    return next;
  }
  async function audition(candidate){
    stopPreview();w.stop();
    const context=await w.ensureContext();
    if(!alive)return;
    const node=context.createBufferSource();
    node.buffer=w.toNative(candidate);node.connect(context.destination);
    preview=node;
    node.onended=()=>{if(preview===node)stopPreview();};
    node.start(0);
    document.dispatchEvent(new CustomEvent('pulse:audio-source',{detail:{source:node}}));
    previewButton.firstChild.textContent='STOP PREVIEW ';
  }
  async function applyOrExport(kind){
    const candidate=await rendered();
    if(kind==='preview'){
      await audition(candidate);report('Previewing tuned 808. Press STOP PREVIEW to stop.','success');return;
    }
    stopPreview();
    if(kind==='apply'){
      w.commit(candidate,'808 Tuner applied. Undo restores the previous pitch.');
      sourceBuffer=w.buffer;clearAnalysis();
      report('Tuned audio applied to SOURCE AUDIO. Use Undo to compare.','success');
    }else{
      report('Encoding 24-bit WAV locally…');
      const blob=encodeWav(candidate,24);
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=(w.name||'pulse')+'-808-tuned.wav';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      report('Exported '+(blob.size/1048576).toFixed(2)+' MB as 24-bit PCM WAV.','success');
    }
  }
  semis.addEventListener('input',updateTuning);
  fine.addEventListener('input',updateTuning);
  target.addEventListener('change',()=>{
    if(!analysis?.note||!target.value)return;
    const shift=Number(target.value)-analysis.note.midi;
    if(shift>=-12&&shift<=12){semis.value=String(shift);semis.dispatchEvent(new Event('input',{bubbles:true}));}
  });
  for(const button of actions)button.addEventListener('click',async()=>{
    const kind=button.dataset.tunerAction;
    if(kind==='preview'&&preview){stopPreview();report('Preview stopped.');return;}
    if(busy)return;
    setBusy(true);
    try{if(kind==='analyze')await analyze();else await applyOrExport(kind);}
    catch(error){report(safeMessage(error),'error');}
    finally{if(alive)setBusy(false);}
  });
  const monitor=setInterval(checkAudio,450);
  checkAudio();
  return ()=>{
    alive=false;clearInterval(monitor);cancelJob();stopPreview();
  };
}
export const tuner808Module=Object.freeze({id:'tuner',category:'analyze',label:'808 Tuner',mount:mount808Tuner});
