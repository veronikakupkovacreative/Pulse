import {peakingBiquad,biquadMagnitudeDb} from './eq-response.mjs';

const eqBound=(v,a,b)=>Math.min(b,Math.max(a,v));
export const EQ_DEFAULT_BANDS=[
  {type:'highpass',frequency:30,gain:0,q:.707,enabled:false},
  {type:'lowshelf',frequency:110,gain:0,q:.707,enabled:true},
  {type:'peaking',frequency:280,gain:0,q:1.1,enabled:true},
  {type:'peaking',frequency:1600,gain:0,q:1.0,enabled:true},
  {type:'peaking',frequency:4300,gain:0,q:1.2,enabled:true},
  {type:'highshelf',frequency:10000,gain:0,q:.707,enabled:true}
];
export function eqCoefficients(band,rate){
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error('Invalid sample rate.');
  const {frequency,gain=0,q=1,type='peaking'}=band;
  if(!Number.isFinite(frequency)||frequency<20||frequency>Math.min(20000,rate*.49)
    ||!Number.isFinite(gain)||gain< -12||gain>12
    ||!Number.isFinite(q)||q<.25||q>10)throw Error('Invalid EQ filter settings.');
  if(type==='peaking')return peakingBiquad(rate,frequency,gain,q);
  const w=2*Math.PI*frequency/rate,cs=Math.cos(w),sn=Math.sin(w);
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
    for(const [b0,b1,b2,a1,a2] of filters){
      let x1=0,x2=0,y1=0,y2=0;const result=new Float32Array(data.length);
      for(let i=0;i<data.length;i++){
        const x=data[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
        result[i]=y;x2=x1;x1=x;y2=y1;y1=y;
      }
      data=result;
    }
    if(multiplier!==1)for(let i=0;i<data.length;i++)data[i]*=multiplier;
    return data;
  });
}
