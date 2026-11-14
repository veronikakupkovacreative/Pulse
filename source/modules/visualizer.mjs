import {workspace as w} from './workspace.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const status=(root,message,bad=false)=>{const area=root.querySelector('[data-ai-status]');if(area){area.textContent=message;area.dataset.error=String(bad)}};
const header=(label,title,description,tag='LOCAL / WEB AUDIO')=>'<div class="tool-view-header"><span>'+esc(label)+'</span><span>'+esc(tag)+'</span></div><h3>'+title+'</h3><p class="tool-description">'+esc(description)+'</p>';
const buttons=items=>items.map(([id,label,checked])=>'<button type="button" data-option="'+esc(id)+'" aria-pressed="'+(checked?'true':'false')+'">'+esc(label)+'</button>').join('');
const row=(key,label,min,max,value,step=1,suffix='')=>'<label class="pulse-ai-control">'+esc(label)+' <output data-value="'+key+'">'+value+suffix+'</output><input data-setting="'+key+'" type="range" min="'+min+'" max="'+max+'" value="'+value+'" step="'+step+'"></label>';
const download=(blob,fileName)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)};
const safeName=name=>(name||'pulse').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,56);

const VISUAL_MODES = Object.freeze({
  radial:'RADIAL FFT', spectrum:'SPECTRUM', mirror:'MIRROR BARS',
  oscilloscope:'OSCILLOSCOPE', vectorscope:'STEREO SCOPE', particles:'PARTICLES'
});
const VISUAL_PRESETS = Object.freeze({
  pulse:{accent:'#ff0000',background:'#0a0a0a',secondary:'#ffffff'},
  mono:{accent:'#ffffff',background:'#111111',secondary:'#aaaaaa'},
  contrast:{accent:'#ff0000',background:'#ffffff',secondary:'#191919'},
  night:{accent:'#ffffff',background:'#000000',secondary:'#ff0000'},
  studio:{accent:'#ff0000',background:'#191919',secondary:'#f5f4f0'},
  charcoal:{accent:'#f5f4f0',background:'#191919',secondary:'#ff0000'}
});
export function renderPulseFrame(canvas, options, data={}) {
  const g=canvas.getContext('2d');if(!g)return;
  const width=canvas.width,height=canvas.height;
  const {mode='radial',accent='#ff0000',background='#080808',secondary='#ffffff',sensitivity=1,
    bars=64,stroke=3,low=45,high=14000,time=0,sampleRate=44100,fftSize=2048}=options;
  const minAxis=Math.min(width,height);
  g.fillStyle=background;g.fillRect(0,0,width,height);
  g.save();g.lineWidth=Math.max(2,stroke*width/1080);g.lineCap='round';g.lineJoin='round';
  const freq=data.freq||new Uint8Array(fftSize/2);
  const wave=data.wave||new Uint8Array(fftSize).fill(128);
  const hzToIndex=hz=>clamp(Math.floor(hz*fftSize/sampleRate),0,freq.length-1);
  const amp=i=>{
    const ratio=i/Math.max(1,bars-1),f=low*(high/low)**ratio;
    return clamp((freq[hzToIndex(f)]||0)/255*sensitivity,0,1);
  };
  g.strokeStyle=secondary;g.globalAlpha=.17;g.beginPath();g.moveTo(width*.06,height*.5);g.lineTo(width*.94,height*.5);g.stroke();
  g.globalAlpha=1;g.strokeStyle=accent;g.fillStyle=accent;
  if(mode==='spectrum'||mode==='mirror'){
    const margin=width*.06,span=(width-margin*2)/bars;
    for(let i=0;i<bars;i++){
      const x=margin+span*i,level=amp(i),h=level*height*(mode==='mirror'?.37:.78),bar=Math.max(2,span*.64);
      if(mode==='mirror'){
        g.fillRect(x,height/2-h,bar,h);g.fillRect(x,height/2,bar,h);
      }else{g.fillRect(x,height*.88-h,bar,h)}
    }
  } else if(mode==='radial'){
    const cx=width/2,cy=height/2,r=minAxis*.24,outer=minAxis*.43;
    g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.stroke();
    const count=Math.max(48,bars*2);
    for(let i=0;i<count;i++){
      const t=i/count*Math.PI*2-Math.PI/2,level=amp(Math.floor(i/count*bars));
      const length=Math.max(1,level*(outer-r));
      g.beginPath();g.moveTo(cx+r*Math.cos(t),cy+r*Math.sin(t));
      g.lineTo(cx+(r+length)*Math.cos(t),cy+(r+length)*Math.sin(t));g.stroke();
    }
  } else if(mode==='oscilloscope'){
    g.beginPath();for(let i=0;i<wave.length;i++){
      const x=width*.06+(i/Math.max(1,wave.length-1))*width*.88;
      const y=height*.5+(wave[i]-128)/128*height*.39*sensitivity;
      i?g.lineTo(x,y):g.moveTo(x,y);
    }g.stroke();
  } else if(mode==='vectorscope'){
    const l=data.left||wave,r=data.right||l;
    const n=Math.min(l.length,r.length);g.globalAlpha=.55;
    g.beginPath();for(let i=0;i<n;i+=2){
      const a=(l[i]-128)/128,b=(r[i]-128)/128;
      // Mid/side coordinates: mono is vertical; wide stereo forms the horizontal axis.
      const x=width/2+(a-b)*width*.23*sensitivity;
      const y=height/2-(a+b)*height*.22*sensitivity;
      g.moveTo(x,y);g.lineTo(x+Math.max(1,width/400),y);
    }g.stroke();g.globalAlpha=1;
  } else if(mode==='particles'){
    for(let i=0;i<bars;i++){
      const strength=amp(i),angle=i*2.39996+time*.11;
      const radius=minAxis*(.1+strength*.37),x=width/2+Math.cos(angle)*radius,y=height/2+Math.sin(angle)*radius;
      const size=1.5+strength*width*.011;g.beginPath();g.arc(x,y,size,0,Math.PI*2);g.fill();
    }
  }
  g.globalAlpha=1;
  const font=Math.max(12,width*.016);
  g.fillStyle=secondary;g.font=`400 ${font}px Arial, sans-serif`;g.textAlign='left';
  g.fillText('PULSE STUDIO  /  SIGNAL',width*.045,height*.06);
  g.font=`400 ${Math.max(10,width*.011)}px Arial, sans-serif`;
  g.fillText(VISUAL_MODES[mode]||'AUDIO',width*.045,height*.95);
  g.textAlign='right';g.fillText('LIVE AUDIO / 2026',width*.95,height*.95);
  g.restore();
}
class AdvancedVisualizer {
  constructor(canvas,host) {
    this.canvas=canvas;this.host=host;this.state={mode:'radial',bars:64,sensitivity:1.1,smoothing:.78,
      stroke:3,low:45,high:14000,fftSize:2048,...VISUAL_PRESETS.pulse};
    this.graph=null;this.recording=null;this.running=false;this.frame=0;this.frameIndex=0;
    this.sourceListener=e=>{if(!this.recording)this.attach(e.detail?.source||null)};
    document.addEventListener('pulse:audio-source',this.sourceListener);
    this.attach(w.source);this.draw=this.draw.bind(this);this.start();
  }
  attach(node) {
    if(this.graph){const {node:prev,analyser,splitter,left,right}=this.graph;
      try{prev.disconnect(analyser)}catch{}
      try{prev.disconnect(splitter)}catch{}
      for(const part of [analyser,splitter,left,right]){try{part.disconnect()}catch{}}
      this.graph=null;
    }
    if(!node)return;
    const ctx=node.context,analyser=ctx.createAnalyser(),splitter=ctx.createChannelSplitter(2),left=ctx.createAnalyser(),right=ctx.createAnalyser();
    for(const part of [analyser,left,right]){part.fftSize=this.state.fftSize;part.smoothingTimeConstant=this.state.smoothing}
    node.connect(analyser);node.connect(splitter);splitter.connect(left,0);splitter.connect(right,1);
    this.graph={node,analyser,splitter,left,right};
  }
  set(key,value) {
    this.state[key]=value;
    if(this.graph&&['fftSize','smoothing'].includes(key)){
      for(const n of [this.graph.analyser,this.graph.left,this.graph.right]){
        n.fftSize=this.state.fftSize;n.smoothingTimeConstant=this.state.smoothing;
      }
    }
  }
  capture() {
    const analyzer=this.graph?.analyser,fftSize=this.state.fftSize;
    const freq=new Uint8Array(fftSize/2),wave=new Uint8Array(fftSize).fill(128);
    if(analyzer){analyzer.getByteFrequencyData(freq);analyzer.getByteTimeDomainData(wave)}
    const left=new Uint8Array(fftSize).fill(128),right=new Uint8Array(fftSize).fill(128);
    if(this.state.mode==='vectorscope'&&this.graph){
      this.graph.left.getByteTimeDomainData(left);
      if(w.buffer?.numberOfChannels===1)right.set(left);else this.graph.right.getByteTimeDomainData(right);
    }
    return{freq,wave,left,right};
  }
  draw(){
    if(!this.running)return;
    renderPulseFrame(this.canvas,{...this.state,time:this.frameIndex/30,sampleRate:w.buffer?.sampleRate||44100},this.capture());
    this.frameIndex++;this.frame=requestAnimationFrame(this.draw);
  }
  start(){if(this.running)return;this.running=true;this.draw()}
  async record(seconds) {
    if(this.recording)throw Error('A video export is already running.');
    const buffer=w.ensureAudio();
    if(typeof MediaRecorder==='undefined'||!this.canvas.captureStream)throw Error('Video recording is unavailable in this browser. PNG export remains available.');
    const start=clamp(w.selection?.start||0,0,buffer.duration);
    const duration=Math.min(seconds,120,buffer.duration-start);
    if(duration<.2)throw Error('Select or load an audio segment at least 0.2 seconds long.');
    w.stop();
    const ctx=await w.ensureContext();
    const node=ctx.createBufferSource();node.buffer=buffer;
    const destination=ctx.createMediaStreamDestination();node.connect(destination);
    this.attach(node);
    const video=this.canvas.captureStream(30);
    const stream=new MediaStream([...video.getVideoTracks(),...destination.stream.getAudioTracks()]);
    const types=['video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus'];
    const mime=types.find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){this.attach(null);stream.getTracks().forEach(t=>t.stop());throw Error('No supported browser video recording codec.');}
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3_000_000});
    this.recording={node,recorder,stream};
    const chunks=[];
    const promise=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onerror=e=>reject(e.error||new Error('Recording failed.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));
    });
    try{
      recorder.start(200);
      node.start(0,start,duration);
      node.onended=()=>{if(recorder.state!=='inactive')recorder.stop()};
      const blob=await promise;
      if(!blob.size)throw Error('Recording produced an empty video.');
      return{blob,extension:mime.startsWith('video/mp4')?'mp4':'webm',duration};
    }finally{
      try{node.stop()}catch{}
      try{node.disconnect()}catch{}
      if(recorder.state!=='inactive')recorder.stop();
      stream.getTracks().forEach(t=>t.stop());this.recording=null;this.attach(w.source);
    }
  }
  dispose(){
    this.running=false;cancelAnimationFrame(this.frame);
    document.removeEventListener('pulse:audio-source',this.sourceListener);
    if(this.recording){try{this.recording.node.stop()}catch{}
      try{this.recording.recorder.stop()}catch{}
      this.recording.stream.getTracks().forEach(t=>t.stop());this.recording=null;}
    this.attach(null);
  }
}
export function mountAdvancedVisualizer({host}) {

  host.innerHTML=`<section class="pulse-ai-master">
    ${header('05 / ADVANCED MUSIC VISUALIZER','See the<br><span>frequencies.</span>',
      'Real-time audio visualization with FFT, stereo scope, adjustable colors, presets and audio-reactive MP4/WebM recording. No video editing.','LOCAL / WEB AUDIO')}
    <p class="pulse-ai-subhead">VISUALIZATION MODE</p>
    <div class="pulse-ai-mode" role="group" aria-label="Visual mode">${buttons(Object.entries(VISUAL_MODES).map(([id,label],i)=>[id,label,i===0]))}</div>
    <label class="pulse-ai-control">VISUAL PRESET<select data-preset><option value="pulse">Pulse Red</option><option value="mono">Mono</option><option value="contrast">Red / White</option><option value="night">Night</option><option value="studio">Studio</option><option value="charcoal">Charcoal</option><option value="custom">Custom</option></select></label>
    <div class="pulse-ai-grid">
      <label class="pulse-ai-control">SIGNAL COLOR<input data-color="accent" type="color" value="#ff0000" /></label>
      <label class="pulse-ai-control">BACKGROUND<input data-color="background" type="color" value="#0a0a0a" /></label>
    </div>
    <div class="pulse-ai-grid">${row('bars','BAR DENSITY',12,128,64,1,'')}${row('sensitivity','SENSITIVITY',25,300,110,5,'%')}</div>
    <div class="pulse-ai-grid">${row('smoothing','SMOOTHING',0,98,78,1,'%')}${row('stroke','LINE WIDTH',1,10,3,.5,' px')}</div>
    <div class="pulse-ai-grid">${row('low','LOW FREQUENCY',20,1000,45,5,' Hz')}${row('high','HIGH FREQUENCY',2000,20000,14000,100,' Hz')}</div>
    <div class="pulse-ai-grid">
      <label class="pulse-ai-control">FFT RESOLUTION<select data-fft><option value="auto" selected>AUTO · 2048 FFT</option><option value="1024">1024</option><option value="2048">2048</option><option value="4096">4096</option><option value="8192">8192</option></select></label>
      <label class="pulse-ai-control">CANVAS FORMAT<select data-resolution><option value="1920x1080" selected>AUTO · 16:9 / 1920 × 1080</option><option value="1920x1080">16:9 / 1920 × 1080</option><option value="1080x1080">1:1 / 1080 × 1080</option><option value="1080x1920">9:16 / 1080 × 1920</option></select></label>
    </div>
    <label class="pulse-ai-control">MAX VIDEO EXPORT DURATION (SECONDS)<input data-seconds type="number" min="1" max="120" step="1" value="15" /></label>
    <p class="pulse-ai-out" data-ai-status role="status" aria-live="polite">Upload audio, press PLAY in SOURCE AUDIO, or start a preview using the visualizer controls. Export uses a browser-supported MP4 or WebM codec.</p>
  </section>`;
  const root=host.querySelector('.pulse-ai-master');
  const stage=document.createElement('section');stage.className='pulse-ai-visual-stage';
  stage.setAttribute('aria-label','Advanced audio visualization');
  stage.innerHTML='<div class="pulse-ai-stage-top"><span><i></i> ADVANCED SIGNAL VIEW</span><span>PULSE / LOCAL</span></div><canvas width="1920" height="1080" aria-label="Audio responsive visualizer"></canvas><div class="pulse-ai-stage-actions"><button type="button" data-stage="play">PLAY / PAUSE</button><button type="button" data-stage="png">EXPORT PNG</button><button type="button" data-stage="video">EXPORT VIDEO + AUDIO</button></div><p>Video capture runs in real time; max 120 seconds. The audio track is included in the recording.</p>';
  host.append(stage);
  const canvas=stage.querySelector('canvas');
  const visual=new AdvancedVisualizer(canvas,host);
  let alive=true;
  const setState=(key,val)=>visual.set(key,val);
  root.querySelectorAll('[data-option]').forEach(button=>button.onclick=()=>{
    setState('mode',button.dataset.option);
    root.querySelectorAll('[data-option]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  });
  root.querySelector('[data-preset]').onchange=e=>{
    const p=VISUAL_PRESETS[e.target.value];if(!p)return;
    Object.entries(p).forEach(([key,v])=>setState(key,v));
    root.querySelector('[data-color="accent"]').value=p.accent;
    root.querySelector('[data-color="background"]').value=p.background;
  };
  root.querySelectorAll('[data-color]').forEach(el=>el.oninput=()=>{
    setState(el.dataset.color,el.value);root.querySelector('[data-preset]').value='custom';
  });
  root.querySelectorAll('[data-setting]').forEach(el=>el.oninput=()=>{
    const key=el.dataset.setting,value=Number(el.value),scaled=['sensitivity','smoothing'].includes(key)?value/100:value;
    setState(key,scaled);
    root.querySelector(`[data-value="${key}"]`).textContent=value+(['sensitivity','smoothing'].includes(key)?'%':key==='stroke'?' px':['low','high'].includes(key)?' Hz':'');
  });
  root.querySelector('[data-fft]').onchange=e=>setState('fftSize',e.target.value==='auto'?2048:Number(e.target.value));
  root.querySelector('[data-resolution]').onchange=e=>{
    const [width,height]=e.target.value.split('x').map(Number);canvas.width=width;canvas.height=height;
    canvas.style.aspectRatio=`${width} / ${height}`;
  };
  const playback=async()=>{try{await w.togglePlay()}catch(e){status(root,e.message,true)}};
  const png=async()=>{
    try{
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('Canvas image export failed.')),'image/png'));
      download(blob,`${safeName(w.name)}-pulse-visual.png`);status(root,'PNG visualization exported.');
    }catch(e){status(root,e.message,true)}
  };
  const video=async()=>{
    const btn=stage.querySelector('[data-stage="video"]');btn.disabled=true;
    status(root,'Recording video and original audio in real time…');
    try{
      const seconds=clamp(Number(root.querySelector('[data-seconds]').value)||15,1,120);
      const rendered=await visual.record(seconds);
      if(!alive)return;
      download(rendered.blob,`${safeName(w.name)}-pulse-visual.${rendered.extension}`);
      status(root,`Exported ${rendered.duration.toFixed(1)} seconds with audio as ${rendered.extension.toUpperCase()}.`);
    }catch(e){if(alive)status(root,e.message,true)}
    finally{if(alive)btn.disabled=false}
  };
  stage.querySelector('[data-stage="play"]').onclick=playback;
  stage.querySelector('[data-stage="png"]').onclick=png;
  stage.querySelector('[data-stage="video"]').onclick=video;
  return()=>{alive=false;visual.dispose();stage.remove()};
}
