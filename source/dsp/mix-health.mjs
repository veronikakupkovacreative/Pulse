// Measured mix health, no assumed genre-specific tonal target.
export function stereoHealth(channels){
  if(channels.length!==2)return {correlation:null,balanceDb:null,widthRatio:null,monoEnergyRatio:null};
  const [l,r]=channels;let ll=0,rr=0,lr=0,mid=0,side=0;
  for(let i=0;i<l.length;i++){const a=l[i],b=r[i];ll+=a*a;rr+=b*b;lr+=a*b;mid+=(a+b)**2/4;side+=(a-b)**2/4;}
  const correlation=ll>0&&rr>0?Math.max(-1,Math.min(1,lr/Math.sqrt(ll*rr))):null;
  return {correlation,balanceDb:ll>0&&rr>0?10*Math.log10(ll/rr):null,
    widthRatio:mid>0?Math.sqrt(side/mid):null,
    monoEnergyRatio:ll+rr>0?2*mid/(ll+rr):null};
}
export function mixHealthFindings(analysis){
  const findings=[];
  const add=(code,label,evidence,detail)=>findings.push({code,label,evidence,detail});
  if(analysis.peakDb>=-.05)add('peak','NEAR FULL SCALE',`${analysis.peakDb.toFixed(1)} dBFS sample peak`,'Check clipping and available headroom before mastering.');
  if(analysis.truePeakDb>0)add('true-peak','INTERSAMPLE OVERS',`${analysis.truePeakDb.toFixed(1)} dBTP estimated`,'Reduce output peaks to avoid reconstruction overs.');
  if(analysis.crestDb<5)add('dynamics','LIMITED DYNAMICS',`${analysis.crestDb.toFixed(1)} dB crest factor`,'Additional compression should be conservative.');
  if(analysis.correlation!==null&&analysis.correlation<-.15)add('stereo','NEGATIVE CORRELATION',`${analysis.correlation.toFixed(2)} correlation`,'Check mono compatibility and artistic intent.');
  if(analysis.balanceDb!==null&&Math.abs(analysis.balanceDb)>3)add('balance','CHANNEL IMBALANCE',`${analysis.balanceDb.toFixed(1)} dB L/R balance`,'Check whether the channel offset is intentional.');
  if(!findings.length)add('balanced','NO CRITICAL ISSUES','No thresholds exceeded','Preserve the mix unless listening reveals a problem.');
  return findings;
}
export function applyStereoWidth(channels,width=1){
  if(!Number.isFinite(width)||width<.5||width>1.5)throw Error('Stereo width must be 0.5–1.5.');
  if(channels.length!==2||width===1)return channels;
  const [l,r]=channels,out=[new Float32Array(l.length),new Float32Array(r.length)];
  for(let i=0;i<l.length;i++){const mid=(l[i]+r[i])/2,side=(l[i]-r[i])/2*width;out[0][i]=mid+side;out[1][i]=mid-side;}
  return out;
}
