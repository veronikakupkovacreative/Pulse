import {workspace as w} from './workspace.mjs';
import {normalizationPlan, applyPeakGain, exportNormalizedWav} from './normalizer-core.mjs';

const showDb = number => Number.isFinite(number) ? number.toFixed(2) + ' dBFS' : 'SILENCE';

export const aiNormalizerModule = Object.freeze({
  id: 'normalize', category: 'ai', label: 'AI Normalizer',
  mount({host}) {
    if (!document.querySelector('link[data-normalizer-style]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet';
      link.href = '/modules/normalizer.css'; link.dataset.normalizerStyle = 'true'; document.head.append(link);
    }
    host.innerHTML = `<div class="tool-view module-work pulse-normalizer">
      <div class="tool-view-header"><span>04 / AI NORMALIZER</span><span>LOCAL PEAK DSP</span></div>
      <h3>AI<br><span>Normalizer.</span></h3>
      <p class="tool-description">Normalize the sample peak of your entire track while preserving dynamics and stereo balance. All processing stays in your browser.</p>
      <div class="pn-presets" role="group" aria-label="Target peak presets">
        <button type="button" data-preset="-1" aria-pressed="true">AUTO · −1 dBFS</button>
        <button type="button" data-preset="-3" aria-pressed="false">−3 dBFS</button>
        <button type="button" data-preset="-6" aria-pressed="false" >−6 dBFS</button><button type="button" data-preset="-0.5" aria-pressed="false">−0.5 dBFS</button><button type="button" data-preset="-2" aria-pressed="false">−2 dBFS</button>
      </div>
      <div class="pn-fields">
        <label for="pn-target">TARGET PEAK <input id="pn-target" type="number" min="-12" max="-0.1" step="0.1" value="-1"></label>
        <label for="pn-bits">WAV EXPORT <select id="pn-bits"><option value="auto" selected>AUTO · 24-bit PCM</option><option value="24">24-bit PCM</option><option value="16">16-bit PCM</option></select></label>
      </div>
      <div class="pn-meters" aria-label="Audio peak measurements">
        <div><span>INPUT PEAK</span><strong data-pn="before">—</strong></div>
        <div><span>OUTPUT PEAK</span><strong data-pn="after">—</strong></div>
        <div><span>APPLIED GAIN</span><strong data-pn="gain">—</strong></div>
        <div><span>BOOST LIMIT</span><strong>+6.02 dB</strong></div>
      </div>
      <div class="pn-preview" aria-label="Compare original and normalized audio">
        <div class="pn-ab"><button type="button" data-pn-mode="a" aria-pressed="false">A / ORIGINAL</button><button type="button" data-pn-mode="b" aria-pressed="true">B / NORMALIZED</button></div>
        <button type="button" data-pn-play>PLAY PREVIEW</button>
      </div>
      <div class="pn-actions">
        <button type="button" data-pn-apply>APPLY TO WORKSPACE <span>↗</span></button>
        <button type="button" data-pn-export>EXPORT NORMALIZED WAV <span>↗</span></button>
      </div>
      <p class="pn-status" role="status" aria-live="polite">Upload audio in SOURCE AUDIO to begin.</p>
      <p class="pn-disclaimer">Sample-peak normalization · 2× maximum boost · no LUFS or true-peak limiting · deterministic DSP, not neural AI.</p>
    </div>`;
    const $ = selector => host.querySelector(selector);
    const target = $('#pn-target'), status = $('.pn-status'), play = $('[data-pn-play]');
    const controls = [...host.querySelectorAll('button,input,select')];
    let trackedBuffer = null, plan = null, preview = null, gainNode = null;
    let previewAt = 0, startedAt = 0, mode = 'b', busy = false;
    let disposed = false;
    const report = (message, kind='') => {status.textContent=message;status.dataset.kind=kind;};
    const set = (name, text) => {$('[data-pn="'+name+'"]').textContent=text;};
    const stop = (rewind = false) => {
      if (preview) {
        if (!rewind) previewAt = Math.min(trackedBuffer?.duration || 0, Math.max(0, w.context.currentTime - startedAt));
        preview.onended = null; try { preview.stop(); } catch {}
        preview.disconnect(); preview = null;
      }
      if (gainNode) {gainNode.disconnect(); gainNode=null;}
      if (rewind) previewAt=0;
      play.textContent='PLAY PREVIEW';
    };
    const measure = () => {
      if (w.buffer !== trackedBuffer) {stop(true); trackedBuffer=w.buffer;}
      if (!trackedBuffer) {plan=null;set('before','—');set('after','—');set('gain','—');return;}
      plan = normalizationPlan(trackedBuffer, Number(target.value));
      set('before',showDb(plan.peakDbfs));set('after',showDb(plan.outputDbfs));
      set('gain',(plan.gainDb>=0?'+':'')+plan.gainDb.toFixed(2)+' dB');
      if (plan.silent) report('This track contains only silence; no gain can be calculated.');
      else if (plan.capped) report('Maximum 200% gain reached. The output stays below the target peak.');
      else report('Ready for preview, processing or export.');
    };
    const refreshMode = () => {
      host.querySelectorAll('[data-pn-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pnMode===mode)));
      if (gainNode && plan && w.context) gainNode.gain.setTargetAtTime(mode==='b'?plan.gain:1,w.context.currentTime,.005);
    };
    host.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
      target.value=button.dataset.preset;target.dispatchEvent(new Event('input',{bubbles:true}));host.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      stop();try{measure();}catch(error){report(error.message,'error');}
    }));
    target.addEventListener('input',()=>{
      host.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.preset)===Number(target.value))));
      stop();try{measure();}catch(error){plan=null;report(error.message,'error');}
    });
    host.querySelectorAll('[data-pn-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.pnMode;refreshMode();}));
    play.onclick=async()=>{
      if (busy) return;
      try {
        if (preview){stop();return;}
        if (!plan || plan.silent) throw Error('Upload a non-silent audio file in SOURCE AUDIO first.');
        w.stop(); const ctx=await w.ensureContext();
        if (disposed) return;
        if (previewAt>=trackedBuffer.duration)previewAt=0;
        const source=ctx.createBufferSource(), node=ctx.createGain();
        source.buffer=w.toNative(trackedBuffer);node.gain.value=mode==='b'?plan.gain:1;
        source.connect(node);node.connect(ctx.destination);
        source.onended=()=>{if(preview===source){stop(true);}};
        startedAt=ctx.currentTime-previewAt;preview=source;gainNode=node;
        source.start(0,previewAt);play.textContent='PAUSE PREVIEW';
      }catch(error){report(error.message,'error');}
    };
    const execute=async(action)=>{
      if(busy)return;
      busy=true; controls.forEach(c=>c.disabled=true);stop();
      try {
        if (!plan || !trackedBuffer || plan.silent) throw Error('Upload a non-silent audio file first.');
        if (trackedBuffer !== w.buffer) throw Error('Source audio changed. Reopen AI Normalizer.');
        if (action==='apply'){
          w.commit(applyPeakGain(trackedBuffer,plan.gain),'AI Normalizer applied. Undo is available.');
          measure();report('Normalized audio applied to SOURCE AUDIO. Use Undo to compare.','success');
        } else {
          report('Encoding WAV locally…');
          const depth=$('#pn-bits').value==='auto'?24:Number($('#pn-bits').value),blob=await exportNormalizedWav(trackedBuffer,plan.gain,depth);
          const url=URL.createObjectURL(blob),a=document.createElement('a');
          a.href=url;a.download=(w.name||'pulse-audio')+'-normalized-'+depth+'bit.wav';a.click();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
          report('Exported '+depth+'-bit WAV · '+(blob.size/1048576).toFixed(2)+' MB.','success');
        }
      }catch(error){report(error.message||'Processing failed.','error');}
      finally {busy=false;controls.forEach(c=>c.disabled=false);}
    };
    $('[data-pn-apply]').onclick=()=>execute('apply');
    $('[data-pn-export]').onclick=()=>execute('export');
    try{measure();}catch(error){report(error.message,'error');}
    const ticker=setInterval(()=>{
      if (disposed || busy || w.buffer===trackedBuffer) return;
      try{measure();}catch(error){report(error.message,'error');}
    },350);
    return ()=>{disposed=true;clearInterval(ticker);stop(true);};
  }
});
