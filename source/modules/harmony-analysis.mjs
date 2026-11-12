/** Deterministic, browser-local tonal/chord estimator for spaced STFT windows.
 * Chord events are approximate and must not be presented as precise transcription.
 */
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const MAJOR_CAM=['8B','3B','10B','5B','12B','7B','2B','9B','4B','11B','6B','1B'];
const MINOR_CAM=['5A','12A','7A','2A','9A','4A','11A','6A','1A','8A','3A','10A'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function fft(real,imag){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;
  if(i<j){const a=real[i];real[i]=real[j];real[j]=a;const b=imag[i];imag[i]=imag[j];imag[j]=b;}
 }
 for(let len=2;len<=n;len<<=1){
  const rad=-2*Math.PI/len,wr0=Math.cos(rad),wi0=Math.sin(rad);
  for(let s=0;s<n;s+=len){let wr=1,wi=0;
   for(let k=0;k<len/2;k++){
    const a=s+k,b=a+len/2,tr=real[b]*wr-imag[b]*wi,ti=real[b]*wi+imag[b]*wr;
    real[b]=real[a]-tr;imag[b]=imag[a]-ti;
    real[a]+=tr;imag[a]+=ti;
    const tmp=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=tmp;
   }
  }
 }
}
function templateScore(chroma,profile,root){
 let sum=0,aw=0,bw=0,meanA=0,meanB=0;
 for(let i=0;i<12;i++){meanA+=chroma[i];meanB+=profile[i];}
 meanA/=12;meanB/=12;
 for(let i=0;i<12;i++){
  const a=chroma[(i+root)%12]-meanA,b=profile[i]-meanB;
  sum+=a*b;aw+=a*a;bw+=b*b;
 }
 return sum/Math.sqrt(Math.max(1e-12,aw*bw));
}
function calculateChroma(signal,sampleRate){
 const n=signal.length,real=new Float64Array(n),imag=new Float64Array(n);let power=0;
 for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1));real[i]=signal[i]*w;power+=real[i]*real[i];}
 if(power/n<1e-8)return null;
 fft(real,imag);
 const chroma=new Float64Array(12),resolution=sampleRate/n;
 // Log-compression and inverse-frequency weighting reduce dominance of kicks and broadband noise.
 for(let k=2;k<n/2;k++){
  const hz=k*resolution;if(hz<90||hz>Math.min(2600,sampleRate*.48))continue;
  const midi=69+12*Math.log2(hz/440),closest=Math.round(midi);
  if(Math.abs(closest-midi)>.34)continue;
  const magnitude=Math.hypot(real[k],imag[k]);
  const weight=Math.pow(magnitude,.7)/(1+hz/1200);
  chroma[((closest%12)+12)%12]+=weight;
 }
 const sum=chroma.reduce((a,b)=>a+b,0);
 if(sum<1e-5)return null;
 for(let i=0;i<12;i++)chroma[i]/=sum;
 const sorted=[...chroma].sort((a,b)=>b-a);
 const tonalFocus=sorted[0]+sorted[1]+sorted[2];
 if(tonalFocus<.315)return null;
 return {chroma,tonalFocus};
}
function chordCandidates(chroma){
 const results=[];
 for(let root=0;root<12;root++)for(const [mode,steps] of [['maj',[0,4,7]],['min',[0,3,7]]]){
  const tones=steps.map(k=>chroma[(k+root)%12]);
  // A credible triad should contain all three pitch classes, not only the bass.
  const mass=tones.reduce((a,b)=>a+b,0),coverage=Math.min(...tones);
  const score=mass*.72+coverage*.85;
  results.push({root,mode,score,mass,coverage});
 }
 return results.sort((a,b)=>b.score-a.score);
}
export function analyzeHarmonyFrames(windows,sampleRate,times,windowSize=8192){
 if(!(windows instanceof Float32Array)||!Number.isFinite(sampleRate)||sampleRate<8000||
  !Number.isInteger(windowSize)||windowSize<4096||(windowSize&(windowSize-1))!==0||
  !(times instanceof Float32Array)||!times.length||windows.length!==times.length*windowSize)
  throw Error('INVALID_HARMONY_FRAMES');
 const frames=[],globalChroma=new Float64Array(12);
 for(let f=0;f<times.length;f++){
  const summary=calculateChroma(windows.subarray(f*windowSize,(f+1)*windowSize),sampleRate);
  if(!summary)continue;
  const {chroma,tonalFocus}=summary;
  for(let j=0;j<12;j++)globalChroma[j]+=chroma[j];
  const [best,second]=chordCandidates(chroma);
  const margin=Math.max(0,best.score-second.score);
  const confident=best.mass>=.42&&best.coverage>=.028&&margin>=.017&&tonalFocus>=.35;
  frames.push({time:times[f],label:confident?NOTES[best.root]+' '+best.mode:null,
   quality:clamp(Math.round(100*margin*2.4),0,90),margin});
 }
 if(frames.length<3)return {key:null,chords:[],method:'FFT chroma',sampledFrames:frames.length};
 const candidates=[];
 for(let root=0;root<12;root++)for(const [mode,profile,cam] of [['major',MAJOR,MAJOR_CAM],['minor',MINOR,MINOR_CAM]])
  candidates.push({root,mode,camelot:cam[root],score:templateScore(globalChroma,profile,root)});
 candidates.sort((a,b)=>b.score-a.score);
 const first=candidates[0],runner=candidates[1],difference=first.score-runner.score;
 const key=first.score>.30?{
  name:NOTES[first.root]+' '+first.mode,camelot:first.camelot,
  confidence:difference>.12&&first.score>.66?'high':difference>.055&&first.score>.48?'medium':'low',
  score:first.score,alternatives:candidates.slice(1,3).map(x=>({name:NOTES[x.root]+' '+x.mode,camelot:x.camelot}))
 }:null;
 // Smooth only isolated label flicker; never invent labels where the spectrum has no tonal evidence.
 const smooth=frames.map((current,i)=>{
  const prev=frames[i-1]?.label,next=frames[i+1]?.label;
  return prev&&next&&prev===next&&current.label!==prev?{...current,label:prev}:current;
 });
 const groups=[];
 for(const frame of smooth){
  const last=groups.at(-1);
  if(last&&last.label===frame.label){last.count++;last.quality+=frame.quality;}
  else groups.push({time:frame.time,label:frame.label,count:1,quality:frame.quality});
 }
 const chords=groups.filter(group=>group.label&&group.count>=2&&group.quality/group.count>=3)
  .slice(0,36).map(group=>({time:Math.round(group.time*10)/10,label:group.label,
    confidence:Math.round(group.quality/group.count)}));
 return {key,chords,method:'FFT chroma / approximate major-minor triads',sampledFrames:frames.length};
}
