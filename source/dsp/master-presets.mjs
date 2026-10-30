// PULSE Master characters: predictable starting points for transparent local DSP.
// All presets expose their actual values; the user can override any parameter.
export const PULSE_MASTER_PRESETS=Object.freeze({
  balanced:{label:'Balanced',description:'Clean, natural overall balance. General-purpose mastering.',
    targetLufs:-13,ceilingDb:-1,intensity:45,stereoWidth:1,eqMode:'gentle',dynamicsMode:'balanced',lowBias:0,highBias:0,ratioBias:0,thresholdOffset:0},
  warm:{label:'Warm',description:'Fuller lows and softer top end with gentle compression.',
    targetLufs:-14,ceilingDb:-1,intensity:55,stereoWidth:1.03,eqMode:'gentle',dynamicsMode:'balanced',lowBias:.65,highBias:-.8,ratioBias:0,thresholdOffset:0},
  loud:{label:'Loud',description:'Higher perceived level with firmer peak and dynamics control.',
    targetLufs:-10,ceilingDb:-1,intensity:80,stereoWidth:1,eqMode:'gentle',dynamicsMode:'control',lowBias:.2,highBias:.22,ratioBias:.35,thresholdOffset:-.5},
  punchy:{label:'Punchy',description:'Preserves attacks and impact in drums and transients.',
    targetLufs:-12,ceilingDb:-1,intensity:60,stereoWidth:1,eqMode:'gentle',dynamicsMode:'preserve',lowBias:-.25,highBias:.12,ratioBias:-.16,thresholdOffset:1.5},
  transparent:{label:'Transparent',description:'Minimal coloration, conservative dynamics and original stereo width.',
    targetLufs:-14,ceilingDb:-1,intensity:25,stereoWidth:1,eqMode:'off',dynamicsMode:'preserve',lowBias:0,highBias:0,ratioBias:-.18,thresholdOffset:1},
  streaming:{label:'Streaming',description:'Moderate level with controlled peaks for common online playback.',
    targetLufs:-14,ceilingDb:-1,intensity:48,stereoWidth:1,eqMode:'gentle',dynamicsMode:'balanced',lowBias:0,highBias:.1,ratioBias:.05,thresholdOffset:0},
  club:{label:'Club',description:'Extra low-end weight, brighter highs and firmer dynamics.',
    targetLufs:-10,ceilingDb:-1,intensity:78,stereoWidth:1.1,eqMode:'gentle',dynamicsMode:'control',lowBias:.55,highBias:.4,ratioBias:.25,thresholdOffset:-1},
  vocal:{label:'Vocal',description:'Controlled bass and clear vocal presence without harshness.',
    targetLufs:-14,ceilingDb:-1,intensity:50,stereoWidth:1,eqMode:'gentle',dynamicsMode:'balanced',lowBias:-.38,highBias:.48,ratioBias:-.04,thresholdOffset:.5}
});
export const PULSE_MASTER_PRESET_KEYS=Object.freeze(Object.keys(PULSE_MASTER_PRESETS));
export function getMasterPreset(key){
  const preset=PULSE_MASTER_PRESETS[key];
  if(!preset)throw Error('Invalid mastering preset.');
  return preset;
}
