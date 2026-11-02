import {workspace as w} from './workspace.mjs';
import {ThePulseStudioEngine,ENHANCER_PRESETS,VISUAL_PRESETS} from './pulse-engine.mjs';
const studio=new ThePulseStudioEngine();
const presets=items=>Object.entries(items).map(([id,v],i)=>'<button type="button" data-preset="'+id+'" aria-pressed="'+(i===0)+'"><strong>'+v.label+'</strong><span>'+(v.sub||'VISUAL PROFILE')+'</span></button>').join('');
export const creativeModules=Object.freeze([
 {id:'enhancer',category:'ai',label:'Audio Enhancer',mount({host}){
  const enhancer=studio.createAIAudioEnhancer('studio_sound');
  host.innerHTML='<div class="tool-view pulse-creative"><div class="tool-view-header"><span>04 / AUDIO ENHANCER</span><span>LOCAL DSP · 5 PRESETS</span></div><h3>Shape the sound.<br><span>Keep the feeling.</span></h3><p class="tool-description">Studio-ready tonal enhancement for music, podcasts and vocals. Runs locally with EQ and dynamics, not neural AI.</p><p class="pulse-detail-label">CHOOSE YOUR SOUND</p><div class="creative-presets">'+presets(ENHANCER_PRESETS)+'</div><label class="creative-mix">PROCESSING AMOUNT <output id="enhancer-mix-value">100%</output><input id="enhancer-mix" type="range" min="0" max="100" value="100"></label><div class="creative-meter"><span>PROCESSING CHAIN</span><strong>HIGH-PASS / EQ / COMPRESSOR / OUTPUT</strong></div><button class="tool-action tool-action-dark creative-apply" type="button">Apply Enhancer <span>↗</span></button><p role="status" class="tool-footnote creative-status">Choose a sound character and upload audio.</p></div>';
  const buttons=[...host.querySelectorAll('[data-preset]')],slider=host.querySelector('#enhancer-mix'),action=host.querySelector('.creative-apply'),status=host.querySelector('.creative-status');
  buttons.forEach(button=>button.onclick=()=>{enhancer.applyPreset(button.dataset.preset);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));status.textContent=enhancer.settings.sub+' selected.';});
  slider.oninput=()=>{enhancer.setMix(Number(slider.value));host.querySelector('#enhancer-mix-value').textContent=slider.value+'%'};
  action.onclick=async()=>{action.disabled=true;status.textContent='Processing locally…';try{const b=w.ensureAudio(),result=await enhancer.processBuffer(b);w.commit(result,'Audio enhanced.');status.textContent=enhancer.settings.label+' applied. Use Undo to compare.'}catch(e){status.textContent=e.message}finally{action.disabled=false}};
 }},
 {id:'visualizer',category:'analyze',label:'Audiogram Visualizer',mount({host}){
  host.innerHTML='<div class="tool-view pulse-creative"><div class="tool-view-header"><span>01 / AUDIOGRAM VISUALIZER</span><span>REAL-TIME / WEB AUDIO</span></div><h3>See your<br><span>sound.</span></h3><p class="tool-description">Live audiogram, waveform and spectrum visualization of the SOURCE AUDIO playback. No audio is uploaded.</p><p class="pulse-detail-label">VISUAL CHARACTER</p><div class="creative-presets">'+presets(VISUAL_PRESETS)+'</div><div class="creative-modes"><button data-mode="audiogram" aria-pressed="true">AUDIOGRAM</button><button data-mode="waveform" aria-pressed="false">WAVEFORM</button><button data-mode="spectrum" aria-pressed="false">SPECTRUM</button></div><div class="creative-preview"><canvas id="pulse-visualizer-canvas" height="270" aria-label="Live audio visualization"></canvas><span class="creative-preview-tag">PULSE / LIVE SIGNAL</span></div><p role="status" class="tool-footnote creative-status">Press Play in SOURCE AUDIO to animate the visualization.</p></div>';
  const visualizer=studio.createVisualizerEngine(w.source,host.querySelector('canvas'),'audiogram').start();
  const status=host.querySelector('.creative-status');
  const onSource=event=>{visualizer.attachSource(event.detail.source);status.textContent=event.detail.source?'Live playback signal connected.':'Press Play in SOURCE AUDIO to animate.';};
  document.addEventListener('pulse:audio-source',onSource);
  host.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{visualizer.applyPreset(button.dataset.preset);host.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)))});
  host.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{visualizer.setMode(button.dataset.mode);host.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)))});
  return ()=>{document.removeEventListener('pulse:audio-source',onSource);visualizer.dispose()};
 }}
]);
