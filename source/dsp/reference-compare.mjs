// Compare measured quantities only. Band deltas describe relative energy,
// not EQ gain required to "sound like" the reference.
export function compareReference(source,reference){
  if(!source||!reference||!Number.isFinite(source.lufs)||!Number.isFinite(reference.lufs))
    throw Error('Both tracks need valid measured loudness.');
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)*100)/100:null;
  const bands=(source.spectrum||[]).map(s=>{
    const r=reference.spectrum?.find(v=>v.id===s.id);
    const share=Number.isFinite(s.share)?s.share:null;
    const ref=Number.isFinite(r?.share)?r.share:null;
    return {id:s.id,label:s.label,
      share,referenceShare:ref,
      relativeDeltaDb:share>1e-8&&ref>1e-8?delta(10*Math.log10(share),10*Math.log10(ref)):null};
  });
  return {
    lufsDelta:delta(source.lufs,reference.lufs),
    truePeakDelta:delta(source.truePeakDb,reference.truePeakDb),
    crestDelta:delta(source.crestDb,reference.crestDb),
    correlationDelta:delta(source.correlation,reference.correlation),
    bands
  };
}
export function monitoringGainDb(analysis,others=[]){
  if(!analysis||!Number.isFinite(analysis.lufs))return 0;
  const available=[analysis,...others].filter(x=>x&&Number.isFinite(x.lufs));
  const reference=Math.min(...available.map(x=>x.lufs));
  const loudnessGain=Math.min(0,reference-analysis.lufs);
  const safety=Number.isFinite(analysis.peakDb)?Math.min(0,-1-analysis.peakDb):0;
  return Math.min(loudnessGain,safety);
}
