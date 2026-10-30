// Shared non-destructive audio analysis selections and tuning math.
const harmonicClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const PITCH_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function analysisRange(mode,duration,playhead=0,loopFrom=0,loopTo=0,loopEnabled=false,seconds=8,minDuration=.13){
  if(!Number.isFinite(duration)||duration<minDuration)throw Error('Audio is too short for this analysis.');
  let from=0,to=duration,label='Full track';
  if(mode==='cursor'){
    from=harmonicClamp(Number(playhead)||0,0,Math.max(0,duration-seconds));
    to=Math.min(duration,from+seconds);
    label='Od playheadu';
  }else if(mode==='loop'){
    if(!loopEnabled||loopTo-loopFrom<minDuration)throw Error('Enable LOOP and select a sufficiently long IN/OUT region first.');
    from=harmonicClamp(loopFrom,0,duration);to=harmonicClamp(loopTo,from,duration);
    label='Active loop';
  }else if(mode!=='full')throw Error('Unknown analysis mode.');
  if(to-from<minDuration)throw Error('Selected region is too short for analysis.');
  return {from,to,label};
}

export function midiLabel(midi){
  if(!Number.isInteger(midi)||midi<0||midi>127)throw Error('Invalid MIDI note.');
  return `${PITCH_NAMES[midi%12]}${Math.floor(midi/12)-1}`;
}

export function tuningCorrection(detectedMidi,detectedCents,targetMidi){
  if(!Number.isInteger(detectedMidi)||!Number.isInteger(targetMidi)||!Number.isFinite(detectedCents))throw Error('Invalid tuning values.');
  const semitones=targetMidi-detectedMidi;
  if(Math.abs(semitones)>12)throw Error('Tuning is outside the ±12-semitone range.');
  return {semitones,cents:harmonicClamp(Math.round(-detectedCents),-100,100)};
}
