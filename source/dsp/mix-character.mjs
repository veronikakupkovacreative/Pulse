// Local, deterministic character DSP. Never mutates source audio or uploads samples.
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
export function processMixCharacter(channels,rate,{type='tube',drive=35,tone=0,blend=40,bypass=false,tapeNoise=false}={}){
  if(!['tube','console','tape','crush'].includes(type)||
    !Number.isFinite(rate)||rate<8000||rate>192000||
    ![drive,tone,blend].every(Number.isFinite)||
    drive<0||drive>100||tone< -100||tone>100||blend<0||blend>100)throw Error('Invalid Mix Character settings.');
  if(!channels?.length||channels.length>2||
    channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length))throw Error('Invalid source audio.');
  if(bypass||drive===0||blend===0)return channels.map(c=>c.slice());
  const strength=drive/100,wet=blend/100,tilt=tone/100;
  const driveGain=1+strength*(type==='crush'?10:type==='console'?6:4);
  const cutoff=type==='tape'?clamp(14000-6500*strength+tilt*4000,2500,18500):clamp(1600+tilt*1200,350,4000);
  const pole=1-Math.exp(-2*Math.PI*cutoff/rate);
  return channels.map((source,ch)=>{
    const result=new Float32Array(source.length);
    let low=0,dc=0,dcPrevious=0,seed=1234567+ch*9871;
    for(let i=0;i<source.length;i++){
      const dry=Number.isFinite(source[i])?source[i]:0;
      let x=dry;
      if(type==='tape'){
        // Small, correlated wow/flutter. No channel-dependent drift.
        const offset=(.65*Math.sin(2*Math.PI*i*.72/rate)+.22*Math.sin(2*Math.PI*i*6.2/rate))*strength;
        const position=clamp(i-offset,0,source.length-1),a=Math.floor(position),fract=position-a;
        x=(source[a]||0)*(1-fract)+(source[Math.min(a+1,source.length-1)]||0)*fract;
      }
      const v=x*driveGain;
      let shaped;
      if(type==='tube'){
        const bias=.22*strength;
        shaped=(Math.tanh(v*.88+bias)-Math.tanh(bias))/.88/driveGain;
      }else if(type==='console'){
        shaped=(Math.atan(v*1.65)/1.65+Math.sin(v*.75)*.10*strength)/driveGain;
      }else if(type==='tape'){
        // Soft-knee saturation with modest dynamic compression.
        shaped=Math.tanh(v*.9)/(.9*driveGain);
      }else{
        // Diode-style asymmetric clipping followed by drive-dependent bit crush.
        const positive=.55-.14*strength,negative=.73-.2*strength;
        const clipped=clamp(v,-negative,positive);
        const steps=Math.max(20,256-Math.round(220*strength));
        shaped=Math.round(clipped*steps)/steps/driveGain;
      }
      low+=pole*(shaped-low);
      const high=shaped-low;
      const colored=(type==='tape'?low:shaped)+(tilt*.55*high);
      let noise=0;
      if(type==='tape'&&tapeNoise){
        seed=(Math.imul(1664525,seed)+1013904223)>>>0;
        noise=((seed/4294967296)*2-1)*.0013*strength;
      }
      // Eliminate DC produced by asymmetric clipping.
      const filtered=colored+noise-dcPrevious+.995*dc;
      dcPrevious=colored+noise;dc=filtered;
      const mixed=dry*(1-wet)+filtered*wet;
      result[i]=clamp(mixed,-.999,.999);
    }
    return result;
  });
}
