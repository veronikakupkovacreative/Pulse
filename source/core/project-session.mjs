import {createAudioWorkspace} from './audio-workspace.mjs';

// Single authoritative source and working history for BPM Analyzer and Toolkit.
// Source AudioBuffer is never mutated; analysis workers receive independent copies.
export function createPulseProject({maxUndo=4}={}){
  const workspace=createAudioWorkspace({maxUndo});
  const listeners=new Set();
  let bpm=null,offset=0,confirmed=false,revision=0,source='none';
  const snapshot=()=>({...workspace.snapshot(),bpm,beatOffset:offset,confirmed,revision,source});
  const notify=(type,origin)=>{const state=snapshot();for(const cb of listeners)cb({type,origin,state});};
  return {
    workspace,snapshot,
    subscribe(callback){listeners.add(callback);return ()=>listeners.delete(callback);},
    load(buffer,file,origin='external'){
      workspace.load(buffer,file);bpm=null;offset=0;confirmed=false;revision++;source=origin;
      notify('load',origin);
      return snapshot();
    },
    setTempo(value,{beatOffset=0,confirmed:isConfirmed=false,origin='external'}={}){
      const n=Number(value);
      if(!Number.isFinite(n)||n<20||n>400)throw Error('Tempo must be between 20 and 400 BPM.');
      bpm=Math.round(n*10)/10;offset=Number.isFinite(beatOffset)?Math.max(0,beatOffset):0;
      confirmed=Boolean(isConfirmed);notify('tempo',origin);return snapshot();
    },
    clear(origin='external'){workspace.clear();bpm=null;offset=0;confirmed=false;revision++;source='none';notify('clear',origin);}
  };
}
export const pulseProject=createPulseProject({
  maxUndo:typeof navigator!=='undefined'&&/iPhone|iPad|Android/i.test(navigator.userAgent)?2:4
});
