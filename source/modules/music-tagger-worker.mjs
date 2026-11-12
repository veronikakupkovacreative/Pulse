// PULSE Music Tagger: bounded, dependency-free acoustic measurements.
// These are DSP descriptors, never claimed as model-predicted genre/mood/instrument tags.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const round=(n,d=2)=>Number(n.toFixed(d));
function fft(real,imag){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}
 for(let len=2;len<=n;len<<=1){
  const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
  for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let k=0;k<len/2;k++){
   const l=i+k,r=l+len/2,tr=real[r]*ur-imag[r]*ui,ti=real[r]*ui+imag[r]*ur;
   real[r]=real[l]-tr;imag[r]=imag[l]-ti;real[l]+=tr;imag[l]+=ti;
   const nr=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=nr;
  }}
 }
}
export function analyzeAcoustics(channels,sampleRate){
 if(!Array.isArray(channels)||channels.length<1||channels.length>2||channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length))
  throw Error('Invalid mono/stereo PCM data.');
 const length=channels[0].length;
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||length<sampleRate*2)
  throw Error('Select at least two seconds of valid audio.');
 const step=Math.max(1,Math.floor(length/800000)),duration=length/sampleRate;
 let peak=0,sum=0,nonzero=0,zeroCross=0,previous=0,stereoL=0,stereoR=0,stereoLR=0,frames=0;
 const frameSize=Math.max(64,Math.round(sampleRate*.025)),energies=[],mono=new Float32Array(Math.ceil(length/step));
 for(let i=0,j=0;i<length;i+=step,j++){
  const l=channels[0][i],r=channels[1]?.[i]??l,v=(l+r)/2;
  if(!Number.isFinite(l)||!Number.isFinite(r))throw Error('Audio contains invalid samples.');
  mono[j]=v;peak=Math.max(peak,Math.abs(l),Math.abs(r));sum+=v*v;if(Math.abs(v)>1e-6)nonzero++;
  if(j&&v*previous<0)zeroCross++;previous=v;
  if(channels.length===2){stereoL+=l*l;stereoR+=r*r;stereoLR+=l*r;}
 }
 for(let i=0;i<mono.length;i+=Math.max(1,Math.floor(frameSize/step))){
  let e=0,k=0;const size=Math.max(1,Math.floor(frameSize/step));
  for(let j=i;j<Math.min(mono.length,i+size);j++){e+=mono[j]*mono[j];k++;}
  if(k){energies.push(Math.sqrt(e/k));frames++;}
 }
 const rms=Math.sqrt(sum/mono.length),peakDb=20*Math.log10(Math.max(peak,1e-9)),rmsDb=20*Math.log10(Math.max(rms,1e-9));
 if(peak<1e-5)return {silent:true,duration:round(duration),sampleRate,channels:channels.length,message:'No audible signal detected.'};
 const sorted=[...energies].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)]||0;
 let transients=0;for(let i=1;i<energies.length;i++)if(energies[i]>Math.max(.012,median*1.75)&&energies[i]>energies[i-1]*1.9)transients++;
 // Sample at up to 48 positions with 2048-point FFT windows.
 const N=2048,windows=Math.min(48,Math.max(4,Math.floor(duration/1.5))),bandPower=[0,0,0],centroids=[],flatnesses=[];
 let totalSpectrum=0;
 for(let w=0;w<windows;w++){
  const center=Math.floor((w+.5)*mono.length/windows),start=clamp(center-N/2,0,Math.max(0,mono.length-N));
  const re=new Float64Array(N),im=new Float64Array(N);
  // mono[] is downsampled by 'step'; effective FFT sample rate changes accordingly.
  for(let k=0;k<N;k++)re[k]=(mono[start+k]||0)*(.5-.5*Math.cos(2*Math.PI*k/(N-1)));
  fft(re,im);
  let weight=0,cent=0,log=0,arithmetic=0,bins=0;
  for(let k=1;k<N/2;k++){
   const hz=k*(sampleRate/step)/N,magnitude=Math.hypot(re[k],im[k]),power=magnitude*magnitude;
   if(hz<40||hz>Math.min(16000,sampleRate/(2*step)))continue;
   const band=hz<200?0:hz<2500?1:2;bandPower[band]+=power;
   weight+=magnitude;cent+=hz*magnitude;log+=Math.log(Math.max(power,1e-18));arithmetic+=power;bins++;
  }
  if(weight>1e-8){centroids.push(cent/weight);flatnesses.push(Math.exp(log/bins)/(arithmetic/bins+1e-18));totalSpectrum++;}
 }
 const total=bandPower.reduce((a,b)=>a+b,0),bands=total>0?bandPower.map(v=>round(100*v/total,1)):[0,0,0];
 const centroid=centroids.length?centroids.reduce((a,b)=>a+b,0)/centroids.length:0;
 const flatness=flatnesses.length?flatnesses.reduce((a,b)=>a+b,0)/flatnesses.length:0;
 const stereo=channels.length===2?stereoLR/Math.sqrt(Math.max(1e-20,stereoL*stereoR)):null;
 return {
  silent:false,duration:round(duration),sampleRate,channels:channels.length,
  peakDb:round(peakDb,1),rmsDb:round(rmsDb,1),crestDb:round(peakDb-rmsDb,1),
  spectralCentroidHz:Math.round(centroid),spectralFlatness:round(clamp(flatness,0,1),3),
  frequencyBalance:{bass:bands[0],mid:bands[1],treble:bands[2]},
  transientDensityPerSecond:round(transients/duration,2),
  zeroCrossingsPerSecond:Math.round(zeroCross/mono.length*(sampleRate/step)),
  stereoCorrelation:stereo===null?null:round(clamp(stereo,-1,1),3),
  descriptors:[
   centroid<1100?'DARK TONAL BALANCE':centroid>3300?'BRIGHT TONAL BALANCE':'BALANCED TONAL BALANCE',
   peakDb-rmsDb>14?'WIDE DYNAMIC PEAKS':peakDb-rmsDb<7?'COMPACT DYNAMICS':'MODERATE DYNAMICS',
   transients/duration>3?'DENSE TRANSIENT ACTIVITY':'LOW / MODERATE TRANSIENT ACTIVITY'
  ],
  disclaimer:'Measured acoustic properties, not AI-estimated genre, mood or instrument recognition.'
 };
}
self.onmessage=({data})=>{
 if(data?.type!=='analyze')return;
 try{
  const channels=(data.channels||[]).map(b=>new Float32Array(b));
  self.postMessage({id:data.id,type:'done',result:analyzeAcoustics(channels,data.sampleRate)});
 }catch(e){self.postMessage({id:data.id,type:'error',error:e.message||'Acoustic measurement failed.'});}
};