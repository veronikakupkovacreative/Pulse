// Local waveform editing operations. Inputs are never mutated.
const verify=(channels,rate)=>{
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||
    channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==channels[0].length)||
    !Number.isFinite(rate)||rate<8000||rate>192000)throw Error('Invalid mono/stereo waveform.');
};
function fadeEdges(out,rate,ms=5){
  const length=out[0].length,fade=Math.min(Math.floor(length/4),Math.round(rate*ms/1000));
  if(!fade)return out;
  for(const channel of out)for(let i=0;i<fade;i++){
    channel[i]*=i/fade;channel[length-1-i]*=i/fade;
  }
  return out;
}
export function trimWaveform(channels,rate,from,to,fadeMs=5){
  verify(channels,rate);
  const n=channels[0].length,start=Math.max(0,Math.floor(from*rate)),end=Math.min(n,Math.ceil(to*rate));
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>n/rate+1/rate||end-start<rate*.01)throw Error('Select at least 10 ms to trim.');
  return fadeEdges(channels.map(ch=>ch.slice(start,end)),rate,fadeMs);
}
export function deleteWaveformRange(channels,rate,from,to,fadeMs=5){
  verify(channels,rate);
  const n=channels[0].length,start=Math.floor(from*rate),end=Math.ceil(to*rate);
  if(!Number.isFinite(from)||!Number.isFinite(to)||start<0||end>n||end-start<rate*.01||end-start>=n)throw Error('Select an interior region shorter than the track.');
  const output=channels.map(ch=>{
    const data=new Float32Array(n-(end-start));
    data.set(ch.subarray(0,start));data.set(ch.subarray(end),start);
    return data;
  });
  const radius=Math.min(Math.round(rate*fadeMs/1000),Math.floor(start/2),Math.floor((n-end)/2));
  for(const data of output)for(let i=0;i<radius;i++){
    // A symmetric smooth gain envelope around the cut eliminates hard discontinuity.
    data[start-radius+i]*=(radius-i)/radius;
    data[start+i]*=(i+1)/radius;
  }
  return output;
}
export function splitWaveform(channels,rate,at,fadeMs=5){
  verify(channels,rate);
  const n=channels[0].length,frame=Math.round(at*rate);
  if(!Number.isFinite(at)||frame<rate*.02||n-frame<rate*.02)throw Error('Position the playhead at least 20 ms from either edge.');
  return {left:fadeEdges(channels.map(ch=>ch.slice(0,frame)),rate,fadeMs),
    right:fadeEdges(channels.map(ch=>ch.slice(frame)),rate,fadeMs)};
}
export function removeQuietPauses(channels,rate,{thresholdDb=-42,minPauseMs=450,keepMs=110,fadeMs=5}={}){
  verify(channels,rate);
  if(!Number.isFinite(thresholdDb)||thresholdDb<-90||thresholdDb>0||
      !Number.isFinite(minPauseMs)||minPauseMs<100||minPauseMs>5000)throw Error('Invalid pause-removal settings.');
  const n=channels[0].length,window=Math.max(32,Math.round(rate*.015));
  const threshold=10**(thresholdDb/20);
  const quiet=[];
  for(let pos=0;pos<n;pos+=window){
    let sum=0,count=0;
    const end=Math.min(n,pos+window);
    for(const ch of channels)for(let i=pos;i<end;i++){sum+=ch[i]*ch[i];count++;}
    quiet.push(Math.sqrt(sum/Math.max(1,count))<threshold);
  }
  const deletes=[];
  for(let i=0;i<quiet.length;){
    if(!quiet[i]){i++;continue;}
    const start=i;while(i<quiet.length&&quiet[i])i++;
    const length=(i-start)*window/rate*1000;
    if(length<minPauseMs)continue;
    const hold=Math.round(keepMs*rate/1000),startFrame=Math.max(0,start*window),endFrame=Math.min(n,i*window);
    const cutStart=startFrame+Math.min(hold/2,(endFrame-startFrame)/4);
    const cutEnd=endFrame-Math.min(hold/2,(endFrame-startFrame)/4);
    if(cutEnd-cutStart>=rate*.02)deletes.push({from:cutStart,to:cutEnd});
  }
  if(!deletes.length)return {channels:channels.map(ch=>ch.slice()),removed:0,regions:[]};
  let output=channels.map(ch=>ch.slice());
  for(let i=deletes.length-1;i>=0;i--)output=deleteWaveformRange(output,rate,deletes[i].from/rate,deletes[i].to/rate,fadeMs);
  return {channels:output,removed:deletes.length,regions:deletes};
}
export function reduceNoiseGate(channels,rate,{thresholdDb=-46,maxReductionDb=14,attackMs=12,releaseMs=90}={}){
  verify(channels,rate);
  if(!Number.isFinite(thresholdDb)||thresholdDb<-85||thresholdDb>0||
    !Number.isFinite(maxReductionDb)||maxReductionDb<0||maxReductionDb>30)throw Error('Invalid noise gate settings.');
  const n=channels[0].length,out=channels.map(()=>new Float32Array(n));
  const floor=10**(thresholdDb/20),minGain=10**(-maxReductionDb/20);
  const attack=Math.exp(-1/(rate*(attackMs/1000))),release=Math.exp(-1/(rate*(releaseMs/1000)));
  let level=0,gain=1;
  for(let i=0;i<n;i++){
    let energy=0;for(const ch of channels)energy+=ch[i]*ch[i];
    const amplitude=Math.sqrt(energy/channels.length);
    level=(amplitude>level?attack:release)*level+
          (1-(amplitude>level?attack:release))*amplitude;
    const target=level<floor?minGain:1;
    // Fast opening, slow closing to avoid chattering and transients.
    const smoothing=target>gain?attack:release;
    gain=smoothing*gain+(1-smoothing)*target;
    for(let c=0;c<channels.length;c++)out[c][i]=channels[c][i]*gain;
  }
  return out;
}
