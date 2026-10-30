import {makeEqBands} from './eq-band-modes.mjs';

// Gentle musical EQ curves, not measured responses or copies of another editor.
// Control points are [frequency Hz, target dB] on a logarithmic frequency axis.
export const PULSE_EQ_PRESETS=Object.freeze({
  default:{label:'Default',description:'Flat response. No tonal processing.',points:[[20,0],[20000,0]]},
  'voice-clarity':{label:'Voice Clarity',description:'Less mud around 250–450 Hz, intelligibility near 3 kHz.',points:[[20,-2],[90,-1.5],[250,-2],[450,-1.8],[1200,.6],[2800,2.8],[5000,1.4],[12000,.6],[20000,0]]},
  podcast:{label:'Podcast',description:'Controlled low end and focused spoken-word presence.',points:[[20,-3],[80,-2.2],[180,-.8],[360,-2.1],[1000,.4],[3000,2.3],[5500,1.3],[11000,.3],[20000,0]]},
  'bass-focus':{label:'Bass Focus',description:'Adds low-end weight without excess low-mid buildup.',points:[[20,1.3],[65,3.6],[130,2.4],[260,.3],[450,-1.4],[1100,-.3],[5000,.3],[20000,0]]},
  'full-bass':{label:'Full Bass',description:'Wide bass lift for a fuller, warmer sound.',points:[[20,2],[55,4.6],[110,4],[240,1.9],[500,-.4],[2500,-.1],[9000,.4],[20000,0]]},
  bright:{label:'Bright',description:'Opens the upper mids and high frequencies.',points:[[20,0],[180,-.3],[600,-.6],[2500,.9],[4800,2],[8500,3.1],[14000,2.1],[20000,1.2]]},
  warm:{label:'Warm',description:'Gentle low-mid lift with smooth upper frequencies.',points:[[20,.4],[110,2.5],[320,1.5],[950,.3],[2800,-.6],[6500,-1.1],[14000,-.8],[20000,-.5]]},
  soft:{label:'Soft',description:'Reduces hard presence and brittle treble.',points:[[20,0],[150,.4],[750,0],[1800,-.4],[3600,-1.6],[7000,-2.5],[12000,-2],[20000,-1.4]]},
  club:{label:'Club',description:'Dance-oriented low and high energy, restrained mids.',points:[[20,1],[65,3.5],[145,1.5],[550,-1.7],[1500,-1],[3800,.4],[8500,2.9],[14000,2.1],[20000,1]]},
  rock:{label:'Rock',description:'Defined bass, scooped low mids and guitar presence.',points:[[20,.4],[95,2.5],[240,.6],[490,-1.7],[1100,.4],[3200,2.5],[5800,1.3],[10000,.8],[20000,.2]]}
});
export const PULSE_EQ_PRESET_KEYS=Object.freeze(['default','custom','voice-clarity','podcast','bass-focus','full-bass','bright','warm','soft','club','rock']);
function samplePreset(points,frequency){
  const hz=Math.max(20,Math.min(20000,frequency));
  for(let i=1;i<points.length;i++){
    if(hz<=points[i][0]){
      const [from,level]=points[i-1],[to,end]=points[i];
      const t=Math.log(hz/from)/Math.log(to/from);
      const smooth=t*t*(3-2*t);
      return level+(end-level)*smooth;
    }
  }
  return points[points.length-1][1];
}
export function makeNamedEqPreset(key,size=20){
  const spec=PULSE_EQ_PRESETS[key];
  if(!spec)throw Error('Unknown EQ preset: '+key);
  const bands=makeEqBands(size);
  // Neighboring bell filters overlap. Scale each band for safe summed gain.
  const factor=size===20?.39:size===10?.68:size===8?.76:1;
  return bands.map((b,i)=>{
    const gain=spec.points.every(p=>p[1]===0)?0:samplePreset(spec.points,b.frequency)*factor;
    return {...b,enabled:true,q:size===20&&i!==0&&i!==size-1?2.35:size===10&&i!==0&&i!==size-1?1.55:b.q,
      gain:Math.round(Math.max(-12,Math.min(12,gain))*10)/10};
  });
}
