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
export class VisualizerEngine{
 constructor(sourceNode,canvas,mode='audiogram'){
  if(!canvas||typeof canvas.getContext!=='function')throw Error('Canvas element required.');
  this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('Canvas 2D unavailable.');
  this.presetName='pulse';this.running=false;this.frame=0;this.source=null;this.analyser=null;this.setMode(mode);this.attachSource(sourceNode||null);
 }
 setMode(mode){if(!['audiogram','waveform','spectrum'].includes(mode))throw Error('Unsupported visualizer mode.');this.mode=mode;return this;}
 setPreset(name){if(!Object.hasOwn(VISUAL_PRESETS,name))throw Error('Unknown visual preset.');this.presetName=name;return this;}
 applyPreset(name){return this.setPreset(name);}
 attachSource(node){
  if(this.source&&this.analyser){try{this.source.disconnect(this.analyser)}catch{}}
  this.source=null;this.analyser=null;
  if(node){if(!node.context||typeof node.connect!=='function')throw Error('AudioNode required.');this.source=node;this.analyser=node.context.createAnalyser();this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=.78;node.connect(this.analyser);}
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
  const samples=new Uint8Array(this.analyser?.frequencyBinCount||1024);
  if(this.analyser){if(this.mode==='waveform')this.analyser.getByteTimeDomainData(samples);else this.analyser.getByteFrequencyData(samples);}
  else if(this.mode==='waveform')samples.fill(128);
  ctx.strokeStyle=p.accent;ctx.fillStyle=p.accent;ctx.lineWidth=p.weight*scale;ctx.lineCap='round';
  if(this.mode==='audiogram'){
   const cx=w/2,cy=h/2,r=Math.min(w,h)*.26,outer=Math.min(w,h)*.43;
   ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
   for(let i=0;i<96;i++){const a=i/96*Math.PI*2-Math.PI/2,amp=samples[Math.floor(i/96*samples.length)]/255,delta=amp*(outer-r);ctx.beginPath();ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a));ctx.lineTo(cx+(r+delta)*Math.cos(a),cy+(r+delta)*Math.sin(a));ctx.stroke();}
   ctx.fillStyle=p.secondary;ctx.font=String(12*scale)+'px Arial, sans-serif';ctx.textAlign='center';ctx.fillText('PULSE / LIVE',cx,cy+4*scale);
  }else if(this.mode==='waveform'){
   ctx.beginPath();for(let i=0;i<samples.length;i++){const x=i/(samples.length-1)*w,y=samples[i]/255*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();
  }else{
   for(let i=0;i<72;i++){const index=Math.floor((i/72)**1.6*(samples.length-1)),bar=Math.max(2*scale,samples[index]/255*h*.8);ctx.fillRect(i*w/72,h-bar,w/72*.76,bar);}
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
}
