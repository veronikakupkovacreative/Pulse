// 4x polyphase, windowed-sinc reconstructed true-peak estimator.
// Frequencies above the original Nyquist are rejected by the interpolation kernels.
// Report as a 4x estimate, not a certified third-party BS.1770 meter.
const RADIUS=8;
const PHASES=4;
const kernels=Array.from({length:PHASES-1},(_,phase)=>{
  const fraction=(phase+1)/PHASES;
  const values=new Float64Array(2*RADIUS+1);
  let total=0;
  for(let k=-RADIUS;k<=RADIUS;k++){
    const t=fraction-k;
    const sinc=t===0?1:Math.sin(Math.PI*t)/(Math.PI*t);
    const r=Math.abs(t)/RADIUS;
    const window=r>=1?0:.42+.5*Math.cos(Math.PI*r)+.08*Math.cos(2*Math.PI*r);
    const value=sinc*window;
    values[k+RADIUS]=value;total+=value;
  }
  for(let k=0;k<values.length;k++)values[k]/=total;
  return values;
});
export function truePeakEnvelope(channels){
  if(!Array.isArray(channels)||!channels.length||!channels[0]?.length)throw Error('Invalid audio for true-peak measurement.');
  const n=channels[0].length,out=new Float32Array(n);
  for(const channel of channels){
    if(channel.length!==n)throw Error('Channel lengths must match.');
    for(let i=0;i<n;i++){
      let peak=Math.abs(Number.isFinite(channel[i])?channel[i]:0);
      for(let p=0;p<3;p++){
        const weights=kernels[p];
        let reconstructed=0;
        const start=Math.max(-RADIUS,-i);
        const end=Math.min(RADIUS,n-i-1);
        for(let k=start;k<=end;k++)reconstructed+=channel[i+k]*weights[k+RADIUS];
        const magnitude=Math.abs(reconstructed);
        if(magnitude>peak)peak=magnitude;
      }
      if(peak>out[i])out[i]=peak;
    }
  }
  return out;
}
export function truePeakDb(channels){
  const envelope=truePeakEnvelope(channels);
  let peak=0;for(let i=0;i<envelope.length;i++)if(envelope[i]>peak)peak=envelope[i];
  return peak>0?20*Math.log10(peak):-Infinity;
}
export function limitTruePeak(channels,rate,ceilingDb=-1){
  if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isFinite(ceilingDb)||ceilingDb>0||ceilingDb< -12)throw Error('Invalid true-peak limiter parameters.');
  const n=channels[0].length,limit=10**(ceilingDb/20);
  const peaks=truePeakEnvelope(channels),ahead=Math.max(1,Math.round(rate*.005));
  const deque=new Int32Array(n),out=channels.map(ch=>new Float32Array(ch.length));
  const release=Math.exp(-1/(rate*.12));
  let head=0,tail=0,gain=1,maxReductionDb=0;
  for(let i=0;i<n;i++){
    const start=i===0?0:Math.min(n,i+ahead);
    const stop=Math.min(n,i+ahead+1);
    for(let j=start;j<stop;j++){
      while(tail>head&&peaks[deque[tail-1]]<=peaks[j])tail--;
      deque[tail++]=j;
    }
    while(tail>head&&deque[head]<i)head++;
    const future=tail>head?peaks[deque[head]]:peaks[i];
    const desired=future>limit?limit/future:1;
    gain=desired<gain?desired:release*gain+(1-release)*desired;
    maxReductionDb=Math.max(maxReductionDb,-20*Math.log10(Math.max(gain,1e-10)));
    for(let c=0;c<channels.length;c++)out[c][i]=channels[c][i]*gain;
  }
  // A final constant gain trim accounts for overshoot caused by time-varying gain;
  // it leaves the already-smooth limiter gain envelope untouched.
  const measured=truePeakDb(out);
  const safety=measured>ceilingDb?10**((ceilingDb-measured-.025)/20):1;
  if(safety<1)for(const ch of out)for(let i=0;i<ch.length;i++)ch[i]*=safety;
  return {channels:out,maxReductionDb,outputTruePeakDb:truePeakDb(out),safetyTrimDb:20*Math.log10(safety)};
}
