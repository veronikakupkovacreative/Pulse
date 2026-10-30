// Shared FFT/STFT engine for the Web Worker and AudioWorklet.
export const SPECTRAL_FFT_SIZE=2048;
export const SPECTRAL_HOP_SIZE=512;
const FFT_SIZE=SPECTRAL_FFT_SIZE,HOP=SPECTRAL_HOP_SIZE,HALF=FFT_SIZE>>1;
const WINDOW=Float64Array.from({length:FFT_SIZE},(_,i)=>Math.sin(Math.PI*(i+.5)/FFT_SIZE));
export function spectralFft(re,im,inverse=false){
  const n=re.length;
  if(n<2||(n&(n-1))!==0||im.length!==n)throw Error('FFT length must be a power of two.');
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;
    if(i<j){let tmp=re[i];re[i]=re[j];re[j]=tmp;tmp=im[i];im[i]=im[j];im[j]=tmp;}
  }
  for(let len=2;len<=n;len<<=1){
    const theta=(inverse?2:-2)*Math.PI/len,cos=Math.cos(theta),sin=Math.sin(theta);
    for(let start=0;start<n;start+=len){let wr=1,wi=0;
      for(let j=0;j<(len>>1);j++){
        const a=start+j,b=a+(len>>1),vr=re[b]*wr-im[b]*wi,vi=re[b]*wi+im[b]*wr;
        re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;
        const next=wr*cos-wi*sin;wi=wr*sin+wi*cos;wr=next;
      }
    }
  }
  if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
export function captureSpectralProfile(audioChannels,sampleRate,fromSeconds=0,toSeconds=0){
  if(!Array.isArray(audioChannels)||!audioChannels.length||!(sampleRate>0))throw Error('Noise selection is invalid.');
  const minLength=Math.min(...audioChannels.map(c=>c.length));
  const from=Math.max(0,Math.floor(fromSeconds*sampleRate)),to=Math.min(minLength,Math.ceil(toSeconds*sampleRate));
  if(to-from<Math.max(FFT_SIZE,Math.round(sampleRate*.12)))throw Error('Select at least 120 ms of isolated noise.');
  const profile=new Float64Array(HALF+1),re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE);
  let frames=0;
  const totalFrames=Math.max(1,Math.ceil((to-from-FFT_SIZE)/HOP)+1),step=Math.max(1,Math.ceil(totalFrames/250));
  for(const channel of audioChannels)for(let f=0;f<totalFrames;f+=step){
    const offset=Math.min(to-FFT_SIZE,from+f*HOP);
    for(let i=0;i<FFT_SIZE;i++){re[i]=(channel[offset+i]||0)*WINDOW[i];im[i]=0;}
    spectralFft(re,im);
    for(let k=0;k<=HALF;k++)profile[k]+=Math.hypot(re[k],im[k]);
    frames++;
  }
  if(!frames)throw Error('No noise profile frames collected.');
  const result=new Float32Array(HALF+1);for(let k=0;k<=HALF;k++)result[k]=profile[k]/frames;
  return result;
}
export function spectralSettings({amount=65,smoothing=65,floor=8,rumbleHz=0,hiss=0,gateDb=-72,blend=100,sampleRate=48000}={}){
  const bounded=(n,low,high,def)=>Number.isFinite(Number(n))?Math.min(high,Math.max(low,Number(n))):def;
  return {amount:bounded(amount,0,100,65),smoothing:bounded(smoothing,0,100,65),floor:bounded(floor,3,30,8),rumbleHz:bounded(rumbleHz,0,150,0),hiss:bounded(hiss,0,100,0),gateDb:bounded(gateDb,-90,-24,-72),blend:bounded(blend,0,100,100),sampleRate:bounded(sampleRate,8000,192000,48000)};
}
export function spectralProcessFrame(re,im,profile,settings,memory,targetScratch=null){
  const {amount,smoothing,floor,hiss}=spectralSettings(settings);
  if(!profile||profile.length!==HALF+1)throw Error('Noise profile size does not match FFT.');
  if(amount<=0)return;
  const alpha=amount/100*2.2,minGain=floor/100,smooth=smoothing/100,freqRadius=Math.round(smooth*4);
  const target=targetScratch||new Float64Array(HALF+1);
  for(let k=0;k<=HALF;k++){
    const magnitude=Math.hypot(re[k],im[k]);
    const hz=k*(settings.sampleRate||48000)/FFT_SIZE,hissWeight=hiss/100*Math.max(0,Math.min(1,(hz-4800)/5200));
    target[k]=Math.max(minGain,1-alpha*(1+hissWeight*1.8)*profile[k]/Math.max(magnitude,1e-10));
  }
  for(let k=0;k<=HALF;k++){
    let sum=0,weights=0;
    for(let j=-freqRadius;j<=freqRadius;j++){
      const index=Math.max(0,Math.min(HALF,k+j)),weight=freqRadius+1-Math.abs(j);
      sum+=target[index]*weight;weights+=weight;
    }
    const frequencyGain=sum/weights,history=memory[k]||frequencyGain,blend=smooth*.84,gain=blend*history+(1-blend)*frequencyGain;
    memory[k]=gain;
    re[k]*=gain;im[k]*=gain;
    if(k>0&&k<HALF){re[FFT_SIZE-k]*=gain;im[FFT_SIZE-k]*=gain;}
  }
}
export function renderSpectralDenoise(input,profile,options={},onProgress){
  if(!(input instanceof Float32Array))throw Error('Expected Float32Array audio.');
  const settings=spectralSettings({...options,sampleRate:options.sampleRate||48000});
  if(settings.amount===0&&settings.rumbleHz===0&&settings.gateDb<=-90)return input.slice();
  const out=new Float32Array(input.length),weights=new Float32Array(input.length);
  const re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE),memory=new Float64Array(HALF+1),scratch=new Float64Array(HALF+1);
  const frames=Math.ceil((input.length+FFT_SIZE)/HOP);
  let previousX=0,previousY=0,gateGain=1;
  const highpassAlpha=settings.rumbleHz>0?Math.exp(-2*Math.PI*settings.rumbleHz/settings.sampleRate):0;
  const blend=settings.blend/100;
  for(let frame=0;frame<frames;frame++){
    const offset=frame*HOP-FFT_SIZE+HOP;
    for(let i=0;i<FFT_SIZE;i++){const pos=offset+i;let sample=pos>=0&&pos<input.length?input[pos]:0;if(settings.rumbleHz>0){const y=highpassAlpha*(previousY+sample-previousX);previousX=sample;previousY=y;sample=y;}re[i]=sample*WINDOW[i];im[i]=0;}
    spectralFft(re,im);spectralProcessFrame(re,im,profile,settings,memory,scratch);spectralFft(re,im,true);
    for(let i=0;i<FFT_SIZE;i++){
      const pos=offset+i;if(pos<0||pos>=input.length)continue;
      out[pos]+=re[i]*WINDOW[i];weights[pos]+=WINDOW[i]*WINDOW[i];
    }
    if(onProgress&&frame%64===0)onProgress(frame/frames);
  }
  const gateAmplitude=10**(settings.gateDb/20),gateAttack=.025,gateRelease=.18;
  let inputEnergy=0,outputEnergy=0;
  for(let i=0;i<out.length;i++){
    const processed=weights[i]>1e-7?out[i]/weights[i]:input[i];
    const magnitude=Math.abs(input[i]),target=magnitude<gateAmplitude?Math.max(.08,magnitude/Math.max(gateAmplitude,1e-9)):1;
    const coefficient=target<gateGain?gateAttack:gateRelease;gateGain+= (target-gateGain)*(1-Math.exp(-1/(coefficient*settings.sampleRate)));
    const mixed=input[i]*(1-blend)+processed*blend;
    out[i]=mixed*gateGain;inputEnergy+=input[i]*input[i];outputEnergy+=out[i]*out[i];
  }
  out.reductionDb=10*Math.log10(Math.max(1e-12,inputEnergy)/Math.max(1e-12,outputEnergy));
  return out;
}
