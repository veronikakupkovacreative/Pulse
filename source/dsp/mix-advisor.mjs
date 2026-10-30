import {analyzeSpectrum} from './spectral-health.mjs';
import {stemMeasurements} from './multitrack-mix.mjs';

// Highlights likely spectral overlap; does not claim psychoacoustic masking detection.
export function inspectStemOverlap(stems){
  if(!Array.isArray(stems)||stems.length<2)return {stems:[],findings:[]};
  const analyses=stems.map(stem=>({
    name:stem.name,
    rmsDb:stemMeasurements(stem.channels).rmsDb,
    bands:analyzeSpectrum(stem.channels,stem.rate)
  }));
  const findings=[];
  for(let i=0;i<analyses.length;i++)for(let j=i+1;j<analyses.length;j++){
    const a=analyses[i],b=analyses[j];
    if(Math.abs(a.rmsDb-b.rmsDb)>12)continue;
    for(let band=0;band<a.bands.length;band++){
      const x=a.bands[band],y=b.bands[band];
      if(x.share<.18||y.share<.18||!x.available||!y.available)continue;
      const overlap=Math.min(x.share,y.share);
      findings.push({first:a.name,second:b.name,band:x.label,
        strength:Math.round(overlap*100),suggestion:'Possible shared energy. Solo these stems and check separation by ear before EQ.'});
    }
  }
  findings.sort((a,b)=>b.strength-a.strength);
  return {stems:analyses,findings:findings.slice(0,6)};
}
