// One immutable source and a bounded, reversible working history.
// AudioBuffers are never transferred to a remote service.
export function createAudioWorkspace({maxUndo=5}={}){
  let original=null,working=null,file=null,metadata=null,bpm=0,beatOffset=0,undo=[],redo=[];
  const listeners=new Set();
  const emit=()=>{for(const listener of listeners)listener(snapshot());};
  const snapshot=()=>({original,working,file,metadata,bpm,beatOffset,canUndo:undo.length>0,canRedo:redo.length>0,hasChanges:!!original&&working!==original});
  return {
    snapshot,
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    load(source,sourceFile,sourceMetadata=null){if(!source?.numberOfChannels||!source?.length)throw new Error('Invalid audio buffer.');original=source;working=source;file=sourceFile;metadata=sourceMetadata;bpm=0;beatOffset=0;undo=[];redo=[];emit();},
    setTempo(nextBpm,offset=0){if(!Number.isFinite(nextBpm)||nextBpm<20||nextBpm>400)throw new Error('Invalid BPM.');bpm=nextBpm;beatOffset=Number.isFinite(offset)?offset:0;emit();},
    apply(next){if(!original||!next?.length)throw new Error('Nemáš načtený žádný výsledek.');undo.push(working);if(undo.length>maxUndo)undo.shift();working=next;redo=[];emit();},
    undo(){if(!undo.length)return false;redo.push(working);working=undo.pop();emit();return true;},
    redo(){if(!redo.length)return false;undo.push(working);working=redo.pop();emit();return true;},
    reset(){if(!original)return false;working=original;undo=[];redo=[];emit();return true;},
    clear(){original=null;working=null;file=null;metadata=null;bpm=0;beatOffset=0;undo=[];redo=[];emit();}
  };
}

// Shared authoritative source and non-destructive edit history for all tools.
export const sharedAudioWorkspace=createAudioWorkspace({maxUndo:4});
