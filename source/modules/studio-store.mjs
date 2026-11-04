import {workspace} from './workspace.mjs';
const listeners=new Set();
let state=Object.freeze({track:null,activeCategory:'analyze',activeModule:'rhythm',selection:null,beatMarkers:[],transport:{playing:false,position:0},history:{canUndo:false,canRedo:false,retainedBytes:0,maxBytes:0}});
function publish(patch){state=Object.freeze({...state,...patch});for(const listener of [...listeners])listener();}
function syncWorkspace(snapshot){publish({track:snapshot.track,selection:snapshot.selection,beatMarkers:snapshot.beatMarkers,transport:{playing:snapshot.playing,position:snapshot.position},history:snapshot.history});}
workspace.subscribe(syncWorkspace);syncWorkspace(workspace.getSnapshot());
export const studioStore=Object.freeze({getState:()=>state,subscribe(listener){if(typeof listener!=='function')throw new TypeError('A store listener is required.');listeners.add(listener);return()=>listeners.delete(listener);},setActiveCategory(activeCategory){if(state.activeCategory!==activeCategory)publish({activeCategory});},setActiveModule(activeModule){if(state.activeModule!==activeModule)publish({activeModule});}});