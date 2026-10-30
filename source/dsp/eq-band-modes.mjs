import {EQ_DEFAULT_BANDS} from './parametric-eq.mjs';
const SIZES=new Set([3,8,10,20]);
export function makeEqBands(size=8){
  if(!SIZES.has(size))throw Error('EQ supports 3, 8, 10, or 20 bands.');
  if(size===8)return EQ_DEFAULT_BANDS.map(b=>({...b}));
  if(size===3)return [
    {type:'lowshelf',frequency:115,gain:0,q:.707,enabled:true},
    {type:'peaking',frequency:1100,gain:0,q:1,enabled:true},
    {type:'highshelf',frequency:8000,gain:0,q:.707,enabled:true}
  ];
  // Even spacing on a logarithmic scale: equally useful control across octaves.
  return Array.from({length:size},(_,i)=>({
    type:i===0?'lowshelf':i===size-1?'highshelf':'peaking',
    frequency:Math.round(35*(14500/35)**(i/(size-1))),
    gain:0,q:1,enabled:true
  }));
}
export function selectClosestBand(bands,hz){
  if(!bands.length||!Number.isFinite(hz)||hz<=0)return -1;
  return bands.reduce((best,b,i)=>Math.abs(Math.log(b.frequency/hz))<
      Math.abs(Math.log(bands[best].frequency/hz))?i:best,0);
}
