import {workspace as w} from './workspace.mjs';
import {equalize5, renderWithNodes} from './legacy-dsp.mjs';
import {bandLayout,eqPresetGains,eqFilters,interpolateEqGains,EQ_GENRE_PRESETS,formatEqFrequency} from './eq-engine.mjs';
import {mountEqResponse} from './eq-response.mjs';
import {downloadEqWav} from './eq-export.mjs';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const advancedEqualizerModule=Object.freeze({
  id:'eq5',category:'edit',label:'Advanced Audio Equalizer',
  mount({host}){
    let count=5,preset='flat',values=eqPresetGains(5,'flat'),busy=false;
    const names=Object.entries(EQ_GENRE_PRESETS);
    host.innerHTML=`<div class="tool-view module-work pulse-legacy pulse-eq-advanced">
      <div class="tool-view-header"><span>02 / ADVANCED AUDIO EQUALIZER</span><span>3 / 5 / 10 / 20 BAND DSP</span></div>
      <h3>Fine-tune.<br><span>Every frequency.</span></h3>
      <p class="tool-description">A professional multi-band EQ for sub-bass, bass, mids, high-mids and brilliance. Choose a sound profile, switch the band count below the waveform, then refine each frequency.</p>
      <p class="pulse-detail-label">GENRE &amp; MASTERING PRESETS</p>
      <div class="pulse-legacy-presets eq-genre-presets" role="group" aria-label="Advanced Equalizer presets">${names.map(([id,item])=>`<button type="button" data-eq-preset="${id}" aria-pressed="${id==='flat'}">${escapeHtml(item.name)}</button>`).join('')}</div>
      <div class="eq-fields-heading"><span>FREQUENCY CONTROL</span><span data-eq-mode>5 BANDS</span></div>
      <div class="pulse-legacy-fields eq-advanced-fields"></div>
      <p class="eq-advanced-note">Gain -18 to +18 dB per band. A/B compare using SOURCE AUDIO Undo. Presets are deterministic EQ curves, not neural AI.</p>
      <div class="eq-advanced-actions"><button class="tool-action tool-action-dark pulse-legacy-run eq-advanced-apply" type="button"><span>APPLY EQ TO WORKSPACE</span><span aria-hidden="true">&#8599;</span></button><button class="eq-advanced-export" type="button"><span>EXPORT EQ · WAV 24-BIT</span><span aria-hidden="true">&#8599;</span></button></div>
      <p class="pulse-legacy-status" role="status" aria-live="polite">Choose a preset or adjust the graph to begin.</p>
    </div>`;
    const root=host.querySelector('.pulse-eq-advanced'),fields=host.querySelector('.eq-advanced-fields');
    const status=host.querySelector('[role=status]'),apply=host.querySelector('.eq-advanced-apply'),exportButton=host.querySelector('.eq-advanced-export');
    const btns=[...host.querySelectorAll('[data-eq-preset]')];
    let graph=null;
    function setStatus(text,kind='info'){status.textContent=text;status.dataset.kind=kind;}
    function updatePresetButtons(){for(const button of btns)button.setAttribute('aria-pressed',String(button.dataset.eqPreset===preset));}
    function paintFields(){
      const layout=bandLayout(count);
      fields.innerHTML=layout.map((band,index)=>`<label for="eq-advanced-${index}"><span>${escapeHtml(band.label)} <small>${formatEqFrequency(band.frequency)}</small></span><input id="eq-advanced-${index}" data-eq-gain="${index}" type="number" min="-18" max="18" step="0.5" value="${values[index]}" aria-label="${escapeHtml(band.label)}, ${formatEqFrequency(band.frequency)}, gain in decibels"></label>`).join('');
      host.querySelector('[data-eq-mode]').textContent=`${count} BANDS`;
    }
    function updateGain(index,gain){
      const rounded=Math.max(-18,Math.min(18,Math.round(gain*2)/2));
      values[index]=rounded;preset='custom';updatePresetButtons();
      const input=fields.querySelector(`[data-eq-gain="${index}"]`);
      if(input){input.value=String(rounded);input.dispatchEvent(new Event('input',{bubbles:true}));}
      setStatus(`${formatEqFrequency(bandLayout(count)[index].frequency)} adjusted to ${rounded>0?'+':''}${rounded.toFixed(1)} dB.`);
    }
    function selectBandCount(next){
      const previous=count,oldValues=values;
      count=next;
      values=preset==='custom'?interpolateEqGains(previous,oldValues,next):eqPresetGains(next,preset);
      paintFields();
      setStatus(`${count} processing bands selected. All ${count} frequencies will be rendered.`);
    }
    function selectPreset(id){
      preset=id;values=eqPresetGains(count,id);paintFields();updatePresetButtons();
      graph?.refresh();setStatus(`${EQ_GENRE_PRESETS[id].name} preset selected for ${count} bands. Press Apply to render.`);
    }
    for(const button of btns)button.addEventListener('click',()=>selectPreset(button.dataset.eqPreset));
    fields.addEventListener('input',event=>{
      const input=event.target.closest('[data-eq-gain]');if(!input)return;
      const index=Number(input.dataset.eqGain),value=Number(input.value);
      if(input.value.trim()===''||!Number.isFinite(value)||value < -18||value >18){setStatus('Enter an EQ gain between -18 and +18 dB.','error');return;}
      values[index]=value;preset='custom';updatePresetButtons();graph?.refresh();
      setStatus(`Custom EQ curve updated. ${count} bands active.`);
    });
    paintFields();
    graph=mountEqResponse({host,count:()=>count,gains:()=>values,changeGain:updateGain,changeCount:selectBandCount,bandOptions:[3,5,10,20]});
    async function execute(action){
      if(busy)return;
      busy=true;apply.disabled=true;exportButton.disabled=true;
      setStatus(action==='export'?'Rendering EQ for 24-bit WAV export...':'Rendering all EQ bands locally...');
      try {
        const audio=w.ensureAudio(),inputs=[...fields.querySelectorAll('[data-eq-gain]')];
        const typed=inputs.map(input=>{
          if(input.value.trim()==='')throw Error('A band gain cannot be empty.');
          return Number(input.value);
        });
        const specs=eqFilters(count,typed);
        const output=count===5?await equalize5(audio,typed):await renderWithNodes(audio,specs);
        if(action==='export'){
          const file=downloadEqWav(output,w.name,'advanced-equalizer');
          setStatus('Exported '+file.filename+' · '+(file.bytes/1048576).toFixed(2)+' MB.','success');
        }else{
          w.commit(output,'Advanced Audio Equalizer '+count+' bands applied.');
          setStatus(count+'-band EQ applied. Use Undo to compare with the original.','success');
        }
      } catch(error){setStatus(error.message||'EQ processing failed.','error');}
      finally{busy=false;apply.disabled=false;exportButton.disabled=false;}
    }
    apply.addEventListener('click',()=>execute('apply'));
    exportButton.addEventListener('click',()=>execute('export'));
    return ()=>{graph?.cleanup();};
  }
});