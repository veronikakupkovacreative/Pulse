// Local, pinned UMD build of web-audio-beat-detector (MIT).
// The package already runs the beat estimation in its own Web Worker.
export const BEAT_DETECTOR_VERSION = '8.2.39';
export const BEAT_DETECTOR_URL = '/vendor/beat-detector/bundle.js';
const TEMPO_LIMITS = Object.freeze({minTempo:45,maxTempo:220});
let loading = null;

export function selectBeatWindow(audioBuffer, maximumSeconds=60){
  if (!audioBuffer || !Number.isFinite(audioBuffer.duration) || audioBuffer.duration<=0) throw new Error('INVALID_AUDIO');
  const duration=Math.min(maximumSeconds,audioBuffer.duration);
  return {offset:Math.max(0,(audioBuffer.duration-duration)/2),duration};
}

export function getBeatDetector(){
  const existing=globalThis.webAudioBeatDetector;
  if(typeof existing?.guess==='function'&&typeof existing?.analyze==='function')return Promise.resolve(existing);
  if(loading)return loading;
  if(typeof document==='undefined')return Promise.reject(new Error('BPM_LIBRARY_UNAVAILABLE'));
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=BEAT_DETECTOR_URL;
    script.async=true;
    script.dataset.pulseBeatDetector=BEAT_DETECTOR_VERSION;
    script.onload=()=>{
      const detector=globalThis.webAudioBeatDetector;
      if(typeof detector?.guess!=='function'||typeof detector?.analyze!=='function')reject(new Error('BPM_LIBRARY_INVALID'));
      else resolve(detector);
    };
    script.onerror=()=>{script.remove();reject(new Error('BPM_LIBRARY_LOAD_FAILED'));};
    document.head.append(script);
  }).catch(error=>{loading=null;throw error});
  return loading;
}

export function waitForAnalysis(operation,{signal,timeoutMs=45000}={}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const done=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
    const abort=()=>done(reject,signal?.reason||new DOMException('Analysis cancelled','AbortError'));
    const timer=setTimeout(()=>done(reject,new Error('BPM_LIBRARY_TIMEOUT')),timeoutMs);
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    Promise.resolve(operation).then(value=>done(resolve,value),error=>done(reject,error));
  });
}

export async function measureBeatDetector(audioBuffer,{signal,timeoutMs=45000}={}){
  if(signal?.aborted)throw signal.reason||new DOMException('Analysis cancelled','AbortError');
  const detector=await waitForAnalysis(getBeatDetector(),{signal,timeoutMs});
  const window=selectBeatWindow(audioBuffer);
  // guess() uses the same estimator as analyze(), while also returning the first-beat offset.
  // Analyze a representative region to avoid rendering twenty minutes a second time.
  const result=await waitForAnalysis(detector.guess(audioBuffer,window.offset,window.duration,TEMPO_LIMITS),{signal,timeoutMs});
  const tempo=Number(result?.tempo);
  if(!Number.isFinite(tempo)||tempo<20||tempo>400)throw new Error('BPM_LIBRARY_INVALID_RESULT');
  return {tempo,offset:window.offset+Math.max(0,Number(result.offset)||0),window};
}

const round2=n=>Math.round(n*100)/100;
const validTempo=n=>Number.isFinite(n)&&n>=20&&n<=400;
export function buildBeatGrid(bpm,phase,duration){
  if(!validTempo(bpm)||!Number.isFinite(phase)||!Number.isFinite(duration)||duration<=0)return [];
  const period=60/bpm,start=((phase%period)+period)%period,grid=[];
  for(let n=0;n<12000;n++){
    const t=start+n*period;
    if(t>duration+1e-5)break;
    grid.push(Math.round(t*100000)/100000);
  }
  return grid;
}

/** Keep the measured onset-aligned beat positions for the detected BPM.
 * Half/double-time corrections re-grid uniformly because onset events cannot
 * be relabeled as different subdivisions without a new rhythm analysis.
 */
export function buildAnalyzerBeatGrid(result,selectedBpm,duration){
  if(!validTempo(selectedBpm)||!Number.isFinite(duration)||duration<=0)return [];
  const primary=Number(result?.bpm);
  const original=Array.isArray(result?.beatTimes)?result.beatTimes:[];
  if(result?.measuredBeatTimes===true){
    // For Essentia, show only measured timestamps from the analyzed window.
    // Half-time downsamples existing ticks; double-time adds clearly marked
    // estimated subdivisions (reported as such in the UI).
    const measured=original.filter(t=>Number.isFinite(t)&&t>=0&&t<=duration)
      .sort((a,b)=>a-b).filter((t,i,array)=>i===0||t-array[i-1]>.035);
    if(measured.length<2)return [];
    const ratio=selectedBpm/primary;
    if(Math.abs(ratio-1)<.02)return measured;
    if(Math.abs(ratio-.5)<.025)return measured.filter((_,i)=>i%2===0);
    if(Math.abs(ratio-2)<.05){
      const withMidpoints=[];
      for(let i=0;i<measured.length;i++){
        withMidpoints.push(measured[i]);
        if(i+1<measured.length)withMidpoints.push(Math.round((measured[i]+measured[i+1])*.5*10000)/10000);
      }
      return withMidpoints;
    }
    // Never fabricate a uniform grid when Essentia selected a non-metrical alternative.
    return [];
  }
  if(Number.isFinite(primary)&&Math.abs(selectedBpm-primary)<0.015&&original.length>=2){
    const measured=original.filter(t=>Number.isFinite(t)&&t>=0&&t<=duration).sort((a,b)=>a-b);
    const unique=measured.filter((t,i)=>i===0||t-measured[i-1]>0.035);
    if(unique.length>=2)return unique;
  }
  return buildBeatGrid(selectedBpm,Number(result?.offset)||0,duration);
}

// User-facing BPM comes from web-audio-beat-detector when supported by the onset model.
// When strong independent onset evidence conflicts, avoid presenting a known-wrong value.
export function mergeRhythmResults(vendor,onsets,duration){
  const vendorTempo=Number(vendor?.tempo),onsetTempo=Number(onsets?.bpm);
  const hasVendor=validTempo(vendorTempo),hasOnset=validTempo(onsetTempo);
  if(!hasVendor&&!hasOnset)throw new Error('NO_RHYTHM');
  let bpm=hasVendor?vendorTempo:onsetTempo;
  const agreement=hasVendor&&hasOnset?Math.abs(Math.log2(vendorTempo/onsetTempo)):Infinity;
  const close=agreement<=0.04;
  const strongDisagreement=hasVendor&&hasOnset&&!close&&onsets?.confidence==='high';
  if(strongDisagreement)bpm=onsetTempo;
  const usingVendor=hasVendor&&!strongDisagreement;
  const durationSeconds=Number(duration)||Number(onsets?.duration)||0;
  const onsetMarkers=Array.isArray(onsets?.beatTimes)?onsets.beatTimes.filter(n=>Number.isFinite(n)&&n>=0&&n<=durationSeconds):[];
  const firstBeat=usingVendor&&Number.isFinite(vendor?.offset)?vendor.offset:(onsetMarkers[0]??0);
  const beatTimes=(hasOnset&&Math.abs(bpm-onsetTempo)/onsetTempo<0.02&&onsetMarkers.length>1)?onsetMarkers:buildBeatGrid(bpm,firstBeat,durationSeconds);
  return {
    ...(onsets||{}),
    bpm:round2(bpm),
    confidence:hasOnset?(hasVendor&&!close?'low':onsets.confidence):'low',
    beatTimes,
    offset:Math.round((((firstBeat%(60/bpm))+(60/bpm))%(60/bpm))*1000)/1000,
    detectorBpm:hasVendor?round2(vendorTempo):null,
    onsetBpm:hasOnset?round2(onsetTempo):null,
    method:usingVendor?'web-audio-beat-detector':'rhythm-worker',
    interpretations:{half:round2(bpm/2),main:round2(bpm),double:round2(bpm*2)}
  };
}
