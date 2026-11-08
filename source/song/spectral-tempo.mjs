// Independent spectral-flux tempo estimate. Runs exclusively in the analysis worker.
const N = 512;
const HOP = 128;
function fftMagnitude(input, offset, real, imag) {
  for (let i=0;i<N;i++) { real[i]=input[offset+i] * (0.5-0.5*Math.cos(2*Math.PI*i/(N-1)));imag[i]=0; }
  let j=0;
  for(let i=1;i<N;i++) {
    let bit=N>>1;
    while(j&bit) {j^=bit;bit>>=1;}
    j^=bit;
    if(i<j) {let v=real[i];real[i]=real[j];real[j]=v;}
  }
  for(let len=2;len<=N;len<<=1) {
    const a=-2*Math.PI/len;
    const wr=Math.cos(a),wi=Math.sin(a);
    for(let i=0;i<N;i+=len){let cr=1,ci=0;
      for(let k=0;k<len/2;k++) {
        const l=i+k,r=l+len/2;
        const tr=cr*real[r]-ci*imag[r],ti=cr*imag[r]+ci*real[r];
        real[r]=real[l]-tr;imag[r]=imag[l]-ti;
        real[l]+=tr;imag[l]+=ti;
        const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;
      }
    }
  }
}
function fluxEnvelope(samples,sampleRate,offset,seconds=20) {
  const stride=Math.max(1,Math.round(sampleRate/11025));
  const length=Math.min(Math.floor(seconds*sampleRate),samples.length-offset);
  const frames=Math.floor((Math.floor(length/stride)-N)/HOP)+1;
  if(frames<100)return null;
  const wave=new Float32Array(Math.floor(length/stride));
  for(let i=0;i<wave.length;i++) wave[i]=samples[offset+i*stride];
  const real=new Float64Array(N),imag=new Float64Array(N);
  const previous=new Float64Array(N/2),env=new Float64Array(frames);
  for(let f=0;f<frames;f++) {
    fftMagnitude(wave,f*HOP,real,imag);
    let flux=0;
    for(let k=2;k<N/2;k++){
      const magnitude=Math.log1p(100*Math.hypot(real[k],imag[k])/N);
      const change=magnitude-previous[k];
      if(change>0)flux+=change;
      previous[k]=magnitude;
    }
    env[f]=flux;
  }
  // Remove slow background variation; beats are local spectral changes.
  const out=new Float64Array(frames);
  for(let i=0;i<frames;i++){
    const start=Math.max(0,i-4),end=Math.min(frames,i+5);
    let average=0;
    for(let k=start;k<end;k++)average+=env[k];
    out[i]=Math.max(0,env[i]-average/(end-start));
  }
  return {onsets:out,rate:sampleRate/stride/HOP};
}
export function estimateSpectralTempo(samples,sampleRate) {
  const duration=samples.length/sampleRate;
  if(duration<6)return null;
  const span=Math.min(20,duration);
  const starts=duration<=span ? [0] : duration<48 ? [0,Math.max(0,duration-span)] : [5,(duration-span)/2,duration-span-5];
  const windows=starts.map(sec=>fluxEnvelope(samples,sampleRate,Math.floor(Math.max(0,sec)*sampleRate),span)).filter(Boolean);
  if(!windows.length)return null;
  const rate=windows[0].rate;
  const minLag=Math.floor(rate*60/220),maxLag=Math.ceil(rate*60/55);
  const scores=new Float64Array(maxLag+2);
  const individual=[];
  for(const {onsets} of windows){
    let mean=0;for(const x of onsets)mean+=x;mean/=onsets.length;
    const centered=Float64Array.from(onsets,x=>x-mean);
    const correlations=new Float64Array(maxLag+2);
    for(let lag=minLag;lag<=maxLag+1;lag++){
      let dot=0,a=0,b=0;
      for(let i=lag;i<centered.length;i++){
        const x=centered[i],y=centered[i-lag];dot+=x*y;a+=x*x;b+=y*y;
      }
      correlations[lag]=dot/(Math.sqrt(a*b)||1);
      scores[lag]+=correlations[lag]/windows.length;
    }
    individual.push(correlations);
  }
  const candidates=[];
  for(let lag=minLag+1;lag<maxLag;lag++){
    if(scores[lag]<=scores[lag-1]||scores[lag]<scores[lag+1])continue;
    const denom=scores[lag-1]-2*scores[lag]+scores[lag+1];
    const delta=denom ? Math.max(-.5,Math.min(.5,.5*(scores[lag-1]-scores[lag+1])/denom)) : 0;
    const bpm=60*rate/(lag+delta);
    const stability=individual.filter(c=>c[lag]>Math.max(.10,scores[lag]*.55)).length/windows.length;
    candidates.push({bpm,score:scores[lag],stability});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length||candidates[0].score<.12)return null;
  let best=candidates[0];
  // A sparse kick can dominate half-time. Prefer an independently repeating
  // double pulse when it is nearly as strong across all measured windows.
  if(best.bpm<100){
    const doubled=candidates.find(item=>Math.abs(item.bpm/best.bpm-2)<.045 &&
      item.score>=best.score*.78 && item.stability>=2/3);
    if(doubled)best=doubled;
  }
  return {bpm:Math.round(best.bpm*10)/10,score:best.score,stability:best.stability,
    alternatives:candidates.filter(c=>c!==best).slice(0,4).map(c=>({bpm:Math.round(c.bpm*10)/10,score:c.score}))};
}
