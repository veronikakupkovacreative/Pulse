// One immutable source and a bounded, reversible working history.
// AudioBuffers are never transferred to a remote service.
export function createAudioWorkspace({maxUndo=5}={}){
  let original=null,working=null,file=null,undo=[],redo=[];
  const listeners=new Set();
  const emit=()=>{for(const listener of listeners)listener(snapshot());};
  const snapshot=()=>({original,working,file,canUndo:undo.length>0,canRedo:redo.length>0,hasChanges:!!original&&working!==original});
  return {
    snapshot,
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    load(source,sourceFile){if(!source?.numberOfChannels||!source?.length)throw new Error('Invalid audio buffer.');original=source;working=source;file=sourceFile;undo=[];redo=[];emit();},
    apply(next){if(!original||!next?.length)throw new Error('No audio loaded.');undo.push(working);if(undo.length>maxUndo)undo.shift();working=next;redo=[];emit();},
    undo(){if(!undo.length)return false;redo.push(working);working=undo.pop();emit();return true;},
    redo(){if(!redo.length)return false;undo.push(working);working=redo.pop();emit();return true;},
    reset(){if(!original)return false;working=original;undo=[];redo=[];emit();return true;},
    clear(){original=null;working=null;file=null;undo=[];redo=[];emit();}
  };
}
