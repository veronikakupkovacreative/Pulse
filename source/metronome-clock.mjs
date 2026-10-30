// Pure beat-grid arithmetic used by the Web Audio metronome scheduler.
export function beatAtOrAfter(position,bpm,offset=0,meter=4){
  if(!Number.isFinite(position)||!Number.isFinite(bpm)||bpm<20||bpm>400||
     !Number.isFinite(offset)||![3,4,5,6].includes(meter))throw Error('Invalid metronome grid.');
  const period=60/bpm;
  const index=Math.ceil((position-offset)/period-1e-9);
  const seconds=offset+index*period;
  const beatInBar=((index%meter)+meter)%meter;
  return {seconds,index,beatInBar,accent:beatInBar===0,period};
}
export function beatTimeline(position,bpm,offset,meter,count=8){
  const first=beatAtOrAfter(position,bpm,offset,meter);
  return Array.from({length:count},(_,i)=>{
    const index=first.index+i,beatInBar=((index%meter)+meter)%meter;
    return {seconds:offset+index*first.period,index,beatInBar,accent:beatInBar===0};
  });
}
