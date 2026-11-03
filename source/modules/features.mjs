import {workspace as w} from './workspace.mjs';
import {tapTempoModule} from './tap-tempo.mjs';
import {creativeModules} from './creative-tools.mjs';
import {advancedModules} from './advanced-features.mjs';
import {legacyModules} from './legacy-tools.mjs';
import {advancedEqualizerModule} from './eq-advanced.mjs';
import {EQ3_PRESETS,EQ_GENRE_PRESETS,bandLayout,eqPresetGains,eqFilters,interpolateEqGains,formatEqFrequency} from './eq-engine.mjs';
import {renderWithNodes} from './legacy-dsp.mjs';
import {mountEqResponse} from './eq-response.mjs';
import {webModules} from './web-tools.mjs';
import {aiNormalizerModule} from './normalizer-tool.mjs';
import {pulseAiModules} from './pulse-ai-master.mjs';
import {producerModules} from './producer-tools.mjs';
import {mountMasteringTool} from './mastering-ui.mjs';
import {AUDIO_FORMATS,conversionOptions,convertBuffer,downloadConversion} from './converter.mjs';
import {estimateBpm,estimateKey,detectBeats,editRegion,reverseBuffer,normalizeBuffer,gainBuffer,applySmartMaster,equalize,audioMetrics} from './dsp.mjs';

const section=(name,tag='LOCAL DSP')=>'<div class="tool-view-header"><span>'+name+'</span><span>'+tag+'</span></div>';
const field=(id,label,min,max,value,step=1,unit='')=>'<label class="pulse-field" for="'+id+'"><span>'+label+'</span><div class="pulse-number-field"><input id="'+id+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" /><small>'+unit+'</small></div></label>';
const dropdown=(id,label,items)=>'<label class="pulse-field" for="'+id+'"><span>'+label+'</span><select id="'+id+'">'+items.map(([value,name])=>'<option value="'+value+'">'+name+'</option>').join('')+'</select></label>';
const actionButton=(name,id)=>'<button class="tool-action tool-action-dark module-action" data-action="'+id+'" type="button"><span>'+name+'</span><b aria-hidden="true">↗</b></button>';
const describe={
 bpm:{top:'01 / BPM ANALYZER',meta:'RHYTHM ANALYSIS',title:'Find the tempo.<br><span>Feel the rhythm.</span>',description:'Analyze transients and estimate the musical tempo from your track. Half-time and double-time interpretations may differ.',result:'ANALYZED TEMPO',actions:[['Analyze BPM','analyze']]},
 key:{top:'01 / KEY FINDER',meta:'HARMONIC ANALYSIS',title:'Find the key.<br><span>Build harmony.</span>',description:'Estimate musical key and Camelot wheel notation through local chroma analysis.',result:'TONALITY',actions:[['Analyze key','analyze']]},
 beats:{top:'01 / BEAT DETECTION',meta:'ONSET FINDER',title:'Discover<br><span>the beats.</span>',description:'Detect transient boundaries and display markers directly along the audio waveform.',result:'TRANSIENT MARKERS',actions:[['Detect onsets','analyze']]},
 editor:{top:'02 / AUDIO EDITOR',meta:'PRECISION EDIT',title:'Cut the sound.<br><span>Keep the groove.</span>',description:'Shift + drag across the waveform to choose an area. Trim keeps the selection; Cut removes it. Short fades reduce clicks.',result:'SELECTED RANGE',actions:[['Trim to selection','trim'],['Cut selection','cut']]},
 reverse:{top:'02 / AUDIO REVERSE',meta:'TIME DIRECTION',title:'Reverse<br><span>the sound.</span>',description:'Flip the track in time while retaining original duration and sample rate.',result:'PLAYBACK DIRECTION',actions:[['Reverse audio','reverse']]},
 normalize:{top:'02 / NORMALIZER',meta:'LEVEL CONTROL',title:'Control<br><span>the level.</span>',description:'Apply peak normalization to a chosen dBFS ceiling. This is not integrated LUFS normalization.',result:'PEAK TARGET',actions:[['Normalize audio','normalize']]},
 equalizer:{top:'02 / AI EQUALIZER',meta:'3 / 10 / 20 BANDS · LOCAL DSP',title:'AI Equalizer.<br><span>Shape your sound.</span>',description:'Genre-inspired 3, 10 or 20-band parametric EQ for EDM, vocals, hip-hop and acoustic music. The interactive response curve is rendered with real local filters.',result:'FREQUENCY RESPONSE',actions:[['Apply to workspace','equalizer']]},
 volume:{top:'02 / GAIN',meta:'AMPLITUDE',title:'Shape<br><span>the volume.</span>',description:'Adjust global track gain in decibels. The processed audio replaces the current workspace buffer.',result:'AMPLIFICATION',actions:[['Apply gain','volume']]},
 wav:{top:'03 / AUDIO CONVERTER',meta:'FORMAT CONTROL',title:'Change the format.<br><span>Keep creating.</span>',description:'Convert audio locally to MP3, WAV, FLAC, AAC, M4A, OGG or WMA. Choose compression quality and output sample rate.',result:'EXPORT FORMAT',actions:[['Convert & download','export']]},
 loop:{top:'03 / LOOP CUTTER',meta:'PRECISION EXPORT',title:'Cut the loop.<br><span>Keep the groove.</span>',description:'Choose a selection in the waveform and download only the selected range.',result:'LOOP RANGE',actions:[['Export selection','export']]},
 health:{top:'04 / MIX HEALTH',meta:'LOCAL ANALYSIS',title:'Know your mix.<br><span>Make it better.</span>',description:'Measure sample peak, RMS, crest factor and clipped samples. These are not LUFS or true-peak readings.',result:'MIX ANALYSIS',actions:[['Analyze mix','analyze']]},
 master:{top:'04 / SMART MASTER',meta:'LOCAL ADAPTIVE DSP',title:'Final sound.<br><span>Under control.</span>',description:'Compress dynamics and apply a soft limiter using local DSP. No neural model or certified true-peak limiting.',result:'MASTERING REPORT',actions:[['Generate master','master']]},
 quickfix:{top:'04 / MIX QUICK FIX',meta:'QUICK DSP',title:'Improve<br><span>your mix.</span>',description:'Apply a restrained one-click peak normalization and dynamic control chain.',result:'QUICK FIX',actions:[['Apply quick fix','quickfix']]}
};
const settings=id=>{
 if(id==='normalize')return '<div class="tool-fields">'+field('value','Target peak',-18,0,-1,.1,'dBFS')+'</div>';
 if(id==='volume')return '<div class="tool-fields">'+field('value','Output gain',-24,24,0,.5,'dB')+'</div>';
 if(id==='equalizer'){
  const order=['flat','edm','vocals','hiphop','acoustic','bass','warm','bright','voice','punch','rock','jazz','podcast','air','deep'];
  const options=order.map(key=>'<button type="button" data-preset="'+key+'" aria-pressed="'+String(key==='flat')+'">'+EQ_GENRE_PRESETS[key].name+'</button>').join('');
  return '<div class="pulse-preset-section"><div class="pulse-detail-label">GENRE & SOUND PRESETS</div><div class="eq-preset-pills" role="group" aria-label="AI Equalizer genre presets">'+options+'</div></div><div class="tool-fields eq-fields">'+'</div>';
 }
 if(id==='master')return '<div class="pulse-preset-section"><div class="pulse-detail-label">MASTER CHARACTER</div><div class="eq-preset-pills" role="group" aria-label="Mastering presets"><button type="button" data-master="balanced" aria-pressed="true">BALANCED</button><button type="button" data-master="warm" aria-pressed="false">WARM</button><button type="button" data-master="loud" aria-pressed="false">LOUD</button><button type="button" data-master="glue" aria-pressed="false">GENTLE GLUE</button><button type="button" data-master="punch" aria-pressed="false">PUNCH</button></div></div><div class="tool-fields">'+field('threshold','Threshold',-30,-6,-15,1,'dBFS')+field('ratio','Compression ratio',1,8,3,.5,':1')+field('ceiling','Soft ceiling',-6,-.1,-1,.1,'dBFS')+'</div>';
 if(id==='wav')return '<div class="tool-fields">'+dropdown('format','Output format',AUDIO_FORMATS.map(f=>[f.id,f.name+' · '+f.description]))+dropdown('sampleRate','Sample rate',[['auto','AUTO · 44.1 kHz (music)'],['original','Original'],['22050','22.05 kHz'],['32000','32 kHz'],['44100','44.1 kHz'],['48000','48 kHz'],['88200','88.2 kHz'],['96000','96 kHz']])+'</div><div class="tool-fields converter-options"><div data-converter="bitrate">'+dropdown('bitrate','Bitrate',[['auto','AUTO · recommended'],...[64,96,128,160,192,256,320].map(v=>[String(v),v+' kbps'])])+'</div><div data-converter="depth">'+dropdown('bitDepth','WAV bit depth',[['auto','AUTO · 24-bit PCM'],['16','16-bit PCM'],['24','24-bit PCM']])+'</div><div data-converter="ogg">'+dropdown('oggQuality','OGG Vorbis quality',[['auto','AUTO · Q6'],...Array.from({length:11},(_,i)=>[String(i),'Q'+i])])+'</div><div data-converter="flac">'+dropdown('flacLevel','FLAC compression',[['auto','AUTO · Level 5'],...Array.from({length:9},(_,i)=>[String(i),'Level '+i])])+'</div></div><p class="converter-codec-note" id="converter-codec-note">Your files stay in your browser. The encoder loads on first conversion.</p><div class="converter-progress" role="progressbar" aria-label="Encoding progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>';
 if(id==='loop')return '<div class="tool-fields">'+dropdown('bits','Output bit depth',[['auto','AUTO · WAV 16-bit'],['16','WAV · 16-bit PCM'],['24','WAV · 24-bit PCM']])+'</div>';
 return '';
};
const resultView=id=>{
 if(id==='key')return '<div class="pulse-result-block"><p class="pulse-detail-label">KEY DETECTION</p><div class="key-result pulse-harmonic-display"><div class="key-bubble"><strong data-metric="primary">—</strong><span data-metric="secondary">AWAITING TRACK</span></div><div class="key-extra"><span>CAMELOT</span><strong data-metric="camelot">—</strong><span data-metric="confidence">—</span></div></div></div>';
 if(id==='bpm')return '<div class="pulse-result-block"><p class="pulse-detail-label">ESTIMATED TEMPO</p><div class="pulse-metric-orbit"><strong data-metric="primary">—</strong><span>BEATS PER MINUTE</span><i aria-hidden="true"></i></div></div>';
 if(id==='health')return '<div class="pulse-result-block"><p class="pulse-detail-label">TRACK LEVELS</p><div class="pulse-metrics-grid"><div><small>PEAK</small><strong data-metric="peak">—</strong><small>dBFS</small></div><div><small>RMS</small><strong data-metric="rms">—</strong><small>dBFS</small></div><div><small>CREST</small><strong data-metric="crest">—</strong><small>dB</small></div><div><small>CLIPPED</small><strong data-metric="clipped">—</strong><small>samples</small></div></div></div>';
 if(id==='master'||id==='quickfix')return '<div class="pulse-result-block"><p class="pulse-detail-label">LEVEL REPORT</p><div class="pulse-metrics-grid pulse-master-metrics"><div><small>BEFORE PEAK</small><strong data-metric="before">—</strong><small>dBFS</small></div><div><small>AFTER PEAK</small><strong data-metric="after">—</strong><small>dBFS</small></div></div></div>';
 if(id==='editor'||id==='loop')return '<div class="pulse-result-block"><p class="pulse-detail-label">'+describe[id].result+'</p><div class="pulse-live-range" data-metric="range">Shift + drag on the waveform to select.</div></div>';
 return '<div class="pulse-result-block"><p class="pulse-detail-label">'+describe[id].result+'</p><div class="pulse-large-readout" data-metric="primary">—</div></div>';
};
const numeric=(host,id,min,max)=>{const value=Number(host.querySelector('#'+id)?.value);if(!Number.isFinite(value)||value<min||value>max)throw Error(id.toUpperCase()+' is outside the allowed range.');return value};
const setMetric=(host,name,value)=>{const el=host.querySelector('[data-metric="'+name+'"]');if(el)el.textContent=String(value)};
const run=async(id,mode,host)=>{
 const b=w.ensureAudio();
 if(id==='bpm'){const r=estimateBpm(b);w.setMarkers(r.onsets);setMetric(host,'primary',r.bpm??'—');return r.bpm?'Estimated '+r.bpm+' BPM · '+r.confidence+'% relative confidence.':'Not enough rhythmic information to identify BPM.'}
 if(id==='key'){const r=estimateKey(b);setMetric(host,'primary',r.key.split(' ')[0]);setMetric(host,'secondary',r.key.slice(r.key.indexOf(' ')+1).toUpperCase());setMetric(host,'camelot',r.camelot);setMetric(host,'confidence','Confidence indicator: '+r.confidence+'%');return 'Estimated tonality. Verify complex harmonies by ear.'}
 if(id==='beats'){const marks=detectBeats(b);w.setMarkers(marks);setMetric(host,'primary',marks.length+' ONSETS');return marks.length+' markers displayed on the waveform.'}
 if(id==='editor'){if(!w.selection||w.selection.end-w.selection.start<.01)throw Error('Shift + drag to select a range first.');w.commit(editRegion(b,w.selection.start,w.selection.end,mode));return mode==='cut'?'Selected region removed. Undo is available.':'Selection trimmed. Undo is available.'}
 if(id==='reverse'){w.commit(reverseBuffer(b));setMetric(host,'primary','REVERSED');return 'Audio reversed. Use Undo to compare.'}
 if(id==='normalize'){const v=numeric(host,'value',-18,0);w.commit(normalizeBuffer(b,v));setMetric(host,'primary',v.toFixed(1)+' dBFS');return 'Peak normalized.'}
 if(id==='volume'){const v=numeric(host,'value',-24,24);w.commit(gainBuffer(b,v));setMetric(host,'primary',(v>0?'+':'')+v.toFixed(1)+' dB');return 'Gain applied.'}
 if(id==='equalizer'){const controller=host.__pulseEqController;if(!controller)throw Error('Equalizer is not initialized.');const {count,values}=controller.read();const filters=eqFilters(count,values);w.commit(await renderWithNodes(b,filters),count+'-band Parametric EQ applied.');setMetric(host,'primary',count+' BANDS');return count+'-band Parametric EQ applied. Use Undo to compare.'}
 if(id==='wav'){const options=conversionOptions({format:host.querySelector('#format').value,sampleRate:host.querySelector('#sampleRate').value,bitrate:host.querySelector('#bitrate').value,bitDepth:host.querySelector('#bitDepth').value,oggQuality:host.querySelector('#oggQuality').value,flacLevel:host.querySelector('#flacLevel').value});const bar=host.querySelector('.converter-progress');const blob=await convertBuffer(b,options,msg=>{host.querySelector('.module-result').textContent=msg;},percent=>{bar.setAttribute('aria-valuenow',String(percent));bar.querySelector('i').style.width=percent+'%';});downloadConversion(blob,w.name,options.format);setMetric(host,'primary',options.format.toUpperCase());return 'Converted and downloaded '+options.format.toUpperCase()+' · '+(blob.size/1024/1024).toFixed(2)+' MB.';}
 if(id==='loop'){const choice=host.querySelector('#bits').value,bits=choice==='auto'?16:Number(choice);w.save(bits,true);return 'Selected loop exported.'}
 if(id==='health'){const r=audioMetrics(b);setMetric(host,'peak',r.peakDb.toFixed(1));setMetric(host,'rms',r.rmsDb.toFixed(1));setMetric(host,'crest',r.crestDb.toFixed(1));setMetric(host,'clipped',r.clipped);return 'Analysis complete · measurements are sample based.'}
 if(id==='master'||id==='quickfix'){const before=audioMetrics(b).peakDb;const result=id==='master'?applySmartMaster(b,{threshold:numeric(host,'threshold',-30,-6),ratio:numeric(host,'ratio',1,8),ceiling:numeric(host,'ceiling',-6,-.1)}):applySmartMaster(normalizeBuffer(b,-3),{threshold:-16,ratio:1.8,ceiling:-1});const after=audioMetrics(result).peakDb;w.commit(result);setMetric(host,'before',before.toFixed(1));setMetric(host,'after',after.toFixed(1));return 'Processed using local DSP. Compare with Undo.'}
};
function installEqGraph(host){
 const fields=host.querySelector('.eq-fields');
 if(!fields)throw Error('EQ controls are missing.');
 const presetButtons=[...host.querySelectorAll('[data-preset]')];
 let count=3,preset='flat',values=eqPresetGains(3,'flat'),graph=null;
 const allowed=new Set([3,10,20]);
 const markPreset=()=>presetButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset===preset)));
 function paintFields(){
  const bands=bandLayout(count);
  fields.innerHTML=bands.map((band,index)=>{
   const label=(count===3?['LOW','MID','HIGH'][index]:band.label)+' · '+formatEqFrequency(band.frequency);
   return '<label class="pulse-field" for="eq-gain-'+index+'"><span>'+label+'</span><div class="pulse-number-field"><input id="eq-gain-'+index+'" data-eq-gain="'+index+'" type="number" min="-18" max="18" step="0.5" value="'+values[index]+'" aria-label="'+label+', gain in dB"><small>dB</small></div></label>';
  }).join('');
  host.querySelector('.tool-view-header span:last-child').textContent=count+' BANDS · LOCAL DSP';
  graph?.refresh();
 }
 function updateGain(index,gain){
  if(index<0||index>=values.length)return;
  const rounded=Math.max(-18,Math.min(18,Math.round(gain*2)/2));
  values[index]=rounded;preset='custom';markPreset();
  const input=fields.querySelector('[data-eq-gain="'+index+'"]');
  if(input){input.value=String(rounded);input.dispatchEvent(new Event('input',{bubbles:true}));}
  graph?.refresh();
 }
 function changeCount(next){
  if(!allowed.has(next))return;
  if(next===count)return;
  values=preset==='custom'?interpolateEqGains(count,values,next):eqPresetGains(next,preset);
  count=next;paintFields();
 }
 fields.addEventListener('input',event=>{
  const input=event.target.closest('[data-eq-gain]');if(!input)return;
  const index=Number(input.dataset.eqGain),gain=Number(input.value);
  if(!Number.isInteger(index)||index<0||index>=values.length||!Number.isFinite(gain)||gain < -18||gain>18)return;
  values[index]=gain;preset='custom';markPreset();graph?.refresh();
 });
 for(const button of presetButtons)button.onclick=()=>{
  const selected=button.dataset.preset;
  if(!Object.hasOwn(EQ_GENRE_PRESETS,selected))return;
  const next=count===3?EQ3_PRESETS[button.dataset.preset]:eqPresetGains(count,selected);
  if(!next)return;
  values=[...next];preset=selected;paintFields();markPreset();
 };
 paintFields();
 graph=mountEqResponse({
  host,count:()=>count,gains:()=>values,changeGain:updateGain,
  changeCount,bandOptions:[3,10,20]
 });
 host.__pulseEqController={read:()=>({count,values:[...values]})};
 return()=>{graph?.cleanup();delete host.__pulseEqController;};
}
function initPresets(host,id){
 if(id==='master'){const presets={balanced:[-15,3,-1],warm:[-17,2,-1.2],loud:[-19,5,-.8],glue:[-12,1.8,-1],punch:[-18,3.6,-.9]};for(const button of host.querySelectorAll('[data-master]'))button.onclick=()=>{const v=presets[button.dataset.master];['threshold','ratio','ceiling'].forEach((name,i)=>{const input=host.querySelector('#'+name);input.value=String(v[i]);input.dispatchEvent(new Event('input',{bubbles:true}));});for(const b of host.querySelectorAll('[data-master]'))b.setAttribute('aria-pressed',String(b===button))};}
}
export const toolModules=Object.freeze([...Object.entries(describe).filter(([id])=>id!=='normalize').map(([id,d])=>({id,category:({bpm:'analyze',key:'analyze',beats:'analyze',editor:'edit',reverse:'edit',normalize:'edit',equalizer:'edit',volume:'edit',wav:'export',loop:'export',health:'ai',master:'ai',quickfix:'ai'})[id],label:({bpm:'BPM Analyzer',key:'Key Finder',beats:'Beat Detection',editor:'Audio Editor',reverse:'Reverse Audio',normalize:'Normalizer',equalizer:'AI Equalizer',volume:'Gain',wav:'Converter',loop:'Loop Cutter',health:'Mix Health',master:'Smart Master',quickfix:'Mix Quick Fix'})[id],mount({host}){
 if(id==='master')return mountMasteringTool({host,mode:'smart'});
 host.innerHTML='<div class="tool-view module-work">'+section(d.top,d.meta)+'<h3>'+d.title+'</h3><p class="tool-description">'+d.description+'</p>'+settings(id)+resultView(id)+'<div class="pulse-module-actions">'+d.actions.map(([name,value])=>actionButton(name,value)).join('')+'</div><p class="tool-footnote module-result" aria-live="polite" role="status">Load audio to begin.</p></div>';
 initPresets(host,id);
 if(id==='wav'){const format=host.querySelector('#format');const update=()=>{const v=format.value;for(const [name,active] of [['bitrate',['mp3','aac','m4a','wma'].includes(v)],['depth',v==='wav'],['ogg',v==='ogg'],['flac',v==='flac']])host.querySelector('[data-converter="'+name+'"]').hidden=!active;const note=host.querySelector('#converter-codec-note');note.textContent=v==='wav'&&host.querySelector('#sampleRate').value==='original'?'Native PCM WAV conversion · no extra codec download.':'Local FFmpeg WebAssembly processing · first use downloads the codec. WMA and other legacy formats may depend on codec compatibility.';};format.addEventListener('change',update);host.querySelector('#sampleRate').addEventListener('change',update);update();}
 let cleanup=()=>{};if(id==='equalizer')cleanup=installEqGraph(host);
 const buttons=[...host.querySelectorAll('[data-action]')];
 for(const button of buttons)button.onclick=async()=>{const out=host.querySelector('.module-result');buttons.forEach(b=>b.disabled=true);out.textContent='Processing audio…';out.removeAttribute('data-kind');try{const answer=await run(id,button.dataset.action,host);out.textContent=answer||'Complete.';out.dataset.kind='success'}catch(e){out.textContent=e.message||'Processing failed.';out.dataset.kind='error'}finally{buttons.forEach(b=>b.disabled=false)}};
 if(id==='editor'||id==='loop'){const interval=()=>{const el=host.querySelector('[data-metric="range"]');if(el)el.textContent=w.selection?w.selection.start.toFixed(2)+' – '+w.selection.end.toFixed(2)+' s':'Shift + drag on the waveform to select.'};interval();const timer=setInterval(interval,350);return()=>{clearInterval(timer);cleanup()}}
 return cleanup;
}})),tapTempoModule,...creativeModules,...advancedModules,...legacyModules.filter(module=>module.id!=='eq5'),advancedEqualizerModule,...webModules,aiNormalizerModule,...pulseAiModules,...producerModules]);
