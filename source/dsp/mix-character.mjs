// Subtle, bounded soft-saturation. All paths are local and non-destructive.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function processMixCharacter(channels,rate,{type='tube',drive=35,tone=0,blend=40}={}){
 if(!['tube','console','tape','crush'].includes(type)||!Number.isFinite(rate)||rate<8000||rate>192000||
 !Number.isFinite(drive)||drive<0||drive>100||!Number.isFinite(tone)||tone< -100||tone>100||!Number.isFinite(blend)||blend<0||blend>100)throw Error('Invalid Mix Character settings.');
 if(!channels?.length||channels.length>2||channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length))throw Error('Invalid source audio.');
 if(drive===0||blend===0)return channels.map(c=>c.slice());
 const wet=blend/100,strength=drive/100,cutoff=clamp(8000+tone*85,1000,16000),alpha=1-Math.exp(-2*Math.PI*cutoff/rate);
 return channels.map(source=>{
  const result=new Float32Array(source.length);let lp=0;
  for(let i=0;i<source.length;i++){
   const dry=source[i],driveGain=1+strength*(type==='crush'?8:4),input=dry*driveGain;
   let shaped;
   if(type==='tube')shaped=(Math.tanh(input+.1*strength)-Math.tanh(.1*strength))/driveGain;
   else if(type==='console')shaped=Math.atan(input*1.55)/Math.atan(1.55*driveGain);
   else if(type==='tape')shaped=Math.tanh(input*.85)/(driveGain*.85);
   else shaped=clamp(input,-.55,.55)/driveGain;
   lp+=alpha*(shaped-lp);
   const colored=type==='tape'?lp:shaped+(lp-shaped)*(.25-tone/500);
   result[i]=clamp(dry*(1-wet)+colored*wet,-1,1);
  }
  return result;
 });
}
