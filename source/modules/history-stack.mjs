const MiB=1024*1024;
export function estimateAudioBytes(buffer){if(!buffer||!Number.isFinite(buffer.length)||!Number.isFinite(buffer.numberOfChannels))return 0;return Math.max(0,Math.floor(buffer.length*buffer.numberOfChannels*4));}
export function defaultHistoryBudget(deviceMemory=globalThis.navigator?.deviceMemory){const memory=Number.isFinite(Number(deviceMemory))&&Number(deviceMemory)>0?Number(deviceMemory):4;return Math.min(256*MiB,Math.max(32*MiB,Math.round(memory*24*MiB)));}
export class HistoryStack{
 constructor({maxBytes=defaultHistoryBudget(),maxEntries=12}={}){this.maxBytes=Math.max(0,Number(maxBytes)||0);this.maxEntries=Math.max(1,Math.floor(Number(maxEntries)||12));this.undoEntries=[];this.redoEntries=[];this.retainedBytes=0;}
 push(before,after,label='Audio edit'){if(!before||!after||before===after)return false;this.redoEntries.length=0;const entry={before,after,label,createdAt:Date.now()};this.undoEntries.push(entry);this.prune(after);return this.undoEntries.includes(entry);}
 undo(current){const entry=this.undoEntries.pop();if(!entry)return null;this.redoEntries.push(entry);this.prune(entry.before);return entry.before;}
 redo(current){const entry=this.redoEntries.pop();if(!entry)return null;this.undoEntries.push(entry);this.prune(entry.after);return entry.after;}
 prune(current){while(this.undoEntries.length+this.redoEntries.length>this.maxEntries){if(this.undoEntries.length)this.undoEntries.shift();else this.redoEntries.shift();}this.recount(current);while(this.retainedBytes>this.maxBytes&&(this.undoEntries.length||this.redoEntries.length)){if(this.undoEntries.length)this.undoEntries.shift();else this.redoEntries.shift();this.recount(current);}}
 recount(current){const buffers=new Set();for(const entry of [...this.undoEntries,...this.redoEntries]){if(entry.before&&entry.before!==current)buffers.add(entry.before);if(entry.after&&entry.after!==current)buffers.add(entry.after);}let total=0;for(const buffer of buffers)total+=estimateAudioBytes(buffer);this.retainedBytes=total;return total;}
 clear(){this.undoEntries.length=0;this.redoEntries.length=0;this.retainedBytes=0;}
 get canUndo(){return this.undoEntries.length>0;}
 get canRedo(){return this.redoEntries.length>0;}
}