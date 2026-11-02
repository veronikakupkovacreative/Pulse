// PULSE Studio: deterministic DSP enhancer + real-time Web Audio visualization.
// AI is a marketing label here, not a neural-network inference claim.
import {fromChannels} from './dsp.mjs';

export const ENHANCER_PRESETS=Object.freeze({
 studio_sound:{label:'STUDIO SOUND',sub:'Balanced tonal polish',hp:48,bass:1.2,bassHz:125,mid:1.5,midHz:3200,air:1.2,airHz:9000,threshold:-20,ratio:2.3,attack:.012,release:.19,output:-.7},
 podcast:{label:'PODCAST',sub:'Speech-forward & controlled',hp:82,bass:-1.7,bassHz:180,mid:3.2,midHz:2800,air:-.8,airHz:9500,threshold:-25,ratio:3.2,attack:.008,release:.15,output:-1.2},
 vocal_focus:{label:'VOCAL FOCUS',sub:'Presence and air',hp:90,bass:-1,bassHz:185,mid:3.1,midHz:4000,air:2.4,airHz:10500,threshold:-22,ratio:2.5,attack:.009,release:.14,output:-1.5},
 warm_tape:{label:'WARM TAPE',sub:'Rounded and mellow',hp:38,bass:2,bassHz:135,mid:-1,midHz:3400,air:-2,airHz:8500,threshold:-18,ratio:1.9,attack:.025,release:.22,output:-1},
 bright_clarity:{label:'BRIGHT CLARITY',sub:'Clean upper frequencies',hp:65,bass:-.5,bassHz:155,mid:2.2,midHz:3200,air:3.4,airHz:10000,threshold:-18,ratio:2,attack:.012,release:.16,output:-1.7}
});
export const VISUAL_PRESETS=Object.freeze({
 pulse:{label:'PULSE RED',accent:'#ff2b20',secondary:'#fff',background:'#111',weight:3},
 mono:{label:'MONO',accent:'#f5f4f0',secondary:'#aaa',background:'#101010',weight:2},
 minimal:{label:'MINIMAL',accent:'#ff2b20',secondary:'#888',background:'#111',weight:1.5},
 club:{label:'CLUB',accent:'#ff2b20',secondary:'#ffe2d8',background:'#080808',weight:4}
});
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export class AIAudioEnhancer{
 constructor(preset='studio_sound'){this.presetName='studio_sound';this.mix=100;this.applyPreset(preset);}
 applyPreset(name){if(!Object.hasOwn(ENHANCER_PRESETS,name))throw Error('Unknown enhancer preset: '+name);this.presetName=name;return this;}
 setMix(value){const n=Number(value);if(!Number.isFinite(n)||n<0||n>100)throw Error('Wet mix must be 0–100%.');this.mix=n;return this;}
 get settings(){return {...ENHANCER_PRESETS[this.presetName],mix:this.mix};}
 createLiveChain(context){
  if(!context?.createBiquadFilter)throw Error('Web Audio context required.');
  const p=this.settings,input=context.createGain(),output=context.createGain(),nodes=[input,output];
  const filter=(type,freq,gain=0)=>{const n=context.createBiquadFilter();n.type=type;n.frequency.value=freq;n.gain.value=gain;nodes.push(n);return n;};
  const hp=filter('highpass',p.hp),low=filter('lowshelf',p.bassHz,p.bass),mid=filter('peaking',p.midHz,p.mid),air=filter('highshelf',p.airHz,p.air);
  mid.Q.value=.9;hp.Q.value=.707;
  const comp=context.createDynamicsCompressor();comp.threshold.value=p.threshold;comp.knee.value=12;comp.ratio.value=p.ratio;comp.attack.value=p.attack;comp.release.value=p.release;
  const wet=context.createGain(),dry=context.createGain(),gain=context.createGain();
  nodes.push(comp,wet,dry,gain);wet.gain.value=this.mix/100;dry.gain.value=1-wet.gain.value;gain.gain.value=10**(p.output/20);
  input.connect(hp);hp.connect(low);low.connect(mid);mid.connect(air);air.connect(comp);comp.connect(wet);wet.connect(gain);gain.connect(output);
  input.connect(dry);dry.connect(output);
  return {input,output,settings:p,dispose(){nodes.forEach(n=>{try{n.disconnect()}catch{}})}};
 }
 async processBuffer(buffer){
  if(!buffer||!buffer.length||!buffer.numberOfChannels)throw Error('Upload audio before enhancing.');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('Offline Web Audio is not supported.');
  const ctx=new Offline(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  const src=ctx.createBufferSource(),original=ctx.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  for(let c=0;c<buffer.numberOfChannels;c++)original.copyToChannel(buffer.getChannelData(c),c);
  src.buffer=original;
  const chain=this.createLiveChain(ctx);src.connect(chain.input);chain.output.connect(ctx.destination);src.start(0);
  const rendered=await ctx.startRendering();chain.dispose();
  let peak=0;
  for(let c=0;c<rendered.numberOfChannels;c++){const data=rendered.getChannelData(c);for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));}
  if(peak<=.98)return rendered;
  const factor=.98/peak;
  return fromChannels(Array.from({length:rendered.numberOfChannels},(_,c)=>Float32Array.from(rendered.getChannelData(c),x=>x*factor)),rendered.sampleRate);
 }
 process(buffer){return this.processBuffer(buffer);}
}
// Accepted original 2026-11-02 style names; keep spectrum and circular audiogram from current PULSE.
export const VISUAL_MODES=Object.freeze({
 bars:'BARS',sound_wave_maker:'SOUND WAVE MAKER',
 waveform:'WAVEFORM',audio_waveform_generator:'AUDIO WAVEFORM GENERATOR',
 audiogram:'CIRCULAR AUDIOGRAM',podcast:'PODCAST AUDIOGRAM',spectrum:'SPECTRUM'
});
export class VisualizerEngine{
 constructor(sourceNode,canvas,mode='audiogram'){
  if(!canvas||typeof canvas.getContext!=='function')throw Error('Canvas element required.');
  this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('Canvas 2D unavailable.');
  this.presetName='pulse';this.running=false;this.frame=0;this.source=null;this.analyser=null;
  this.barCount=48;this.fftSize=2048;this.smoothing=.78;this.sensitivity=1;this.lineWidth=2.5;
  this.setMode(mode);this.attachSource(sourceNode||null);
 }
 setMode(mode){if(!Object.hasOwn(VISUAL_MODES,mode))throw Error('Unsupported visualizer mode: '+mode);this.mode=mode;return this;}
 setStyle(style){return this.setMode(style);}
 setPreset(name){if(!Object.hasOwn(VISUAL_PRESETS,name))throw Error('Unknown visual preset.');this.presetName=name;return this;}
 applyPreset(name){return this.setPreset(name);}
 setOptions(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid visualizer options.');
  const limits={barCount:[8,128],fftSize:[256,8192],smoothing:[0,.99],sensitivity:[.25,3],lineWidth:[1,6]};
  for(const [key,value] of Object.entries(options)){
   if(!Object.hasOwn(limits,key))throw Error('Unknown visualizer option: '+key);
   const number=Number(value),[min,max]=limits[key];
   if(!Number.isFinite(number)||number<min||number>max)throw Error('Invalid '+key);
   if(key==='fftSize'&&(!Number.isInteger(number)|| (number&(number-1))!==0))throw Error('FFT size must be a power of two.');
   if(key==='barCount'&&!Number.isInteger(number))throw Error('Bar count must be an integer.');
   this[key]=number;
  }
  if(this.analyser){this.analyser.fftSize=this.fftSize;this.analyser.smoothingTimeConstant=this.smoothing;}
  return this;
 }
 attachSource(node){
  if(this.source&&this.analyser){try{this.source.disconnect(this.analyser)}catch{}}
  if(this.analyser){try{this.analyser.disconnect()}catch{}}
  this.source=null;this.analyser=null;
  if(node){if(!node.context||typeof node.connect!=='function')throw Error('AudioNode required.');this.source=node;this.analyser=node.context.createAnalyser();this.analyser.fftSize=this.fftSize;this.analyser.smoothingTimeConstant=this.smoothing;node.connect(this.analyser);}
  return this;
 }
 draw(){
  if(!this.running)return;
  const p=VISUAL_PRESETS[this.presetName],canvas=this.canvas,ctx=this.ctx,scale=Math.min(2,globalThis.devicePixelRatio||1);
  const w=Math.max(1,Math.round((canvas.clientWidth||canvas.width||480)*scale)),h=Math.max(1,Math.round((canvas.clientHeight||canvas.height||280)*scale));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.fillStyle=p.background;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#ffffff18';ctx.lineWidth=scale;
  for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(0,h*i/5);ctx.lineTo(w,h*i/5);ctx.stroke();}
  const mode=this.mode,isWave=mode==='waveform'||mode==='audio_waveform_generator';
  const samples=new Uint8Array(this.analyser?.frequencyBinCount||this.fftSize/2);
  if(this.analyser){
   if(isWave){const times=new Uint8Array(this.analyser.fftSize);this.analyser.getByteTimeDomainData(times);this.samples=times;}
   else{this.analyser.getByteFrequencyData(samples);this.samples=samples;}
  }else{this.samples=isWave?new Uint8Array(this.fftSize).fill(128):samples;}
  const values=this.samples;
  ctx.strokeStyle=p.accent;ctx.fillStyle=p.accent;ctx.lineWidth=this.lineWidth*scale;ctx.lineCap='round';
  const level=index=>Math.min(1,(values[Math.max(0,Math.min(values.length-1,index))]||0)/255*this.sensitivity);
  if(mode==='audiogram'){
   const cx=w/2,cy=h/2,r=Math.min(w,h)*.26,outer=Math.min(w,h)*.44;
   ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
   const n=Math.max(48,this.barCount*2);
   for(let i=0;i<n;i++){const angle=i/n*Math.PI*2-Math.PI/2,length=level(Math.floor(i/n*values.length))*(outer-r);ctx.beginPath();ctx.moveTo(cx+r*Math.cos(angle),cy+r*Math.sin(angle));ctx.lineTo(cx+(r+length)*Math.cos(angle),cy+(r+length)*Math.sin(angle));ctx.stroke();}
   ctx.fillStyle=p.secondary;ctx.font=String(12*scale)+'px Arial, sans-serif';ctx.textAlign='center';ctx.fillText('PULSE / LIVE',cx,cy+4*scale);
  }else if(isWave){
   ctx.beginPath();ctx.lineWidth=(mode==='audio_waveform_generator'?this.lineWidth*1.25:this.lineWidth)*scale;
   for(let i=0;i<values.length;i++){const x=i/(values.length-1)*w,y=h*.5+(values[i]-128)/128*this.sensitivity*h*.42;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
   ctx.stroke();
  }else if(mode==='podcast'){
   const count=this.barCount,span=w/count;
   ctx.fillStyle=p.accent;
   for(let i=0;i<count;i++){const index=Math.floor(i/count*values.length),len=Math.max(3*scale,level(index)*h*.76);ctx.fillRect(i*span+span*.2,(h-len)/2,span*.58,len);}
  }else if(mode==='spectrum'){
   const count=this.barCount,span=w/count;
   for(let i=0;i<count;i++){const index=Math.floor((i/count)**1.6*(values.length-1)),len=Math.max(2*scale,level(index)*h*.8);ctx.fillRect(i*span,h-len,span*.74,len);}
  }else{
   // bars & sound_wave_maker: frequency bands with distinct geometry.
   const count=this.barCount,span=w/count;
   for(let i=0;i<count;i++){
    const index=Math.floor(i/count*(values.length-1)),len=Math.max(2*scale,level(index)*h*.86),padding=mode==='sound_wave_maker'?.27:.13;
    const x=i*span+span*padding,width=span*(1-padding*2);
    if(mode==='sound_wave_maker'){ctx.fillStyle=p.accent;ctx.fillRect(x,(h-len)/2,width,len);}
    else {ctx.fillStyle=p.accent;ctx.fillRect(x,h-len,width,len);}
   }
  }
  this.frame=globalThis.requestAnimationFrame(()=>this.draw());
 }
 start(){if(!this.running){this.running=true;this.draw()}return this;}
 stop(){this.running=false;if(this.frame)globalThis.cancelAnimationFrame(this.frame);this.frame=0;return this;}
 dispose(){this.stop();this.attachSource(null);}
}
export class ThePulseStudioEngine{
 createAIAudioEnhancer(preset='studio_sound'){return new AIAudioEnhancer(preset);}
 createVisualizerEngine(sourceNode,canvas,mode='audiogram'){return new VisualizerEngine(sourceNode,canvas,mode);}
 createVisualizer(sourceNode,canvas,style='bars'){return this.createVisualizerEngine(sourceNode,canvas,style);}
}
