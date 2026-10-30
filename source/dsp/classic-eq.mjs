// Character presets built from real parametric filters, not emulations of specific hardware.
import {EQ_DEFAULT_BANDS} from './parametric-eq.mjs';
const clone=()=>EQ_DEFAULT_BANDS.map(b=>({...b,enabled:true,gain:0}));
export const CLASSIC_EQ_MODES=Object.freeze({
  'classic-warm':{name:'Classic Warm',description:'Broad bass warmth with gently softened upper mids.',
    bands:[{i:0,type:'highpass',frequency:28},{i:1,type:'lowshelf',frequency:140,gain:1.7},
      {i:2,type:'peaking',frequency:320,gain:-.8,q:.7},{i:5,type:'peaking',frequency:3400,gain:-.7,q:.8},
      {i:7,type:'highshelf',frequency:10500,gain:.4}]},
  'classic-presence':{name:'Classic Presence',description:'Midrange clarity and restrained vocal-forward presence.',
    bands:[{i:0,type:'highpass',frequency:55},{i:2,type:'peaking',frequency:290,gain:-1.4,q:.9},
      {i:4,type:'peaking',frequency:2100,gain:1.4,q:.9},
      {i:5,type:'peaking',frequency:4100,gain:.8,q:.9},
      {i:7,type:'highshelf',frequency:11000,gain:.4}]},
  'classic-air':{name:'Classic Air',description:'Gentle shelf lift above 10 kHz with low-mid restraint.',
    bands:[{i:0,type:'highpass',frequency:38},{i:2,type:'peaking',frequency:330,gain:-.8,q:.75},
      {i:5,type:'peaking',frequency:4800,gain:.6,q:1},
      {i:7,type:'highshelf',frequency:10500,gain:2.1}]},
  'classic-tight':{name:'Classic Tight',description:'Controlled sub-bass with a focused low end and clean upper mids.',
    bands:[{i:0,type:'highpass',frequency:34},{i:1,type:'lowshelf',frequency:85,gain:-1.3},
      {i:2,type:'peaking',frequency:235,gain:-1.7,q:1.1},
      {i:4,type:'peaking',frequency:1850,gain:.55,q:1.2},
      {i:7,type:'highshelf',frequency:9000,gain:.3}]}
});
export function classicEqBands(name){
  const mode=CLASSIC_EQ_MODES[name];
  if(!mode)throw Error('Unknown classic EQ mode.');
  const bands=clone();
  for(const {i,...settings} of mode.bands)Object.assign(bands[i],settings);
  return bands;
}
