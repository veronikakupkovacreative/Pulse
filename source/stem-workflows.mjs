// PULSE Studio · source separation workflow.
// Demucs neural inference is owned by the existing /vendor/demucs-worker.js.
// All resulting audio stays in browser memory; no cloud upload is performed.
export function mixSeparatedStems(stems,ignoredNames=[]){
  if(!Array.isArray(stems)||!stems.length)throw Error('No separated stems available.');
  const active=stems.filter(s=>!ignoredNames.some(name=>s.name.toLowerCase().includes(name)));
  if(!active.length)throw Error('No stems selected for the mix.');
  const rate=active[0].rate,length=active[0].channels[0].length;
  if(active.some(s=>s.rate!==rate||s.channels.length!==2||s.channels.some(c=>c.length!==length)))
    throw Error('Separated stems must be time-aligned stereo tracks.');
  const output=[new Float32Array(length),new Float32Array(length)];
  for(const stem of active)for(let ch=0;ch<2;ch++){
    const source=stem.channels[ch];
    for(let i=0;i<length;i++)output[ch][i]+=source[i];
  }
  return {channels:output.map(c=>Float32Array.from(c,v=>Math.max(-1,Math.min(1,v)))),rate};
}
export function estimateBeatGrid(channels,rate,{sensitivity=.62}={}){
  const markers=detectTransients(channels,rate,{sensitivity,minGapMs:130}).slice(1,-1);
  const differences=markers.slice(1).map((at,i)=>at-markers[i]).filter(x=>x>.18&&x<1.4);
  const candidates=[];
  for(let bpm=65;bpm<=190;bpm++){
    const period=60/bpm;
    let score=0;
    for(const d of differences){let best=Infinity;for(const multiple of [.5,1,1.5,2,3,4])best=Math.min(best,Math.abs(d-period*multiple)/(period*multiple));score+=Math.exp(-Math.pow(best/.16,2));}
    candidates.push({bpm,score:score/Math.max(1,differences.length)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0]||{bpm:null,score:0};
  return {markers,bpm:markers.length>=5&&best.score>.2?best.bpm:null,confidence:best.score};
}
export function initStemToolkit(project,encodeWav){
  const get=id=>document.getElementById(id);
  const labels=['vocals','drums','bass','other'];
  let stems=null,playing=null,playingContext=null,volumes=[1,1,1,1],muted=[false,false,false,false],solo=[false,false,false,false];
  function status(id,message){const target=get(id);if(target)target.textContent=message;}
  function stop(){
    if(playing){for(const source of playing){try{source.stop()}catch{}source.disconnect();}playing=null;}
    if(playingContext){const old=playingContext;playingContext=null;void old.close();}
  }
  function audioBuffer(context,channels,rate){
    const b=context.createBuffer(channels.length,channels[0].length,rate);
    channels.forEach((x,i)=>b.copyToChannel(x,i));return b;
  }
  function download(channels,rate,name){
    const blob=encodeWav(channels,rate,24);
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function play(channels,rate){
    stop();
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Web Audio is not available.');
    const ctx=new Audio();playingContext=ctx;
    const source=ctx.createBufferSource();source.buffer=audioBuffer(ctx,channels,rate);
    source.connect(ctx.destination);source.start();playing=[source];source.onended=()=>{if(playing?.[0]===source)stop();};
  }
  async function playStems(){
    if(!stems)throw Error('Separate audio into stems first.');
    stop();const ctx=new (window.AudioContext||window.webkitAudioContext)();playingContext=ctx;
    const hasSolo=solo.some(Boolean),sources=[],start=ctx.currentTime+.07;
    for(let i=0;i<stems.length;i++){
      if(muted[i]||(hasSolo&&!solo[i]))continue;
      const source=ctx.createBufferSource();source.buffer=audioBuffer(ctx,stems[i].channels,stems[i].rate);
      const gain=ctx.createGain();gain.gain.value=volumes[i];
      source.connect(gain).connect(ctx.destination);source.start(start);sources.push(source);
    }
    playing=sources;
    if(sources.length)sources[0].onended=()=>{if(playing===sources)stop();};
    else{void ctx.close();playingContext=null;status('stem-ai-status','All stems are muted.');}
  }
  function find(name){return stems?.find(s=>s.name.toLowerCase().includes(name));}
  function instrumental(){return mixSeparatedStems(stems,['vocals']);}
  function renderRows(){
    const root=get('stem-ai-rows');if(!root)return;
    root.replaceChildren();
    for(let i=0;i<stems.length;i++){
      const stem=stems[i],row=document.createElement('div');row.className='pulse-stem-tool-row';
      const title=document.createElement('strong');title.textContent=stem.name.replace(' (AI)','');
      const soloBtn=document.createElement('button');soloBtn.type='button';soloBtn.textContent='Solo';soloBtn.setAttribute('aria-pressed',String(solo[i]));
      soloBtn.onclick=()=>{solo[i]=!solo[i];soloBtn.setAttribute('aria-pressed',String(solo[i]));stop();};
      const muteBtn=document.createElement('button');muteBtn.type='button';muteBtn.textContent='Mute';muteBtn.setAttribute('aria-pressed',String(muted[i]));
      muteBtn.onclick=()=>{muted[i]=!muted[i];muteBtn.setAttribute('aria-pressed',String(muted[i]));stop();};
      const gain=document.createElement('input');gain.type='range';gain.min='0';gain.max='150';gain.value=String(volumes[i]*100);gain.setAttribute('aria-label',stem.name+' volume');
      const output=document.createElement('output');output.textContent=Math.round(volumes[i]*100)+'%';
      gain.oninput=()=>{volumes[i]=Number(gain.value)/100;output.textContent=gain.value+'%';};
      const exportBtn=document.createElement('button');exportBtn.type='button';exportBtn.textContent='Download WAV';
      exportBtn.onclick=()=>download(stem.channels,stem.rate,'pulse-'+stem.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.wav');
      row.append(title,soloBtn,muteBtn,gain,output,exportBtn);root.append(row);
    }
  }
  function analyzeDrums(){
    if(!stems)return;
    const drum=find('drum');if(!drum)return;
    const result=estimateBeatGrid(drum.channels,drum.rate,{sensitivity:Number(get('beat-ai-sensitivity')?.value||65)/100});
    const points=result.markers.slice(0,32),label=result.bpm?result.bpm+' BPM · onset confidence '+Math.round(result.confidence*100)+'%':'Unstable tempo · manual confirmation recommended';
    status('beat-ai-status','Demucs drum stem · '+result.markers.length+' detected transients · '+label+'.');
    get('beat-ai-readout').textContent=result.bpm?String(result.bpm):'—';
    get('beat-ai-markers').textContent=points.map(x=>x.toFixed(2)+' s').join(' · ')+(result.markers.length>32?' …':'');
  }
  window.addEventListener('pulse:demucs-stems',event=>{
    const data=event.detail?.stems;if(!Array.isArray(data)||data.length!==4)return;
    stems=data;volumes=[1,1,1,1];solo=[false,false,false,false];muted=[false,false,false,false];
    renderRows();get('stem-ai-results').hidden=false;get('vocal-ai-results').hidden=false;
    status('stem-ai-status','4 Demucs stems ready · vocals / drums / bass / other · all audio remains local.');
    status('vocal-ai-status','Vocals and instrumental generated from Demucs stems. Preview or download WAV.');
    analyzeDrums();
  });
  window.addEventListener('pulse:demucs-reset',()=>{
    stop();stems=null;get('stem-ai-results').hidden=true;get('vocal-ai-results').hidden=true;
    get('beat-ai-readout').textContent='—';get('beat-ai-markers').textContent='';
    for(const id of ['stem-ai-status','vocal-ai-status','beat-ai-status'])status(id,'AI source separation was reset. Load a track and run Demucs again.');
  });
  function separate(which){
    const trigger=get('mix-separate');
    if(!project.snapshot().working){status(which+'-ai-status','Load audio into the shared workspace first.');return;}
    if(trigger.disabled){status(which+'-ai-status','Separation unavailable. Use a 0.5–45 s desktop audio clip and wait for any previous job to finish.');return;}
    trigger.click();status(which+'-ai-status','Demucs running locally. Follow progress in AI Mix; results will appear here.');
  }
  get('stem-ai-start').onclick=()=>separate('stem');get('vocal-ai-start').onclick=()=>separate('vocal');
  for(const id of ['stem-ai-cancel','vocal-ai-cancel'])get(id).onclick=()=>get('mix-cancel-separation').click();
  get('stem-ai-preview').onclick=()=>{void playStems().catch(e=>status('stem-ai-status',e.message));};
  get('stem-ai-stop').onclick=stop;
  get('stem-ai-zip').onclick=async()=>{
    if(!stems)return;
    try{const zip=await createStoredZip(stems.map(s=>({name:s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.wav',data:encodeWav(s.channels,s.rate,24)})));
      const url=URL.createObjectURL(zip),a=document.createElement('a');a.href=url;a.download='pulse-4-stems.zip';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(e){status('stem-ai-status',e.message||'ZIP export failed.');}
  };
  get('vocal-ai-preview-voice').onclick=()=>{const s=find('vocal');if(s)void play(s.channels,s.rate).catch(e=>status('vocal-ai-status',e.message));};
  get('vocal-ai-preview-instrumental').onclick=()=>{try{const s=instrumental();void play(s.channels,s.rate);}catch(e){status('vocal-ai-status',e.message);}};
  get('vocal-ai-stop').onclick=stop;
  get('vocal-ai-export-voice').onclick=()=>{const s=find('vocal');if(s)download(s.channels,s.rate,'pulse-isolated-vocals.wav');};
  get('vocal-ai-export-instrumental').onclick=()=>{try{const s=instrumental();download(s.channels,s.rate,'pulse-instrumental.wav');}catch(e){status('vocal-ai-status',e.message);}};
  get('beat-ai-analyze').onclick=()=>{if(!stems){status('beat-ai-status','Run Demucs separation under Stem Splitter first.');return;}analyzeDrums();};
  get('beat-ai-sensitivity').oninput=()=>{if(stems)analyzeDrums();};
  window.addEventListener('pagehide',stop);
}
