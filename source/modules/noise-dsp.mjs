/**
 * PULSE Noise Remover - browser-local spectral subtraction and gentle biquad filtering.
 * Deterministic DSP, not a trained neural denoiser. Preserves source buffers.
 * Designed to run inside noise-worker.mjs so audio rendering never blocks the UI.
 */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const FFT_SIZE=2048;
const HOP=1024;
const HALF=FFT_SIZE/2;
const WINDOW=Float64Array.from({length:FFT_SIZE},(_,i)=>.5-.5*Math.cos(2*Math.PI*(i+.5)/FFT_SIZE));

export function validateNoiseSettings(settings={},sampleRate=48000){
 const highpass=Number(settings.highpass??70);
 const lowpass=Number(settings.lowpass??16000);
 const intensity=Number(settings.intensity??.7);
 const nyquist=sampleRate/2;
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Unsupported sample rate.');
 if(!Number.isFinite(highpass)||highpass<20||highpass>500)throw Error('High-pass must be between 20 and 500 Hz.');
 if(!Number.isFinite(lowpass)||lowpass<1000||lowpass>20000)throw Error('Low-pass must be between 1000 and 20000 Hz.');
 if(!Number.isFinite(intensity)||intensity<.1||intensity>1)throw Error('Intensity must be between 0.1 and 1.0.');
 const effectiveLowpass=Math.min(lowpass,nyquist*.91);
 if(highpass>=effectiveLowpass*.8)throw Error('High-pass and low-pass frequencies overlap.');
 return {highpass,lowpass:effectiveLowpass,intensity};
}

function fft(re,im,inverse=false){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;
  for(;j&bit;bit>>=1)j^=bit;
  j^=bit;
  if(i<j){const tmp=re[i];re[i]=re[j];re[j]=tmp;const v=im[i];im[i]=im[j];im[j]=v;}
 }
 for(let len=2;len<=n;len*=2){
  const angle=(inverse?2:-2)*Math.PI/len;
  const wr0=Math.cos(angle),wi0=Math.sin(angle),half=len>>1;
  for(let i=0;i<n;i+=len){
   let wr=1,wi=0;
   for(let j=0;j<half;j++){
    const a=i+j,b=a+half;
    const vr=re[b]*wr-im[b]*wi,vi=re[b]*wi+im[b]*wr;
    re[b]=re[a]-vr;im[b]=im[a]-vi;
    re[a]+=vr;im[a]+=vi;
    const nr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nr;
   }
  }
 }
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}

function frameSpectrum(channel,start,re,im){
 for(let i=0;i<FFT_SIZE;i++){
  const idx=start+i;
  re[i]=(idx>=0&&idx<channel.length?channel[idx]:0)*WINDOW[i];
  im[i]=0;
 }
 fft(re,im);
}

function blockEnergy(channels,start){
 let sum=0,count=0;
 for(let i=0;i<FFT_SIZE;i+=4){
  const idx=start+i;if(idx<0||idx>=channels[0].length)continue;
  let max=0;
  for(const c of channels)max=Math.max(max,Math.abs(c[idx]));
  sum+=max*max;count++;
 }
 return sum/Math.max(1,count);
}

function learnFrames(channels,sampleRate,range){
 const length=channels[0].length;
 const start=range?Math.max(0,Math.floor(range.start*sampleRate)):0;
 const end=range?Math.min(length,Math.ceil(range.end*sampleRate)):length;
 if(range&&(end-start)<sampleRate*.15)throw Error('Select at least 150 ms of noise-only audio.');
 if(end<=start)throw Error('The selected noise profile is empty.');
 // Automatic mode: use low-energy windows across the whole file (maximum 140 samples).
 // Manual mode: analyze evenly spaced windows only inside the selected area.
 const candidates=[],frames=Math.max(1,Math.ceil((end-start)/HOP));
 const target=Math.min(140,frames),step=Math.max(1,Math.floor(frames/target));
 for(let i=0;i<frames;i+=step){
  const pos=Math.min(length-1,start+i*HOP);
  const offset=pos-HALF;
  candidates.push({start:offset,energy:blockEnergy(channels,offset)});
 }
 if(range)return candidates.slice(0,80);
 candidates.sort((a,b)=>a.energy-b.energy);
 const maxEnergy=candidates.at(-1)?.energy||0;
 // Exclude digital silence so automatic noise learning is not dominated by zeros.
 const nonzero=candidates.filter(c=>c.energy>Math.max(1e-12,maxEnergy*1e-7));
 return (nonzero.length?nonzero:candidates).slice(0,Math.max(4,Math.min(32,Math.ceil((nonzero.length||candidates.length)*.22))));
}

function estimateFloor(channel,sampleRate,frames){
 const noise=new Float64Array(HALF+1),re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE);
 for(const frame of frames){
  frameSpectrum(channel,frame.start,re,im);
  for(let k=0;k<=HALF;k++)noise[k]+=Math.hypot(re[k],im[k]);
 }
 for(let k=0;k<=HALF;k++)noise[k]/=Math.max(1,frames.length);
 // Smooth the learned floor slightly across bins to reduce isolated musical notches.
 const smoothed=new Float64Array(HALF+1);
 for(let k=0;k<=HALF;k++){
  let total=0,weight=0;
  for(let j=Math.max(0,k-2);j<=Math.min(HALF,k+2);j++){
   const w=3-Math.abs(j-k);total+=noise[j]*w;weight+=w;
  }
  smoothed[k]=total/weight;
 }
 // Protect stable narrow-band fundamentals and harmonics. Auto learning on
 // continuously loud music must not mistake each musical note for stationary hiss.
 const tonal=new Uint8Array(HALF+1);
 for(let k=9;k<HALF-9;k++){
  const around=(smoothed[k-9]+smoothed[k-8]+smoothed[k-7]+smoothed[k-6]+
    smoothed[k+6]+smoothed[k+7]+smoothed[k+8]+smoothed[k+9])/8;
  if(smoothed[k]>Math.max(1e-8,around)*4.5){
   for(let j=Math.max(0,k-3);j<=Math.min(HALF,k+3);j++)tonal[j]=1;
  }
 }
 for(let k=0;k<=HALF;k++)if(tonal[k])smoothed[k]*=.06;
 return smoothed;
}

function filterCoefficients(type,frequency,rate){
 const w=2*Math.PI*frequency/rate,cos=Math.cos(w),sin=Math.sin(w),alpha=sin/Math.SQRT2;
 const a0=1+alpha,a1=-2*cos,a2=1-alpha;
 const b0=type==='highpass'?(1+cos)/2:(1-cos)/2;
 const b1=type==='highpass'?-(1+cos):(1-cos);
 return [b0/a0,b1/a0,b0/a0,a1/a0,a2/a0];
}
function applyBiquad(channel,coeffs){
 const [b0,b1,b2,a1,a2]=coeffs;
 let x1=0,x2=0,y1=0,y2=0;
 for(let i=0;i<channel.length;i++){
  const x=channel[i];const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
  channel[i]=y;x2=x1;x1=x;y2=y1;y1=y;
 }
}
function spectralChannel(channel,floor,intensity,{progress,checkCancelled}={}){
 const length=channel.length,out=new Float32Array(length),weight=new Float32Array(length);
 const re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE);
 const prevGain=new Float64Array(HALF+1).fill(1);
 const rawGain=new Float64Array(HALF+1);
 const minGain=Math.max(.06,1-.93*intensity);
 const count=Math.ceil((length+HALF)/HOP);
 for(let frame=0;frame<count;frame++){
  if((frame&63)===0){checkCancelled?.();progress?.(frame/Math.max(1,count));}
  const start=frame*HOP-HALF;
  frameSpectrum(channel,start,re,im);
  for(let k=0;k<=HALF;k++){
   const mag=Math.hypot(re[k],im[k]);
   const ratio=floor[k]/Math.max(1e-10,mag);
   rawGain[k]=clamp(1-intensity*1.4*ratio,minGain,1);
  }
  for(let k=0;k<=HALF;k++){
   const smooth=(rawGain[Math.max(0,k-1)]+2*rawGain[k]+rawGain[Math.min(HALF,k+1)])/4;
   const old=prevGain[k],coeff=smooth<old?0.56:0.18;
   const gain=prevGain[k]=old+(smooth-old)*coeff;
   re[k]*=gain;im[k]*=gain;
   if(k!==0&&k!==HALF){re[FFT_SIZE-k]*=gain;im[FFT_SIZE-k]*=gain;}
  }
  fft(re,im,true);
  for(let i=0;i<FFT_SIZE;i++){
   const index=start+i;if(index<0||index>=length)continue;
   const w=WINDOW[i];out[index]+=re[i]*w;weight[index]+=w*w;
  }
 }
 for(let i=0;i<length;i++)out[i]=Number.isFinite(out[i])?out[i]/Math.max(1e-8,weight[i]):0;
 return out;
}

/**
 * @param {Float32Array[]} inputChannelArrays independent source channel arrays
 * @param {number} sampleRate
 * @param {object} settings highpass, lowpass, intensity, and optional noiseRange seconds
 * @param {object} hooks onProgress(fraction), checkCancelled()
 * @returns {{channels: Float32Array[],info:object}} processed signal of identical duration
 */
export function removeNoiseChannels(inputChannelArrays,sampleRate,settings={},hooks={}){
 if(!Array.isArray(inputChannelArrays)||inputChannelArrays.length<1||inputChannelArrays.length>2||
  inputChannelArrays.some(c=>!(c instanceof Float32Array)||c.length<2048||c.length!==inputChannelArrays[0].length))
  throw Error('Noise removal supports mono or stereo audio with at least 2048 samples.');
 if(inputChannelArrays.some(c=>c.some(v=>!Number.isFinite(v))))throw Error('Audio contains invalid samples.');
 const options=validateNoiseSettings(settings,sampleRate);
 const range=settings.noiseRange??null;
 if(range&&(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.end<=range.start||
   range.start<0||range.end>inputChannelArrays[0].length/sampleRate+.001))throw Error('Invalid noise-only selection.');
 const frames=learnFrames(inputChannelArrays,sampleRate,range);
 const channels=[];
 for(let c=0;c<inputChannelArrays.length;c++){
  hooks.checkCancelled?.();
  const input=inputChannelArrays[c],noiseFloor=estimateFloor(input,sampleRate,frames);
  const output=spectralChannel(input,noiseFloor,options.intensity,{
   checkCancelled:hooks.checkCancelled,
   progress:fraction=>hooks.onProgress?.((c+fraction)/inputChannelArrays.length*.9)
  });
  if(options.highpass>0)applyBiquad(output,filterCoefficients('highpass',options.highpass,sampleRate));
  if(options.lowpass<sampleRate*.48)applyBiquad(output,filterCoefficients('lowpass',options.lowpass,sampleRate));
  // Avoid hard digital clipping; this is not loudness normalization.
  for(let i=0;i<output.length;i++)output[i]=clamp(output[i],-1,1);
  channels.push(output);
 }
 hooks.onProgress?.(1);
 return {channels,info:{profile:range?'selected':'automatic',analyzedFrames:frames.length,
  duration:inputChannelArrays[0].length/sampleRate,highpass:options.highpass,lowpass:options.lowpass,intensity:options.intensity}};
}
