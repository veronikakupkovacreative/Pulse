import {peakingBiquad,biquadMagnitudeDb} from './eq-response.mjs';

const eqBound=(v,a,b)=>Math.min(b,Math.max(a,v));
export const EQ_DEFAULT_BANDS=[
  {type:'highpass',frequency:30,gain:0,q:.707,enabled:false},
  {type:'lowshelf',frequency:110,gain:0,q:.707,enabled:true},
  {type:'peaking',frequency:280,gain:0,q:1.1,enabled:true},
  {type:'peaking',frequency:900,gain:0,q:1.0,enabled:true},
  {type:'peaking',frequency:1600,gain:0,q:1.0,enabled:true},
  {type:'peaking',frequency:4300,gain:0,q:1.2,enabled:true},
  {type:'peaking',frequency:7000,gain:0,q:1.0,enabled:true},
  {type:'highshelf',frequency:10000,gain:0,q:.707,enabled:true}
];
export function eqCoefficients(band,rate){
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error('Invalid sample rate.');
  const {frequency,gain=0,q=1,type='peaking'}=band;
  if(!Number.isFinite(frequency)||frequency<20||frequency>20000
    ||!Number.isFinite(gain)||gain< -12||gain>12
    ||!Number.isFinite(q)||q<.25||q>10)throw Error('Invalid EQ filter settings.');
  const safeFrequency=Math.min(frequency,rate*.45);
  if(type==='peaking')return peakingBiquad(rate,safeFrequency,gain,q);
  const w=2*Math.PI*safeFrequency/rate,cs=Math.cos(w),sn=Math.sin(w);
  const alpha=sn/(2*q),A=10**(gain/40),root=2*Math.sqrt(A)*alpha;
  let b0,b1,b2,a0,a1,a2;
  if(type==='highpass'){b0=(1+cs)/2;b1=-(1+cs);b2=b0;a0=1+alpha;a1=-2*cs;a2=1-alpha;}
  else if(type==='lowpass'){b0=(1-cs)/2;b1=1-cs;b2=b0;a0=1+alpha;a1=-2*cs;a2=1-alpha;}
  else if(type==='lowshelf'){
    b0=A*((A+1)-(A-1)*cs+root);b1=2*A*((A-1)-(A+1)*cs);b2=A*((A+1)-(A-1)*cs-root);
    a0=(A+1)+(A-1)*cs+root;a1=-2*((A-1)+(A+1)*cs);a2=(A+1)+(A-1)*cs-root;
  }else if(type==='highshelf'){
    b0=A*((A+1)+(A-1)*cs+root);b1=-2*A*((A-1)+(A+1)*cs);b2=A*((A+1)+(A-1)*cs-root);
    a0=(A+1)-(A-1)*cs+root;a1=2*((A-1)-(A+1)*cs);a2=(A+1)-(A-1)*cs-root;
  }else if(type==='notch'){
    b0=1;b1=-2*cs;b2=1;a0=1+alpha;a1=-2*cs;a2=1-alpha;
  }else throw Error('Unknown EQ filter type.');
  return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
export function eqResponse(bands,rate,points=160){
  const active=bands.filter(b=>b.enabled!==false).map(b=>eqCoefficients(b,rate));
  return Array.from({length:points},(_,i)=>{
    const hz=20*(Math.min(20000,rate*.45)/20)**(i/Math.max(1,points-1));
    const db=eqBound(active.reduce((a,c)=>a+biquadMagnitudeDb(c,hz,rate),0),-48,24);
    return {hz,db};
  });
}
export function renderEqualizer(channels,rate,bands,outputGainDb=0){
  if(!Array.isArray(channels)||!channels.length||channels.length>2||
    channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==channels[0].length))
    throw Error('Equalizer expects mono or stereo audio.');
  if(!Number.isFinite(outputGainDb)||outputGainDb< -18||outputGainDb>12)throw Error('Output gain out of range.');
  const filters=bands.filter(b=>b.enabled!==false).map(b=>eqCoefficients(b,rate));
  const multiplier=10**(outputGainDb/20);
  return channels.map(channel=>{
    let data=channel.slice();
    // Reuse the output buffer per band: 20-band EQ must not allocate
    // a new full-length Float32Array for every individual filter.
    for(const [b0,b1,b2,a1,a2] of filters){
      let x1=0,x2=0,y1=0,y2=0;
      for(let i=0;i<data.length;i++){
        const x=data[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
        data[i]=y;x2=x1;x1=x;y2=y1;y1=y;
      }
    }
    if(multiplier!==1)for(let i=0;i<data.length;i++)data[i]*=multiplier;
    return data;
  });
}


/** Five-band mastering layout from the new Pulse Studio EQ specification. */
export const PULSE_FIVE_BAND_EQ=Object.freeze([
  Object.freeze({id:'sub',type:'lowshelf',frequency:60,gain:0,q:1,enabled:true}),
  Object.freeze({id:'bass',type:'peaking',frequency:230,gain:0,q:1.2,enabled:true}),
  Object.freeze({id:'mid',type:'peaking',frequency:1000,gain:0,q:1.5,enabled:true}),
  Object.freeze({id:'highMid',type:'peaking',frequency:4000,gain:0,q:1.2,enabled:true}),
  Object.freeze({id:'brilliance',type:'highshelf',frequency:12000,gain:0,q:1,enabled:true})
]);
export const PULSE_FIVE_BAND_MASTERING_PRESETS=Object.freeze({
  warm_vocals:Object.freeze({sub:-3,bass:1,mid:3,highMid:4,brilliance:2}),
  punchy_drums:Object.freeze({sub:5,bass:3,mid:-2,highMid:2,brilliance:4}),
  electronic_master:Object.freeze({sub:4,bass:2,mid:-1,highMid:3,brilliance:5}),
  podcast_voice:Object.freeze({sub:-6,bass:2,mid:2,highMid:3,brilliance:1}),
  flat:Object.freeze({sub:0,bass:0,mid:0,highMid:0,brilliance:0})
});

/** Optional Web Audio live chain; exported for consumers outside the main editor. */
export class AdvancedAudioEqualizer {
  constructor(audioContext=null){
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    this.audioContext=audioContext||(Context?new Context():null);
    if(!this.audioContext)throw new Error('Web Audio API is unavailable.');
    this.inputNode=this.audioContext.createGain();
    this.outputNode=this.audioContext.createGain();
    this.bands={};
    let previous=this.inputNode;
    for(const config of PULSE_FIVE_BAND_EQ){
      const filter=this.audioContext.createBiquadFilter();
      filter.type=config.type;
      filter.frequency.setValueAtTime(
        Math.min(config.frequency,this.audioContext.sampleRate*.45),this.audioContext.currentTime);
      filter.gain.setValueAtTime(config.gain,this.audioContext.currentTime);
      filter.Q.setValueAtTime(config.q,this.audioContext.currentTime);
      previous.connect(filter);previous=filter;this.bands[config.id]=filter;
    }
    previous.connect(this.outputNode);
  }
  connectSource(source){
    if(!source?.connect)throw new Error('Invalid source node.');
    source.connect(this.inputNode);
  }
  connectDestination(destination){
    if(!destination)throw new Error('Invalid destination node.');
    this.outputNode.connect(destination);
  }
  setBandGain(bandId,gainValue){
    const node=this.bands[bandId];
    if(!node)throw new Error('Unknown EQ band: '+bandId);
    if(!Number.isFinite(gainValue)||gainValue< -12||gainValue>12)
      throw new Error('EQ gain must be between -12 and +12 dB.');
    node.gain.setValueAtTime(gainValue,this.audioContext.currentTime);
  }
  setOutputVolume(volume){
    if(!Number.isFinite(volume)||volume<0||volume>2)
      throw new Error('Output volume must be between 0 and 2.');
    this.outputNode.gain.setValueAtTime(volume,this.audioContext.currentTime);
  }
  applyMasteringPreset(presetName){
    const key=String(presetName).toLowerCase();
    const preset=PULSE_FIVE_BAND_MASTERING_PRESETS[key];
    if(!preset)throw new Error('Unknown mastering preset: '+presetName);
    for(const [band,gain] of Object.entries(preset))this.setBandGain(band,gain);
    return {...preset};
  }
  disconnect(){
    this.inputNode.disconnect();
    for(const filter of Object.values(this.bands))filter.disconnect();
    this.outputNode.disconnect();
  }
}
