import {splitClip,clipSamples,renderClips,validatePlugin,makeBuffer} from './dsp/clip-engine.mjs';
import {renderModulation} from './advanced-fx.mjs';

export function runProducerWorker(kind,channels,rate,options={},signal){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./producer-worker.mjs',import.meta.url),{type:'module'});
    const done=(error,value)=>{worker.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const abort=()=>done(new DOMException('Processing canceled.','AbortError'));
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>done(data.error?Error(data.error):null,data);
    worker.onerror=e=>{e.preventDefault();done(Error(e.message||'Audio worker failed.'));};
    worker.postMessage({kind,channels,rate,options},channels.map(c=>c.buffer));
  });
}

export function initProducerStudio(project,encodeWav){
  const section=document.createElement('section');section.className='producer-studio';section.id='producer-studio';section.tabIndex=0;section.setAttribute('aria-label','Clip timeline and effects');
  section.innerHTML=`
    <header class="producer-heading"><div><p>03 / CLIP WORKSPACE</p><h3>Timeline & FX.</h3></div><span>LOCAL AUDIO · PULSE 3.2</span></header>
    <div class="producer-toolbar"><button data-act="add">Add working audio ↗</button><button data-act="import">Import clips ↗</button><input id="ps-files" type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aiff" hidden><button data-act="play">▶ Play timeline</button><button data-act="stop">Stop</button><button data-act="undo">Undo</button><button data-act="redo">Redo</button><button data-act="split">Split · C</button><button data-act="mute">Mute · M</button></div>
    <div class="producer-layout"><div class="producer-lanes"><label class="producer-seek">Playhead <input id="ps-seek" type="range" min="0" max="1" step="0.001" value="0"><output id="ps-time">0.000 s</output></label><div id="ps-timeline" aria-label="Audio clips"></div><p class="producer-hint">Select a clip to edit. Drag its right edge to stretch. Click its waveform to seek.</p></div>
    <div class="producer-inspector"><div class="producer-tabs" role="group" aria-label="Clip inspector"><button data-pane="clip" aria-pressed="true">Clip</button><button data-pane="fx" aria-pressed="false">FX</button><button data-pane="routing" aria-pressed="false">Sidechain</button><button data-pane="plugins" aria-pressed="false">Plug-ins</button><button data-pane="export" aria-pressed="false">Export</button></div>
    <div data-view="clip"><p id="ps-selected">Select or import a clip.</p><div class="producer-fields">
      <label>Volume · dB<input id="ps-gain" type="number" min="-60" max="12" step="0.5" value="0"></label><label>Pan · L −1 / R +1<input id="ps-pan" type="range" min="-1" max="1" step="0.01" value="0"><output id="ps-pan-label">0</output></label>
      <label>Start · seconds<input id="ps-start" type="number" min="0" max="180" step="0.01" value="0"></label><label>Duration · seconds<input id="ps-duration" type="number" min="0.08" max="180" step="0.01" value="1"></label>
      <label>Source BPM<input id="ps-source-bpm" type="number" min="20" max="400" value="120"></label><label>Project BPM<input id="ps-project-bpm" type="number" min="20" max="400" value="120"></label></div>
      <div class="producer-actions"><button data-act="stretch">Stretch to duration</button><button data-act="match">Match BPM</button><button data-act="solo">Solo</button><button data-act="remove">Remove clip</button></div></div>
    <div data-view="fx" hidden><label>Processor<select id="ps-fx"><option value="pitch">Pitch Correction · monophonic beta</option><option value="chorus">Chorus</option><option value="phaser">Phaser</option><option value="flanger">Flanger</option><option value="deesser">De-Esser</option><option value="transient">Transient Shaper</option></select></label>
      <div id="ps-pitch" class="producer-fields"><label>Key<select id="ps-key">${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'].map((x,i)=>`<option value="${i}">${x}</option>`).join('')}</select></label><label>Scale<select id="ps-scale"><option value="major">Major</option><option value="minor">Minor</option></select></label><label>Strength · %<input id="ps-strength" type="number" min="0" max="100" value="80"></label><label>Response<select id="ps-response"><option value="natural">Natural</option><option value="hard">Hard</option></select></label></div>
      <div id="ps-mod" class="producer-fields" hidden><label>LFO · Hz<input id="ps-rate" type="number" min="0.05" max="12" step="0.05" value="0.6"></label><label>Depth · %<input id="ps-depth" type="number" min="0" max="100" value="50"></label><label>Wet mix · %<input id="ps-wet" type="number" min="0" max="100" value="40"></label></div>
      <div id="ps-deess" class="producer-fields" hidden><label>Sibilance · Hz<input id="ps-frequency" type="number" min="2500" max="12000" step="100" value="5500"></label><label>Threshold · dB<input id="ps-deess-threshold" type="number" min="-55" max="-6" value="-25"></label><label>Reduction · %<input id="ps-amount" type="number" min="0" max="100" value="80"></label></div>
      <div id="ps-transient" class="producer-fields" hidden><label>Attack · %<input id="ps-attack" type="number" min="-100" max="100" value="20"></label><label>Sustain · %<input id="ps-sustain" type="number" min="-100" max="100" value="0"></label></div>
      <p class="producer-hint" id="ps-fx-note">Use a clean solo vocal or instrument, up to 45 seconds. Preview artifacts before applying.</p><div class="producer-actions"><button data-act="dry">A · Original clip</button><button data-act="fx-preview">B · Preview effect</button><button data-act="fx-apply">Apply to clip</button></div></div>
    <div data-view="routing" hidden><label><input type="checkbox" id="ps-sc-enabled"> Enable sidechain compressor</label><div class="producer-fields"><label>Detector clip<select id="ps-sc-source"></select></label><label>Target clip<select id="ps-sc-target"></select></label><label>Threshold · dB<input id="ps-sc-threshold" type="number" min="-60" max="0" value="-24"></label><label>Ratio<input id="ps-sc-ratio" type="number" min="1" max="20" step="0.5" value="4"></label><label>Attack · ms<input id="ps-sc-attack" type="number" min="0.1" max="200" step="0.1" value="5"></label><label>Release · ms<input id="ps-sc-release" type="number" min="10" max="2000" value="150"></label></div><p class="producer-hint">Detector is pre-mute and pre-pan. Mute the detector to use a silent trigger. Routing is included in timeline preview and export.</p><button data-act="play">Preview sidechain ↗</button></div>
    <div data-view="plugins" hidden><p class="producer-hint">Import a .pulsefx.json chain of Web Audio gain, filter, pan and delay nodes. Chains run in order on the timeline bus. Native VST/AU binaries are not supported.</p><button data-act="plugin-import">Import plugin JSON ↗</button><button data-act="plugin-example">Download example ↗</button><input id="ps-plugin-file" type="file" accept=".json,application/json" hidden><div id="ps-plugins"></div><button data-act="play">Preview chain ↗</button></div>
    <div data-view="export" hidden><div class="producer-fields"><label>Normalize<select id="ps-normalize"><option value="off">Off</option><option value="peak">Peak</option><option value="lufs">Integrated LUFS</option></select></label><label>Peak target · dBFS<input id="ps-peak" type="number" min="-40" max="0" step="0.1" value="-1"></label><label>LUFS target<input id="ps-lufs" type="number" min="-40" max="-5" step="0.5" value="-14"></label><label>True-peak ceiling · dBTP<input id="ps-ceiling" type="number" min="-12" max="0" step="0.1" value="-1"></label></div><p class="producer-hint">Gain-only normalization preserves dynamics. The true-peak ceiling can prevent reaching the requested LUFS. Measurements describe PCM before encoding.</p><div class="producer-actions"><button data-act="export">Export timeline · WAV 24</button><button data-act="apply">Send mix to workspace</button></div></div>
    </div></div><div class="producer-status"><p id="ps-status" role="status">Add working audio or import clips to begin. All edits are reversible during this session.</p><button data-act="cancel" hidden>Cancel processing</button></div>`;
  document.querySelector('.tool-board').after(section);
  const q=id=>section.querySelector('#ps-'+id),notice=message=>q('status').textContent=message;
  let clips=[],selected=null,nextId=1,revision=0,undo=[],redo=[],busy=false,abort=null,preview=null,audio=null,raf=0,playhead=0,pane='clip',plugins=[],candidate=null;
  const registry=new Map();
  const selectedClip=()=>clips.find(c=>c.id===selected);
  const duration=()=>Math.max(1,...clips.map(c=>c.start+c.duration));
  const snapshot=()=>({clips:clips.map(c=>({...c})),selected,plugins:plugins.map(p=>({...p}))});
  const changed=()=>{revision++;candidate=null;stop();};
  function save(){undo.push(snapshot());if(undo.length>12)undo.shift();redo=[];changed();}
  function restore(state){clips=state.clips;selected=state.selected;plugins=state.plugins;changed();draw();}
  function stop(){cancelAnimationFrame(raf);if(preview){try{preview.stop();preview.disconnect();}catch{}preview=null;}if(audio){void audio.close();audio=null;}}
  function showPane(name){pane=name;section.querySelectorAll('[data-view]').forEach(e=>e.hidden=e.dataset.view!==name);section.querySelectorAll('[data-pane]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.pane===name)));}
  function checkedNumber(id){const input=q(id);if(!Number.isFinite(Number(input.value))||Number(input.value)<Number(input.min)||Number(input.value)>Number(input.max)||input.value==='')throw Error('Enter a valid '+input.closest('label').childNodes[0].textContent.trim()+'.');return Number(input.value);}
  function newClip(buffer,name,start=0){if(buffer.duration>180||buffer.numberOfChannels>2)throw Error('Use mono/stereo clips no longer than 3 minutes.');return {id:'clip-'+nextId++,name,buffer,offset:0,start,duration:buffer.duration,gainDb:0,pan:0,mute:false,solo:false};}
  function add(buffer,name){if(!buffer)throw Error('Load audio in the main workspace first.');if(clips.length>=32)throw Error('Maximum 32 timeline clips.');const clip=newClip(buffer,name);save();clips.push(clip);selected=clip.id;draw();}
  function updateSelection(){const c=selectedClip();q('selected').textContent=c?c.name:'Select or import a clip.';if(c){q('gain').value=c.gainDb;q('pan').value=c.pan;q('pan-label').textContent=c.pan.toFixed(2);q('start').value=c.start.toFixed(3);q('duration').value=c.duration.toFixed(3);}section.querySelectorAll('[data-act="mute"]').forEach(b=>b.setAttribute('aria-pressed',String(!!c?.mute)));section.querySelector('[data-act="solo"]').setAttribute('aria-pressed',String(!!c?.solo));}
  function paintPlayhead(){q('seek').max=String(duration());q('seek').value=String(playhead);q('time').textContent=playhead.toFixed(3)+' s';q('timeline').style.setProperty('--playhead',Math.min(100,playhead/duration()*100)+'%');}
  function draw(){
    const host=q('timeline');host.replaceChildren();
    if(!clips.length){const p=document.createElement('p');p.className='producer-empty';p.textContent='Your clips will appear here.';host.append(p);}
    for(const clip of clips){
      const lane=document.createElement('div');lane.className='producer-lane';
      const button=document.createElement('button');button.className='producer-clip'+(selected===clip.id?' is-selected':'')+(clip.mute?' is-muted':'');button.style.marginLeft=clip.start/duration()*100+'%';button.style.width=Math.max(.5,clip.duration/duration()*100)+'%';button.setAttribute('aria-label',clip.name+' · '+clip.duration.toFixed(2)+' seconds'+(clip.mute?' · muted':''));button.setAttribute('aria-pressed',String(selected===clip.id));
      const title=document.createElement('span');title.className='producer-clip-title';title.textContent=clip.name+(clip.solo?' · SOLO':'')+(clip.mute?' · MUTED':'');button.append(title);
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=48;canvas.setAttribute('aria-hidden','true');button.append(canvas);
      const ctx=canvas.getContext('2d'),samples=clip.buffer.getChannelData(0),from=Math.round(clip.offset*clip.buffer.sampleRate),size=Math.round(clip.duration*clip.buffer.sampleRate);ctx.strokeStyle='#ffffff';ctx.beginPath();
      for(let x=0;x<800;x++){let peak=0;const a=from+Math.floor(x*size/800),b=Math.min(samples.length,from+Math.floor((x+1)*size/800));for(let j=a;j<b;j+=Math.max(1,Math.floor((b-a)/20)))peak=Math.max(peak,Math.abs(samples[j]));ctx.moveTo(x,24-peak*23);ctx.lineTo(x,24+peak*23);}ctx.stroke();
      button.onclick=event=>{stop();selected=clip.id;const rect=button.getBoundingClientRect();if(event.detail)playhead=clip.start+Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*clip.duration;updateSelection();host.querySelectorAll('.producer-clip').forEach(b=>{b.classList.toggle('is-selected',b===button);b.setAttribute('aria-pressed',String(b===button));});paintPlayhead();};
      button.ondblclick=()=>{showPane('clip');q('gain').focus();};
      const handle=document.createElement('span');handle.className='producer-stretch-handle';handle.title='Drag to stretch clip without changing pitch';handle.textContent='↔';button.append(handle);
      handle.onpointerdown=event=>{
        if(busy)return;event.preventDefault();event.stopPropagation();selected=clip.id;updateSelection();const x=event.clientX,width=lane.getBoundingClientRect().width,total=duration();let length=clip.duration;handle.setPointerCapture(event.pointerId);
        handle.onpointermove=e=>{length=Math.min(180-clip.start,clip.duration*4,Math.max(.08,clip.duration/4,clip.duration+(e.clientX-x)/width*total));q('duration').value=length.toFixed(3);button.style.width=length/total*100+'%';};
        handle.onpointerup=e=>{e.stopPropagation();handle.onpointermove=null;handle.onpointerup=null;void act('stretch');};handle.onpointercancel=()=>{handle.onpointermove=null;draw();};
      };
      lane.append(button);host.append(lane);
    }
    for(const key of ['sc-source','sc-target']){const select=q(key),old=select.value;select.replaceChildren();clips.forEach(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.name;select.append(option);});if(clips.some(c=>c.id===old))select.value=old;else if(key==='sc-target'&&clips.length>1)select.selectedIndex=1;}
    const list=q('plugins');list.replaceChildren();plugins.forEach((p,i)=>{const row=document.createElement('div');row.className='producer-plugin-row';const text=document.createElement('span');text.textContent=(i+1)+'. '+p.name;row.append(text);for(const [label,action] of [['↑',()=>{if(i){save();[plugins[i-1],plugins[i]]=[plugins[i],plugins[i-1]];draw();}}],['Remove',()=>{save();plugins.splice(i,1);draw();}]]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label',label+' '+p.name);b.onclick=()=>{if(!busy)action();};row.append(b);}list.append(row);});
    section.querySelector('[data-act="undo"]').disabled=!undo.length;section.querySelector('[data-act="redo"]').disabled=!redo.length;updateSelection();paintPlayhead();
  }
  const pcm=b=>Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i).slice());
  function bufferFrom(channels,rate){return new AudioBuffer({length:channels[0].length,numberOfChannels:channels.length,sampleRate:rate});}
  function asBuffer(channels,rate){const b=bufferFrom(channels,rate);channels.forEach((c,i)=>b.copyToChannel(c,i));return b;}
  async function play(buffer,from=0,timeline=false){stop();const Context=window.AudioContext||window.webkitAudioContext;audio=new Context();await audio.resume();preview=audio.createBufferSource();preview.buffer=buffer;preview.connect(audio.destination);const at=Math.min(Math.max(0,from),Math.max(0,buffer.duration-.01)),start=audio.currentTime;preview.start(0,at);preview.onended=()=>{stop();if(timeline){playhead=0;paintPlayhead();}};if(timeline){const tick=()=>{if(!audio)return;playhead=Math.min(buffer.duration,at+audio.currentTime-start);paintPlayhead();raf=requestAnimationFrame(tick);};tick();}}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function fxOptions(){
    const kind=q('fx').value;
    if(kind==='pitch')return {key:Number(q('key').value),scale:q('scale').value,strength:checkedNumber('strength')/100,hard:q('response').value==='hard'};
    if(kind==='transient')return {attack:checkedNumber('attack'),sustain:checkedNumber('sustain')};
    if(kind==='deesser')return {frequency:checkedNumber('frequency'),threshold:checkedNumber('deess-threshold'),amount:checkedNumber('amount')/100};
    return {rate:checkedNumber('rate'),depth:checkedNumber('depth')/100,mix:checkedNumber('wet')/100};
  }
  async function effect(clip){
    const kind=q('fx').value,options=fxOptions(),key=JSON.stringify([revision,clip.id,kind,options]);
    if(candidate?.key===key)return candidate.buffer;
    const data=clipSamples(clip),rate=clip.buffer.sampleRate;
    let buffer;
    if(['chorus','phaser','flanger'].includes(kind))buffer=await renderModulation(asBuffer(data,rate),kind,options);
    else buffer=asBuffer((await runProducerWorker(kind,data,rate,options,abort.signal)).channels,rate);
    candidate={key,buffer};return buffer;
  }
  async function render(){
    const sidechain={enabled:q('sc-enabled').checked,source:q('sc-source').value,target:q('sc-target').value,threshold:checkedNumber('sc-threshold'),ratio:checkedNumber('sc-ratio'),attack:checkedNumber('sc-attack'),release:checkedNumber('sc-release')};
    const buffer=await renderClips(clips,{rate:clips[0]?.buffer.sampleRate||44100,sidechain,plugins:plugins.filter(p=>!p.factory),factories:plugins.filter(p=>p.factory).map(p=>registry.get(p.factory))});
    const options={mode:q('normalize').value,targetPeak:checkedNumber('peak'),targetLufs:checkedNumber('lufs'),ceiling:checkedNumber('ceiling')};
    const result=await runProducerWorker('normalize',pcm(buffer),buffer.sampleRate,options,abort.signal);
    return {buffer:asBuffer(result.channels,buffer.sampleRate),stats:result.stats};
  }
  async function act(action){
    if(action==='cancel'){abort?.abort();revision++;return;}
    if(action==='stop'){stop();return;}
    if(busy)return;
    try{
      const clip=selectedClip();
      if(action==='import'){q('files').click();return;}
      if(action==='plugin-import'){q('plugin-file').click();return;}
      if(action==='plugin-example'){download(new Blob([JSON.stringify({version:1,name:'Warm low pass',nodes:[{type:'filter',mode:'lowpass',frequency:8000,Q:.707},{type:'gain',gainDb:-1}]},null,2)],{type:'application/json'}),'warm-low-pass.pulsefx.json');return;}
      if(action==='add'){const state=project.snapshot();add(state.working,state.file?.name||'Working audio');if(state.bpm){q('source-bpm').value=state.bpm;q('project-bpm').value=state.bpm;}return;}
      if(action==='undo'){if(undo.length){redo.push(snapshot());restore(undo.pop());}return;}
      if(action==='redo'){if(redo.length){undo.push(snapshot());restore(redo.pop());}return;}
      if(['split','mute','solo','remove','stretch','match','dry','fx-preview','fx-apply'].includes(action)&&!clip)throw Error('Select a timeline clip first.');
      if(action==='split'){if(clips.length>=32)throw Error('Maximum 32 timeline clips.');const parts=splitClip(clip,playhead,'clip-'+nextId++);save();clips.splice(clips.indexOf(clip),1,...parts);selected=parts[1].id;draw();return;}
      if(action==='mute'||action==='solo'){save();clip[action]=!clip[action];draw();return;}
      if(action==='remove'){save();clips=clips.filter(c=>c!==clip);selected=clips[0]?.id;draw();return;}
      if(action==='dry'){await play(asBuffer(clipSamples(clip),clip.buffer.sampleRate));return;}
      busy=true;stop();abort=new AbortController();const token=revision;q('status').textContent='Processing audio…';section.setAttribute('aria-busy','true');section.querySelector('[data-act="cancel"]').hidden=false;
      const controls=[...section.querySelectorAll('input,select,button')].filter(c=>!['cancel','stop'].includes(c.dataset.act));controls.forEach(c=>c.disabled=true);
      try{
        if(action==='stretch'||action==='match'){
          const originalBpm=checkedNumber('source-bpm'),targetBpm=checkedNumber('project-bpm');
          const seconds=action==='match'?clip.duration*originalBpm/targetBpm:checkedNumber('duration');
          if(seconds+clip.start>180)throw Error('Timeline supports up to 3 minutes.');
          const out=await runProducerWorker('stretch',clipSamples(clip),clip.buffer.sampleRate,{originalBpm:100,targetBpm:100*clip.duration/seconds},abort.signal);
          if(token!==revision||abort.signal.aborted)return;save();clip.buffer=asBuffer(out.channels,clip.buffer.sampleRate);clip.offset=0;clip.duration=clip.buffer.duration;draw();if(action==='match'){q('source-bpm').value=targetBpm;project.setTempo(targetBpm,{origin:'timeline',confirmed:true});}notice('Clip stretched · '+clip.duration.toFixed(3)+' s · pitch preserved.');
        }else if(action==='fx-preview'||action==='fx-apply'){
          const buffer=await effect(clip);if(token!==revision||abort.signal.aborted)return;
          if(action==='fx-preview'){await play(buffer);notice('Playing processed clip · compare with A before applying.');}
          else{save();clip.buffer=buffer;clip.offset=0;clip.duration=buffer.duration;draw();notice('Effect applied to selected clip. Undo restores the original.');}
        }else{
          const result=await render();if(token!==revision||abort.signal.aborted)return;
          if(action==='play')await play(result.buffer,playhead,true);
          if(action==='export'&&result.stats.peakDb>0)throw Error('Mix exceeds 0 dBFS. Enable peak or LUFS normalization before exporting.');
          if(action==='export')download(encodeWav(pcm(result.buffer),result.buffer.sampleRate,24),'pulse-timeline.wav');
          if(action==='apply'){if(project.snapshot().working)project.workspace.apply(result.buffer);else project.load(result.buffer,{name:'Timeline mix.wav'},'timeline');window.dispatchEvent(new Event('pulse:advanced-applied'));}
          const s=result.stats;notice(`${action==='export'?'Exported':'Ready'} · ${result.buffer.duration.toFixed(3)} s · Peak ${s.peakDb.toFixed(1)} dBFS · True peak ${s.truePeakDb.toFixed(1)} dBTP${s.lufs!==null?' · '+s.lufs.toFixed(1)+' LUFS':''}${s.constrained?' · Gain capped by true-peak ceiling.':''}${s.peakDb>0?' · Above 0 dBFS: enable normalization before integer export.':''}`);
        }
      }finally{controls.forEach(c=>c.disabled=false);busy=false;section.removeAttribute('aria-busy');section.querySelector('[data-act="cancel"]').hidden=true;section.querySelector('[data-act="undo"]').disabled=!undo.length;section.querySelector('[data-act="redo"]').disabled=!redo.length;}
    }catch(error){notice(error.message||'Audio processing failed.');}
  }
  section.addEventListener('click',event=>{const a=event.target.closest('[data-act]');if(a)void act(a.dataset.act);const tab=event.target.closest('[data-pane]');if(tab)showPane(tab.dataset.pane);});
  for(const [id,key] of [['gain','gainDb'],['pan','pan'],['start','start']])q(id).addEventListener('change',()=>{try{if(busy)return;const c=selectedClip();if(!c)return;const value=checkedNumber(id);if(key==='start'&&value+c.duration>180)throw Error('Clip extends beyond the 3 minute timeline.');save();c[key]=value;draw();}catch(e){notice(e.message);updateSelection();}});
  q('pan').addEventListener('input',()=>q('pan-label').textContent=Number(q('pan').value).toFixed(2));
  q('seek').oninput=()=>{stop();playhead=Number(q('seek').value);paintPlayhead();};
  q('fx').onchange=()=>{const kind=q('fx').value;q('pitch').hidden=kind!=='pitch';q('mod').hidden=!['chorus','phaser','flanger'].includes(kind);q('deess').hidden=kind!=='deesser';q('transient').hidden=kind!=='transient';q('fx-note').textContent=kind==='pitch'?'Use a clean solo vocal or instrument, up to 45 seconds. Preview artifacts before applying.':'Preview the selected clip, then apply the effect. Timeline export includes applied effects.';candidate=null;};
  q('files').onchange=async()=>{
    if(busy)return;const files=[...q('files').files];q('files').value='';if(!files.length)return;
    busy=true;const token=revision,Context=window.AudioContext||window.webkitAudioContext,context=new Context();
    try{if(clips.length+files.length>32)throw Error('Maximum 32 timeline clips.');if(files.reduce((sum,f)=>sum+f.size,0)>100*1024*1024)throw Error('Import up to 100 MB at a time.');notice('Decoding clips…');const imported=[];for(const file of files)imported.push(newClip(await context.decodeAudioData(await file.arrayBuffer()),file.name));if(token!==revision)return;save();clips.push(...imported);selected=imported[0].id;draw();notice(imported.length+' clips imported at 0:00. Adjust Start to arrange them.');}catch(e){notice(e.message);}finally{busy=false;await context.close();}
  };
  q('plugin-file').onchange=async()=>{try{const file=q('plugin-file').files[0];q('plugin-file').value='';if(!file||busy)return;if(file.size>65536)throw Error('Plugin JSON must be under 64 KB.');const manifest=validatePlugin(JSON.parse(await file.text()));if(plugins.length>=8)throw Error('Maximum 8 plugins in the chain.');save();plugins.push(manifest);draw();notice(manifest.name+' added to the timeline bus.');}catch(e){notice(e.message);}};
  window.PulseFX=Object.freeze({register(id,factory){if(!/^[a-z][a-z0-9-]{1,40}$/.test(id)||typeof factory!=='function'||registry.has(id))throw Error('Invalid or duplicate plugin ID.');registry.set(id,factory);},list:()=>[...registry.keys()],add(id){if(busy||!registry.has(id)||plugins.length>=8)throw Error('Plugin cannot be added.');save();plugins.push({name:id,factory:id});draw();}});
  window.addEventListener('pulse:stems-ready',event=>{if(busy){notice('Stem separation finished. Finish current processing, then send stems to timeline.');return;}try{const incoming=event.detail.map(stem=>newClip(asBuffer(stem.channels,stem.rate),stem.name));if(clips.length+incoming.length>32)throw Error('Timeline is full. Remove clips before adding stems.');save();clips.push(...incoming);selected=incoming[0].id;draw();notice('Four separated stems added to timeline.');}catch(e){notice(e.message);}});
  project.subscribe(({type,state})=>{if(type==='tempo'){q('project-bpm').value=state.bpm;if(!clips.length)q('source-bpm').value=state.bpm;}});
  section.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable]')||event.altKey||event.repeat)return;
    let action;if(event.ctrlKey||event.metaKey){if(event.key.toLowerCase()==='z')action=event.shiftKey?'redo':'undo';}else action={c:'split',m:'mute',' ':'play',Escape:'stop'}[event.key];
    if(action){event.preventDefault();event.stopPropagation();void act(action);}
  });
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-producer]');if(!trigger)return;const name=trigger.dataset.producer;showPane(['sidechain','volume-pan','stretch'].includes(name)?name==='sidechain'?'routing':'clip':name==='plugins'?'plugins':'fx');if(['autotune','modulation','dynamics'].includes(name)){q('fx').value={autotune:'pitch',modulation:'chorus',dynamics:'deesser'}[name];q('fx').dispatchEvent(new Event('change'));}if(!clips.length&&project.snapshot().working)add(project.snapshot().working,project.snapshot().file?.name||'Working audio');section.scrollIntoView({behavior:'smooth',block:'start'});section.focus({preventScroll:true});});
  window.addEventListener('pagehide',()=>{abort?.abort();stop();});draw();
}
