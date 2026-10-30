import {analyzeSpectrum} from './spectral-health.mjs';
import {renderEqualizer} from './parametric-eq.mjs';
import {stemMeasurements} from './multitrack-mix.mjs';

export function analyzeStereoQuickFix(channels,rate){
  const bands=analyzeSpectrum(channels,rate);
  const signal=stemMeasurements(channels);
  let ll=0,rr=0,lr=0;
  if(channels.length===2){
    for(let i=0;i<channels[0].length;i++){const l=channels[0][i],r=channels[1][i];ll+=l*l;rr+=r*r;lr+=l*r;}
  }
  const correlation=channels.length===2&&ll>0&&rr>0?lr/Math.sqrt(ll*rr):null;
  const low=bands[0].share+bands[1].share;
  const presence=bands[4].share;
  const warnings=[];
  if(signal.peakDb>-.1)warnings.push('Source approaches full-scale sample peaks.');
  if(low>.68)warnings.push('Low-frequency energy is prominent. Check bass/kick balance by ear.');
  if(presence>.5)warnings.push('Presence energy is prominent. Check potential harshness by ear.');
  if(correlation!==null&&correlation<0)warnings.push('Some stereo content may weaken in mono.');
  return {bands,signal,correlation,lowShare:low,presenceShare:presence,warnings};
}
export function renderStereoQuickFix(channels,rate,{character='balanced',intensity=40}={}){
  if(!['balanced','punchy','warm','clean'].includes(character)||!Number.isFinite(intensity)||intensity<0||intensity>100)
    throw Error('Invalid Quick Fix processing settings.');
  const analysis=analyzeStereoQuickFix(channels,rate),scale=intensity/100;
  // Only changes backed by evidence; good stereo mixes may remain identical.
  const bassCut=analysis.lowShare>.56?-Math.min(2,(analysis.lowShare-.56)*8)*scale:0;
  const highCut=analysis.presenceShare>.44?-Math.min(1.5,(analysis.presenceShare-.44)*7)*scale:0;
  const warm=character==='warm'?.6*scale:0;
  const clean=character==='clean'?-.5*scale:0;
  const bands=[
    {type:'lowshelf',frequency:125,gain:Math.max(-2,bassCut+warm),q:.707,enabled:true},
    {type:'peaking',frequency:320,gain:clean,q:1.0,enabled:true},
    {type:'peaking',frequency:3300,gain:highCut,q:1,enabled:true}
  ];
  if(intensity===0)return {channels:channels.map(ch=>ch.slice()),analysis,changes:[],gainDb:0};
  const changes=bands.filter(x=>Math.abs(x.gain)>.02).map(x=>({
    frequency:x.frequency,gainDb:Math.round(x.gain*100)/100,
    explanation:'Conservative full-stereo tonal adjustment; instruments are not isolated.'
  }));
  const processed=changes.length?renderEqualizer(channels,rate,bands,0):channels.map(ch=>ch.slice());
  // No hidden normalization, aggressive limiting, or speculative stem changes.
  return {channels:processed,analysis,changes,gainDb:0};
}
