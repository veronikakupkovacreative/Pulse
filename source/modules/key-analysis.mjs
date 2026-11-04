const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function estimateKeyFromWindows(windows,sampleRate,frameCount,windowSize=4096){
 if(!(windows instanceof Float32Array)||!Number.isFinite(sampleRate)||sampleRate<8000||!Number.isInteger(frameCount)||frameCount<1||windows.length!==frameCount*windowSize)throw Error('INVALID_KEY_ANALYSIS_INPUT');
 const chroma=new Float64Array(12);
 for(let frame=0;frame<frameCount;frame++){
  const offset=frame*windowSize,signal=windows.subarray(offset,offset+windowSize),windowed=new Float32Array(windowSize);let energy=0;
  for(let j=0;j<windowSize;j++){const value=signal[j]*(.5-.5*Math.cos(2*Math.PI*j/(windowSize-1)));windowed[j]=value;energy+=value*value;}
  if(energy<.0001)continue;
  for(let midi=48;midi<=95;midi++){
   const frequency=440*2**((midi-69)/12),coefficient=2*Math.cos(2*Math.PI*frequency/sampleRate);let q0=0,q1=0,q2=0;
   for(let j=0;j<windowSize;j++){q0=windowed[j]+coefficient*q1-q2;q2=q1;q1=q0;}
   const power=Math.max(0,q1*q1+q2*q2-coefficient*q1*q2);chroma[midi%12]+=Math.sqrt(power)/(1+Math.abs(midi-69)/24);
  }
 }
 let best={score:-Infinity,root:0,mode:'major'},second=-Infinity;
 for(let root=0;root<12;root++)for(const [mode,profile] of [['major',MAJOR],['minor',MINOR]]){let sum=0,norm=0;for(let i=0;i<12;i++){sum+=chroma[(root+i)%12]*profile[i];norm+=chroma[(root+i)%12];}const score=sum/Math.max(norm,1e-8);if(score>best.score){second=best.score;best={score,root,mode};}else second=Math.max(second,score);}
 const major=['8B','3B','10B','5B','12B','7B','2B','9B','4B','11B','6B','1B'],minor=['5A','12A','7A','2A','9A','4A','11A','6A','1A','8A','3A','10A'],total=chroma.reduce((a,x)=>a+x,0);
 return {key:total?NOTES[best.root]+' '+best.mode:'Undetermined',camelot:total?(best.mode==='major'?major:minor)[best.root]:'--',confidence:total?clamp(Math.round((best.score-second)*200),0,95):0};
}