import {workspace as w} from './workspace.mjs';
import {stripSilence,equalize5,EQ5_PRESETS,cleanVoice,bassBoost,noiseFilter,dynamics,fadeBuffer,resampleBuffer,exportWav,separateCenter} from './legacy-dsp.mjs';
const modules=[
 {id:'voice-cleaner',category:'ai',label:'Voice Cleaner',title:'Voice<br><span>Cleaner.</span>',desc:'High-pass filtering, presence EQ and compression for speech clarity.',presets:{Podcast:[100,4,-24,4],Warm:[75,1.8,-19,2.5],Crisp:[125,5,-21,3],Broadcast:[110,5,-20,4],'Soft Spoken':[65,1.5,-29,2]},fields:[['highpass','High-pass (Hz)',40,200],['presence','Presence (dB)',-8,10],['threshold','Threshold (dBFS)',-45,-6],['ratio','Compression ratio',1,10]]},
 {id:'eq5',category:'edit',label:'5-Band Equalizer',title:'Five bands.<br><span>Your sound.</span>',desc:'Five-band equalizer with dedicated sub, bass, mid, high-mid and brilliance controls.',presets:Object.fromEntries(Object.entries(EQ5_PRESETS).map(([name,v])=>[name.replaceAll('_',' ').toUpperCase(),v])),fields:[['sub','Sub · 60 Hz',-18,18],['bass','Bass · 230 Hz',-18,18],['mid','Mid · 1 kHz',-18,18],['highmid','High Mid · 4 kHz',-18,18],['brilliance','Air · 12 kHz',-18,18]]},
 {id:'silence-trim',category:'edit',label:'Silence Trim',title:'Cut the silence.<br><span>Keep the sound.</span>',desc:'Detect silence at both ends and preserve a short safety margin.',presets:{Standard:[-40],Gentle:[-55],Aggressive:[-30],Podcast:[-48]},fields:[['threshold','Silence threshold (dBFS)',-80,-10]]},
 {id:'fade',category:'edit',label:'Fade In / Out',title:'Shape the<br><span>transition.</span>',desc:'Smooth beginning or end of an audio clip, preserving the rest of its duration.',presets:{'Short In':[.1,0],'Long In':[2,0],'Short Out':[.1,1],'Long Out':[2,1],'Smooth In':[.5,0],'Smooth Out':[.5,1]},fields:[['duration','Duration (s)',.01,30],['direction','Direction (0 in / 1 out)',0,1]]},
 {id:'tone',category:'edit',label:'Bass & Noise Filters',title:'Clean lows.<br><span>Add weight.</span>',desc:'High-pass rumble reduction and bass-shelf boost using offline Web Audio processing.',presets:{'Bass Boost':[8,80],'Subtle Bass':[3,50],'Remove Rumble':[0,110],'Deep Bass':[10,45],'Voice Clean':[0,130]},fields:[['bass','Bass boost (dB)',-12,12],['cutoff','Low cut (Hz)',20,220]]},
 {id:'dynamics',category:'ai',label:'Compressor',title:'Dynamics.<br><span>In control.</span>',desc:'Apply a standalone compressor with adjustable threshold, ratio, attack and release.',presets:{Vocal:[-24,4,.003,.25],Bus:[-18,2,.02,.2],Punch:[-22,5,.005,.12],'Gentle Glue':[-15,2,.03,.3],'Soft Voice':[-19,2.5,.01,.3]},fields:[['threshold','Threshold (dBFS)',-50,-3],['ratio','Ratio',1,20],['attack','Attack (s)',.001,.1],['release','Release (s)',.02,1]]},
 {id:'resample',category:'export',label:'Resample & WAV',title:'Change rate.<br><span>Keep fidelity.</span>',desc:'Resample audio and export PCM WAV without sending files to a server.',presets:{'AUTO · MUSIC':[44100],'44.1 kHz':[44100],'48 kHz':[48000],'96 kHz':[96000]},fields:[['rate','Target sample rate (Hz)',8000,192000]]},
 {id:'center-separate',category:'edit',label:'Center Extractor',title:'Center vs.<br><span>Sides.</span>',desc:'Simple stereo center extraction for a vocal-like signal and instrumental remainder. Not AI stem separation.',presets:{'Extract Center':[]},fields:[]}
];
function escape(s){return String(s).replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));}
function mount(def,{host}){
 const choices=Object.entries(def.presets),fields=def.fields;
 host.innerHTML='<div class="tool-view module-work pulse-legacy"><div class="tool-view-header"><span>'+(def.category==='edit'?'02 / EDIT':def.category==='export'?'03 / EXPORT':'04 / AI STUDIO')+'</span><span>LOCAL AUDIO PROCESSING</span></div><h3>'+def.title+'</h3><p class="tool-description">'+escape(def.desc)+'</p><p class="pulse-detail-label">PRESETS</p><div class="pulse-legacy-presets">'+choices.map(([name],i)=>'<button data-preset="'+i+'" type="button" aria-pressed="'+String(i===0)+'">'+escape(name)+'</button>').join('')+'</div><div class="pulse-legacy-fields">'+fields.map(([id,label,min,max],i)=>'<label>'+escape(label)+'<input data-field="'+id+'" type="number" step="any" min="'+min+'" max="'+max+'" value="'+(choices[0][1][i]??0)+'"></label>').join('')+'</div><button class="tool-action tool-action-dark pulse-legacy-run" type="button">PROCESS AUDIO ↗</button><p role="status" class="pulse-legacy-status">Load a track into SOURCE AUDIO.</p></div>';
 const inputs=[...host.querySelectorAll('[data-field]')],status=host.querySelector('.pulse-legacy-status'),button=host.querySelector('.pulse-legacy-run');
 const read=()=>inputs.map((input,i)=>{const v=Number(input.value),min=Number(input.min),max=Number(input.max);if(!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+fields[i][1]);return v});
 host.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const values=choices[Number(b.dataset.preset)][1];inputs.forEach((input,i)=>{input.value=values[i]??0;input.dispatchEvent(new Event('input',{bubbles:true}));});host.querySelectorAll('[data-preset]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));status.textContent='Preset '+choices[Number(b.dataset.preset)][0]+' selected.'});
 button.onclick=async()=>{button.disabled=true;status.textContent='Processing…';try{const b=w.ensureAudio(),v=read();let output;
  switch(def.id){
   case 'voice-cleaner':output=await cleanVoice(b,{highpass:v[0],presence:v[1],threshold:v[2],ratio:v[3]});break;
   case 'eq5':output=await equalize5(b,v);break;
   case 'silence-trim':output=stripSilence(b,v[0]);break;
   case 'fade':output=fadeBuffer(b,v[0],v[1]===1?'out':'in');break;
   case 'tone':output=await noiseFilter(await bassBoost(b,v[0]),v[1]);break;
   case 'dynamics':output=await dynamics(b,{threshold:v[0],ratio:v[1],attack:v[2],release:v[3]});break;
   case 'resample':{const blob=await exportWav(b,v[0]),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pulse-resampled-'+v[0]+'.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Exported '+v[0]+' Hz WAV.';return;}
   case 'center-separate':{const parts=separateCenter(b);output=parts.vocals;status.textContent='Center extracted. This is not neural separation.';break;}
  }
  w.commit(output,def.label+' applied.');status.textContent='Processed successfully. Undo is available.';
 }catch(e){status.textContent=e.message||'Processing failed'}finally{button.disabled=false}};
}
export const legacyModules=Object.freeze(modules.map(def=>({id:def.id,category:def.category,label:def.label,mount:args=>mount(def,args)})));
