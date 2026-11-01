// The Pulse Studio unified API. Browser-only adapters over verified local DSP.
// This class is a service layer, not a replacement for the editor's workspace.
export class ThePulseStudioEngine {
  constructor(context=null){
    this.audioContext=context;
    this.converter=null;
  }
  context(){
    if(!this.audioContext){
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Audio)throw Error('Web Audio API is unavailable.');
      this.audioContext=new Audio();
    }
    return this.audioContext;
  }
  channels(buffer){
    if(!buffer?.getChannelData||buffer.numberOfChannels<1||buffer.numberOfChannels>2||!buffer.length)
      throw Error('Expected nonempty mono/stereo audio.');
    return Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  }
  makeBuffer(data,rate){
    const buffer=this.context().createBuffer(data.length,data[0].length,rate);
    data.forEach((ch,i)=>buffer.copyToChannel(ch,i));return buffer;
  }
  getConverter(){
    return this.converter||=new AudioConverterTool(this.context());
  }
  async loadAudioFile(file){return this.getConverter().loadAudioFile(file);}
  async extractAudioFromVideo(file){
    // Browser decodeAudioData support for MP4 depends on container and codecs.
    try{return await this.loadAudioFile(file);}
    catch{throw Error('This video container cannot be decoded in this browser. Convert it to a supported audio format first.');}
  }
  cutAudioBuffer(buffer,startTimeSec,endTimeSec){
    const rate=buffer?.sampleRate;
    if(!Number.isFinite(startTimeSec)||!Number.isFinite(endTimeSec)||startTimeSec<0||
      endTimeSec<=startTimeSec||endTimeSec>buffer.duration)throw Error('Invalid cut range.');
    const start=Math.floor(startTimeSec*rate),end=Math.min(buffer.length,Math.ceil(endTimeSec*rate));
    return this.makeBuffer(this.channels(buffer).map(ch=>ch.slice(start,end)),rate);
  }
  normalizeAudioBuffer(buffer,targetPeakDB=-.1){
    if(!Number.isFinite(targetPeakDB)||targetPeakDB>0||targetPeakDB< -40)throw Error('Invalid peak target.');
    const original=this.channels(buffer),result=normalizeAudio(original,buffer.sampleRate,{
      mode:'peak',targetPeak:targetPeakDB,ceiling:targetPeakDB});
    return this.makeBuffer(result.channels,buffer.sampleRate);
  }
  removeSilenceBuffer(buffer,thresholdDB=-40,paddingMs=50){
    const data=this.channels(buffer),bounds=detectSilenceBounds(data,buffer.sampleRate,thresholdDB,paddingMs);
    return this.makeBuffer(trimAudio(data,bounds),buffer.sampleRate);
  }
  reverseAudioBuffer(buffer){
    return this.makeBuffer(reverseAudio(this.channels(buffer),buffer.sampleRate),buffer.sampleRate);
  }
  async resampleBuffer(buffer,rate){return this.getConverter().resampleBuffer(buffer,rate);}
  async convertToWavBlob(buffer,rate=null,options={}){return this.getConverter().convertToWavBlob(buffer,rate,options);}
  createVolumeNode(volume=1){
    if(!Number.isFinite(volume)||volume<0||volume>2)throw Error('Volume out of range.');
    const context=this.context(),node=context.createGain();
    node.gain.setValueAtTime(volume,context.currentTime);return node;
  }
  setPlaybackRate(source,rate=1){
    if(!source?.playbackRate||!Number.isFinite(rate)||rate<.25||rate>4)throw Error('Playback rate must be 0.25–4.');
    source.playbackRate.setValueAtTime(rate,this.context().currentTime);
  }
  createBassBooster(boostDB=8){
    if(!Number.isFinite(boostDB)||boostDB< -12||boostDB>12)throw Error('Bass boost out of range.');
    const c=this.context(),f=c.createBiquadFilter();f.type='lowshelf';
    f.frequency.setValueAtTime(150,c.currentTime);f.gain.setValueAtTime(boostDB,c.currentTime);return f;
  }
  createNoiseReductionFilter(cutoffFreq=80){
    if(!Number.isFinite(cutoffFreq)||cutoffFreq<20||cutoffFreq>1000)throw Error('Invalid rumble cutoff.');
    const c=this.context(),f=c.createBiquadFilter();f.type='highpass';
    f.frequency.setValueAtTime(cutoffFreq,c.currentTime);f.Q.setValueAtTime(.707,c.currentTime);return f;
  }
  applyFade(node,duration=2,fadeIn=true,delay=0){
    if(!node?.gain||!Number.isFinite(duration)||duration<0||duration>60||
      !Number.isFinite(delay)||delay<0)throw Error('Invalid fade settings.');
    const now=this.context().currentTime+delay;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(fadeIn?0:1,now);
    node.gain.linearRampToValueAtTime(fadeIn?1:0,now+duration);
  }
  create3BandEQ(){
    return this.createParametricEQ(makeEqBands(3),{
      edm:[4.5,-1.5,3],vocals:[-2,3.5,2],hiphop:[6,-1,1.5],flat:[0,0,0]
    });
  }
  create5BandEQ(){
    return this.createParametricEQ(makeEqBands(5),{
      warm_vocals:[-3,1,3,4,2],punchy_drums:[5,3,-2,2,4],
      club_edm:[4,2,-1,3,5],flat:[0,0,0,0,0]
    });
  }
  createParametricEQ(config,presets){
    const c=this.context(),input=c.createGain(),output=c.createGain(),bands={},nodes=[];
    let previous=input;
    config.forEach((b,i)=>{
      const f=c.createBiquadFilter();
      f.type=b.type;f.frequency.setValueAtTime(b.frequency,c.currentTime);
      f.Q.setValueAtTime(b.q,c.currentTime);f.gain.setValueAtTime(0,c.currentTime);
      previous.connect(f);previous=f;nodes.push(f);bands[b.id||(['low','mid','high'][i])]=f;
    });previous.connect(output);
    return {input,output,bands,
      applyPreset(name){
        const values=presets[String(name).toLowerCase()]||presets.flat;
        nodes.forEach((f,i)=>f.gain.setValueAtTime(values[i],c.currentTime));
        return [...values];
      },
      disconnect(){input.disconnect();nodes.forEach(f=>f.disconnect());output.disconnect();}
    };
  }
  createAIMixEngine(){
    const c=this.context(),input=c.createGain(),output=c.createGain(),eq=c.createBiquadFilter(),
      compressor=c.createDynamicsCompressor();eq.type='peaking';eq.frequency.value=2000;
    input.connect(eq);eq.connect(compressor);compressor.connect(output);
    const profiles={vocals:{threshold:-18,ratio:3,gain:2.5},drums:{threshold:-15,ratio:6,gain:1},
      balanced:{threshold:-20,ratio:4,gain:1.5}};
    const applyProfile=name=>{const p=profiles[String(name).toLowerCase()]||profiles.balanced;
      compressor.threshold.value=p.threshold;compressor.ratio.value=p.ratio;eq.gain.value=p.gain;return p;};
    applyProfile('balanced');return {input,output,eq,compressor,applyProfile};
  }
  createAIMasteringEngine(){
    const c=this.context(),input=c.createGain(),output=c.createGain(),compressor=c.createDynamicsCompressor(),makeup=c.createGain();
    input.connect(compressor);compressor.connect(makeup);makeup.connect(output);
    const presets={spotify:{threshold:-1,makeup:1.2},apple_music:{threshold:-.5,makeup:1.1},
      club_edm:{threshold:-.2,makeup:1.4}};
    compressor.ratio.value=20;compressor.attack.value=.002;
    const applyPreset=name=>{const p=presets[String(name).toLowerCase()]||presets.spotify;
      compressor.threshold.value=p.threshold;makeup.gain.value=p.makeup;return p;};
    applyPreset('spotify');
    // DynamicsCompressorNode is not a true-peak limiter. Use Smart Master for final export.
    return {input,output,compressor,makeup,applyPreset,limiter:false};
  }
  createAIVoiceCleaner(){
    const c=this.context(),input=c.createGain(),output=c.createGain(),
      highpass=c.createBiquadFilter(),presence=c.createBiquadFilter(),compressor=c.createDynamicsCompressor();
    highpass.type='highpass';highpass.frequency.value=100;
    presence.type='peaking';presence.frequency.value=3000;presence.gain.value=4;
    compressor.threshold.value=-24;compressor.ratio.value=4;
    input.connect(highpass);highpass.connect(presence);presence.connect(compressor);compressor.connect(output);
    return {input,output,highpass,presence,compressor,
      note:'Speech EQ and compression only; this is not neural noise removal.'};
  }
  async analyzeBPM(buffer){
    const mono=analysisMono(buffer);return analyzeTempo(mono.samples,mono.sampleRate);
  }
  separateVocalStems(buffer){
    const src=this.channels(buffer);if(src.length!==2)throw Error('Center-channel extraction requires stereo audio.');
    const instrumental=src.map(ch=>new Float32Array(ch.length));
    const vocals=src.map(ch=>new Float32Array(ch.length));
    for(let i=0;i<src[0].length;i++){
      const center=(src[0][i]+src[1][i])*.5;
      for(let ch=0;ch<2;ch++){instrumental[ch][i]=src[ch][i]-.7*center;vocals[ch][i]=center;}
    }
    return {instrumental:this.makeBuffer(instrumental,buffer.sampleRate),
      vocals:this.makeBuffer(vocals,buffer.sampleRate),
      method:'center-channel approximation; not AI stem separation'};
  }
  createVisualizer(source,canvas){
    if(!source?.connect||!canvas?.getContext)throw Error('Missing visualizer source or canvas.');
    const c=this.context(),analyser=c.createAnalyser();analyser.fftSize=512;source.connect(analyser);
    const ctx=canvas.getContext('2d'),data=new Uint8Array(analyser.frequencyBinCount);
    if(!ctx)throw Error('Canvas 2D unavailable.');
    let active=false,frame=null;
    const draw=()=>{
      if(!active)return;
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const count=Math.min(96,data.length),step=Math.floor(data.length/count);
      for(let i=0;i<count;i++){
        const h=data[i*step]/255*canvas.height;
        ctx.fillStyle=i%2?'#FFFFFF':'#FF0000';
        ctx.fillRect(i*canvas.width/count,canvas.height-h,Math.max(1,canvas.width/count-1),h);
      }
      frame=globalThis.requestAnimationFrame(draw);
    };
    return {start(){if(active)return;active=true;draw();},stop(){active=false;if(frame!==null)globalThis.cancelAnimationFrame(frame);},
      disconnect(){active=false;if(frame!==null)globalThis.cancelAnimationFrame(frame);analyser.disconnect();}};
  }
}
