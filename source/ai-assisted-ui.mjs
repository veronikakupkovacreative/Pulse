// AI-assisted processing uses actual Demucs model outputs, never simulated AI labels.
// The optional Demucs 4-stem model is launched from AI Mix on user's command.
export function initAiAssistedDSP(project,encodeWav){
 const el=id=>document.getElementById(id),host=el('panel-equalizer');
 if(!host)return;
 const panel=document.createElement('details');
 panel.className='pulse-ai-advanced';
 panel.innerHTML='<summary>AI ASSISTED DSP · DEMUCS ANALYSIS</summary>'+
 '<p class="tool-footnote">Run “Separate into 4 stems” in AI Mix first. The real Demucs model identifies vocals, drums, bass and other; this assistant derives editable FX settings from their measured energies. Neural inference is not a mastering model.</p>'+
 '<p class="tool-footnote" id="ai-dsp-status" role="status">No AI model output yet. Open AI Mix and separate a 0.5–45 s clip.</p>'+
 '<div class="quick-actions"><button id="ai-dsp-open-mix" type="button">Open AI Mix ↗</button><button id="ai-dsp-suggest" type="button" disabled>Analyze & Suggest ↗</button></div>'+
 '<div id="ai-dsp-results" hidden><div class="tool-fields">'+
 '<label>Effect<select id="ai-dsp-effect"><option value="chorus">Chorus</option><option value="phaser">Phaser</option><option value="flanger">Flanger</option><option value="transient">Transient Shaper</option><option value="deesser">De-Esser</option><option value="normalize">Normalize</option><option value="sidechain">Sidechain · bass keyed by drums</option></select></label>'+
 '<label>AI suggestion <output id="ai-dsp-readout">—</output></label></div>'+
 '<div class="quick-actions"><button id="ai-dsp-set" type="button">Use suggested settings ↗</button><button id="ai-dsp-render" type="button">Render Sidechain Preview</button><button id="ai-dsp-apply" type="button">Apply Sidechain to Workspace</button><button id="ai-dsp-export" type="button">Export Sidechain WAV ↗</button></div></div>';
 host.append(panel);
 let stems=null,settings=null,sidechain=null;
 const tell=message=>{el('ai-dsp-status').textContent=message;};
 const inspect=()=>{
   if(!stems||stems.length!==4)throw Error('Run Demucs separation in AI Mix first.');
   const sum=stems.map(stem=>{
     const m=analyzeAudioForAssist(stem.channels,stem.rate);
     return {stem,features:m,energy:Math.pow(10,m.rmsDb/10)};
   });
   const all=sum.reduce((a,b)=>a+b.energy,0)||1;
   const classifications=sum.map(x=>({
     label:x.stem.name.toLowerCase().includes('vocal')?'Singing and vocals':
       x.stem.name.toLowerCase().includes('drum')?'Drum percussion':
       x.stem.name.toLowerCase().includes('bass')?'Bass synthesizer':'Musical instrument',
     score:Math.max(0,Math.min(1,x.energy/all))
   }));
   const main=project.snapshot().working,features=main?analyzeAudioForAssist(
     Array.from({length:main.numberOfChannels},(_,i)=>main.getChannelData(i)),main.sampleRate):sum[0].features;
   return {classifications,features};
 };
 function update(){
   const choice=el('ai-dsp-effect').value;
   try{
     const analysis=inspect();
     settings=recommendAiSettings(analysis.classifications,analysis.features,choice);
     const details=Object.entries(settings.settings).map(([k,v])=>k+' '+v).join(' · ');
     el('ai-dsp-readout').textContent=details;
     tell('Demucs output analyzed · '+settings.method+' · '+details);
     const isSidechain=choice==='sidechain';
     for(const id of ['ai-dsp-render','ai-dsp-apply','ai-dsp-export'])el(id).hidden=!isSidechain;
     el('ai-dsp-set').hidden=isSidechain;
     sidechain=null;
   }catch(error){tell(error.message);}
 }
 window.addEventListener('pulse:demucs-stems',event=>{
   const next=event.detail?.stems;
   if(!Array.isArray(next)||next.length!==4)return;
   stems=next;settings=null;sidechain=null;el('ai-dsp-suggest').disabled=false;
   el('ai-dsp-results').hidden=false;update();
 });
 window.addEventListener('pulse:demucs-reset',()=>{stems=null;settings=null;sidechain=null;el('ai-dsp-suggest').disabled=true;el('ai-dsp-results').hidden=true;tell('Demucs results were invalidated. Run stem separation again.');});
 el('ai-dsp-open-mix').onclick=()=>{el('tab-mix')?.click();el('toolkit')?.scrollIntoView({behavior:'smooth'});};
 el('ai-dsp-suggest').onclick=update;el('ai-dsp-effect').onchange=update;
 el('ai-dsp-set').onclick=()=>{
   if(!settings) return;
   const effect=settings.effect,p=settings.settings;
   if(['chorus','phaser','flanger','transient','deesser'].includes(effect)){
     el('fx-type').value=effect;el('fx-type').dispatchEvent(new Event('input',{bubbles:true}));
     const vals=effect==='transient'?[(p.attack+100)/2,(p.sustain+100)/2,50]:
       effect==='deesser'?[(p.frequency-2500)/80,(p.threshold+50)/.4,p.amount]:
       [(p.rate-.1)*12,p.depth,p.mix];
     ['fx-a','fx-b','fx-c'].forEach((id,i)=>{el(id).value=String(Math.max(0,Math.min(100,vals[i])));el(id).dispatchEvent(new Event('input',{bubbles:true}));});
     tell('Demucs-informed settings loaded into Advanced FX. Preview then Apply.');
   }else if(effect==='normalize'){
     el('tab-normalizer').click();el('norm-mode').value='lufs';el('norm-mode').dispatchEvent(new Event('change'));
     el('norm-lufs').value=String(p.targetLufs);el('norm-ceiling').value=String(p.ceiling);
     tell('Demucs-informed LUFS target loaded. Preview normalization before Apply.');
   }
 };
 async function renderSidechain(){
   if(!settings||settings.effect!=='sidechain')throw Error('Select Sidechain and analyze.');
   const drums=stems.find(s=>/drum/i.test(s.name)),bass=stems.find(s=>/bass/i.test(s.name));
   if(!drums||!bass||drums.rate!==bass.rate)throw Error('Aligned Demucs drums and bass stems are required.');
   const p=settings.settings;sidechain=sidechainProcess(bass.channels,drums.channels,bass.rate,p);
   tell('Drums control bass gain · max gain reduction '+sidechain.maxReductionDb.toFixed(1)+' dB. Trigger remains inaudible in the processed bass.');
   return {processed:sidechain,rate:bass.rate};
 }
 async function action(which){
   try{
     const {processed,rate}=await renderSidechain();
     const Ctx=window.AudioContext||window.webkitAudioContext;
     const context=new Ctx();const buffer=context.createBuffer(processed.channels.length,processed.channels[0].length,rate);
     processed.channels.forEach((x,i)=>buffer.copyToChannel(x,i));void context.close();
     if(which==='apply'){project.workspace.apply(buffer);window.dispatchEvent(new Event('pulse:advanced-applied'));tell('Sidechained bass applied to workspace · Undo available.');}
     else if(which==='preview'){
       const live=new Ctx(),source=live.createBufferSource();source.buffer=buffer;source.connect(live.destination);
       source.start();source.onended=()=>void live.close();
     }else{
       const blob=encodeWav(processed.channels,rate,24),url=URL.createObjectURL(blob),a=document.createElement('a');
       a.href=url;a.download='pulse-ai-assisted-sidechain-bass.wav';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
     }
   }catch(error){tell(error.message);}
 }
 el('ai-dsp-render').onclick=()=>void action('preview');el('ai-dsp-apply').onclick=()=>void action('apply');
 el('ai-dsp-export').onclick=()=>void action('export');
}
