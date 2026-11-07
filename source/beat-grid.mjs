// Lightweight transient-based grid alignment. The lines are estimated quarter notes,
// not verified individual beats or a time-signature detection.
export function estimateBeatOffset(samples,sampleRate,bpm){
  if(!samples?.length||!Number.isFinite(bpm)||bpm<=0)return null;
  const period=60/bpm,hop=Math.max(128,Math.round(sampleRate*.01));
  const frames=Math.min(Math.floor(samples.length/hop),Math.ceil(20*sampleRate/hop));
  if(frames<10)return null;
  const rms=new Float32Array(frames);
  for(let f=0;f<frames;f++){
    let energy=0;const start=f*hop;
    for(let i=start;i<start+hop;i++)energy+=samples[i]*samples[i];
    rms[f]=Math.sqrt(energy/hop);
  }
  const onset=new Float32Array(frames);
  let total=0;
  for(let f=2;f<frames;f++){
    const rise=Math.max(0,rms[f]-Math.min(rms[f-1],rms[f-2]));
    onset[f]=rise;total+=rise;
  }
  if(total<1e-4)return null;
  const frameRate=sampleRate/hop;
  const framesPerBeat=period*frameRate;
  let bestPhase=0,bestScore=0;
  // Scan all possible onset phases, allowing +/- 20 ms around each beat.
  for(let phase=0;phase<Math.ceil(framesPerBeat);phase++){
    let score=0;
    for(let idx=phase;idx<frames;idx+=framesPerBeat){
      const center=Math.round(idx);
      score+=Math.max(onset[center-2]||0,onset[center-1]||0,onset[center]||0,onset[center+1]||0,onset[center+2]||0);
    }
    if(score>bestScore){bestScore=score;bestPhase=phase;}
  }
  return bestScore>0?Math.round(bestPhase/frameRate*1000)/1000:null;
}

export function gridLines(duration,bpm,offset,maxLines=2000){
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(bpm)||bpm<=0||!Number.isFinite(offset))return [];
  const period=60/bpm;
  const result=[];
  // Skip enough beats if an offset outside [0,period) was provided.
  const first=Math.max(0,Math.ceil((0-offset)/period));
  const last=Math.min(Math.floor((duration-offset)/period),first+maxLines-1);
  for(let i=first;i<=last;i++)result.push(Math.round((offset+i*period)*10000)/10000);
  return result;
}
