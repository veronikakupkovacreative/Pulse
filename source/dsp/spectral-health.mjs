// Bounded seven-band, source-relative spectral analysis for mix inspection.
// Values are band power relative to total measured power, not calibrated EQ targets.
// Radix-2 Hann FFT; 4096 samples at up to 24 locations to bound memory/CPU.
export const SPECTRAL_BANDS=Object.freeze([
  {id:'sub',label:'SUB',from:20,to:60},
  {id:'bass',label:'BASS',from:60,to:140},
  {id:'lowmid',label:'LOW MID',from:140,to:400},
  {id:'mid',label:'MID',from:400,to:1500},
  {id:'presence',label:'PRESENCE',from:1500,to:4000},
  {id:'high',label:'HIGH',from:4000,to:10000},
  {id:'air',label:'AIR',from:10000,to:24000}
]);
const FFT_SIZE=4096;
function fftPower(input){
  const n=input.length,real=new Float64Array(n),imag=new Float64Array(n);
  let j=0;
  for(let i=0;i<n;i++){
    const sample=input[i];
    const hann=.5-.5*Math.cos(2*Math.PI*i/(n-1));
    real[j]=sample*hann;
    let bit=n>>1;
    while(j&bit){j^=bit;bit>>=1;}
    j^=bit;
  }
  for(let span=2;span<=n;span*=2){
    const half=span>>1,angle=-2*Math.PI/span;
    const wrStep=Math.cos(angle),wiStep=Math.sin(angle);
    for(let base=0;base<n;base+=span){
      let wr=1,wi=0;
      for(let k=0;k<half;k++){
        const a=base+k,b=a+half;
        const vr=real[b]*wr-imag[b]*wi,vi=real[b]*wi+imag[b]*wr;
        real[b]=real[a]-vr;imag[b]=imag[a]-vi;
        real[a]+=vr;imag[a]+=vi;
        const nextRe=wr*wrStep-wi*wiStep;
        wi=wr*wiStep+wi*wrStep;wr=nextRe;
      }
    }
  }
  const power=new Float64Array(n/2+1);
  for(let k=0;k<power.length;k++)power[k]=real[k]*real[k]+imag[k]*imag[k];
  return power;
}
export function analyzeSpectrum(channels,rate,{maxFrames=24}={}){
  if(!Array.isArray(channels)||!channels.length||channels.length>2||
    !channels[0]?.length||!Number.isFinite(rate)||rate<8000||rate>192000||
    channels.some(ch=>ch.length!==channels[0].length))
    throw Error('Invalid audio for spectral analysis.');
  const n=channels[0].length,nyquist=rate/2;
  const frames=Math.max(1,Math.min(24,Math.floor(maxFrames),Math.floor(n/FFT_SIZE)||1));
  const powers=new Float64Array(SPECTRAL_BANDS.length);
  const mono=new Float32Array(FFT_SIZE);
  for(let frame=0;frame<frames;frame++){
    const start=Math.max(0,Math.min(n-FFT_SIZE,Math.round((frame+.5)/frames*Math.max(0,n-FFT_SIZE))));
    for(let i=0;i<FFT_SIZE;i++){
      const at=start+i;let value=0;
      if(at<n)for(const ch of channels)value+=ch[at];
      mono[i]=value/channels.length;
    }
    const power=fftPower(mono);
    for(let k=1;k<power.length;k++){
      const hz=k*rate/FFT_SIZE;
      const index=SPECTRAL_BANDS.findIndex(b=>hz>=b.from&&hz<Math.min(b.to,nyquist+.001));
      if(index>=0)powers[index]+=power[k];
    }
  }
  const total=powers.reduce((a,b)=>a+b,0);
  return SPECTRAL_BANDS.map((band,i)=>{
    const available=band.from<nyquist;
    const share=total>0?powers[i]/total:0;
    return {...band,toHz:Math.min(band.to,nyquist),available,
      share,relativeDb:share>0?10*Math.log10(share):null};
  });
}
export function spectrumFindings(bands){
  if(!Array.isArray(bands)||bands.length!==7)return [];
  const low=bands[0].share+bands[1].share;
  const high=bands[5].share+bands[6].share;
  const notes=[];
  if(low>.72)notes.push({code:'low-heavy',label:'LOW-FREQUENCY DOMINANCE',
    evidence:Math.round(low*100)+'% measured energy below 140 Hz',
    detail:'Inspect the kick/bass balance and compare against a reference before changing EQ.'});
  if(high>.64)notes.push({code:'high-heavy',label:'HIGH-FREQUENCY DOMINANCE',
    evidence:Math.round(high*100)+'% measured energy above 4 kHz',
    detail:'Check cymbals and brightness by ear; genre and arrangement matter.'});
  return notes;
}
