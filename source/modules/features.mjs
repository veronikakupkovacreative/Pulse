import {workspace as w} from './workspace.mjs';
import {estimateBpm,estimateKey,detectBeats,editRegion,reverseBuffer,normalizeBuffer,gainBuffer,applySmartMaster,equalize,audioMetrics} from './dsp.mjs';
const definitions=[
['bpm','analyze','BPM Analyzer',async()=>{const r=estimateBpm(w.ensureAudio());w.setMarkers(r.onsets);return r.bpm?r.bpm+' BPM · '+r.confidence+'% relative confidence':'Tempo cannot be estimated reliably'}],
['key','analyze','Key Finder',async()=>{const r=estimateKey(w.ensureAudio());return r.key+' · Camelot '+r.camelot+' · confidence indicator '+r.confidence+'%'}],
['beats','analyze','Beat Detection',async()=>{const marks=detectBeats(w.ensureAudio());w.setMarkers(marks);return marks.length+' onset markers added to waveform'}],
['editor','edit','Cut / Trim',async(mode)=>{if(!w.selection)throw Error('Shift + drag a selection on the waveform');w.commit(editRegion(w.ensureAudio(),w.selection.start,w.selection.end,mode));return mode+' completed'}],
['reverse','edit','Reverse Audio',async()=>{w.commit(reverseBuffer(w.ensureAudio()));return 'Audio reversed'}],
['normalize','edit','Normalize',async(_,h)=>{const db=Number(h.querySelector('#value').value);if(!Number.isFinite(db)||db< -18||db>0)throw Error('Target must be between -18 and 0 dBFS');w.commit(normalizeBuffer(w.ensureAudio(),db));return 'Normalized to '+db+' dBFS'}],
['equalizer','edit','Equalizer',async(_,h)=>{const low=Number(h.querySelector('#low').value),mid=Number(h.querySelector('#mid').value),high=Number(h.querySelector('#high').value);w.commit(await equalize(w.ensureAudio(),{low,mid,high}));return 'Three-band EQ applied'}],
['volume','edit','Gain',async(_,h)=>{const db=Number(h.querySelector('#value').value);if(!Number.isFinite(db)||db< -24||db>24)throw Error('Gain out of range');w.commit(gainBuffer(w.ensureAudio(),db));return 'Gain applied: '+db+' dB'}],
['wav','export','Audio Converter',async(_,h)=>{const bits=Number(h.querySelector('#bits').value);w.save(bits);return bits+'-bit WAV exported'}],
['loop','export','Loop Cutter',async(_,h)=>{const bits=Number(h.querySelector('#bits').value);w.save(bits,true);return 'Selected loop exported'}],
['health','ai','Mix Health',async()=>{const m=audioMetrics(w.ensureAudio());return 'Peak '+m.peakDb.toFixed(1)+' dBFS · RMS '+m.rmsDb.toFixed(1)+' dBFS · Crest '+m.crestDb.toFixed(1)+' dB · Clipped samples '+m.clipped}],
['master','ai','Smart Master',async(_,h)=>{w.commit(applySmartMaster(w.ensureAudio(),{threshold:Number(h.querySelector('#threshold').value),ratio:Number(h.querySelector('#ratio').value),ceiling:Number(h.querySelector('#ceiling').value)}));return 'Local compressor and soft limiter applied (DSP, not neural AI)'}],
['quickfix','ai','Mix Quick Fix',async()=>{w.commit(applySmartMaster(normalizeBuffer(w.ensureAudio(),-3),{threshold:-16,ratio:1.8,ceiling:-1}));return 'DSP Quick Fix applied'}]
];
const input=(id,label,min,max,value,step=1)=>'<label class="module-row">'+label+'<input id="'+id+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></label>';
const controls=id=>id==='normalize'?input('value','Peak target (dBFS)',-18,0,-1,.1):id==='volume'?input('value','Gain (dB)',-24,24,0,.5):id==='equalizer'?input('low','Low 120 Hz (dB)',-18,18,0)+input('mid','Mid 1.2 kHz (dB)',-18,18,0)+input('high','High 8.5 kHz (dB)',-18,18,0):id==='master'?input('threshold','Threshold (dBFS)',-30,-6,-15)+input('ratio','Ratio',1,8,3,.5)+input('ceiling','Soft ceiling (dBFS)',-6,-.1,-1,.1):['wav','loop'].includes(id)?'<label class="module-row">WAV bit depth<select id="bits"><option value="16">16-bit PCM</option><option value="24">24-bit PCM</option></select></label>':'';
export const toolModules=Object.freeze(definitions.map(([id,category,label,fn])=>({id,category,label,mount({host}){
const actions=id==='editor'?[['trim','TRIM SELECTION'],['cut','CUT SELECTION']]:[['run','RUN '+label.toUpperCase()]];
host.innerHTML='<div class="module-work"><p class="module-kicker">PULSE / LOCAL PROCESSING</p><h3>'+label+'.</h3><p class="module-description">Process uploaded audio locally in the browser. Results depend on source quality and browser codec support.</p>'+controls(id)+actions.map(([value,title])=>'<button type="button" class="module-button" data-action="'+value+'">'+title+'</button>').join('')+'<p class="module-result" role="status" aria-live="polite">Upload audio to begin.</p></div>';
for(const button of host.querySelectorAll('[data-action]'))button.onclick=async()=>{const out=host.querySelector('.module-result');button.disabled=true;out.textContent='Processing…';try{const result=await fn(button.dataset.action,host);out.textContent=result;}catch(error){out.textContent=error.message||'Processing failed.';out.dataset.kind='error'}finally{button.disabled=false}};
}})));
