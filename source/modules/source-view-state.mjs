// Display-only file metadata; no modifications to audio samples or playback.
export function clock(seconds){
 const t=Math.max(0,Number(seconds)||0),whole=Math.floor(t);
 const minutes=Math.floor(whole/60),s=whole%60,centiseconds=Math.floor((t-whole)*100);
 return String(minutes).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(centiseconds).padStart(2,'0');
}
export function sourceDisplay(buffer,{name='',size=0}={}){
 if(!buffer)return {loaded:false,title:'',format:'',details:'',duration:''};
 const title=String(name||'Untitled audio').trim()||'Untitled audio';
 const suffix=title.includes('.')?title.split('.').pop().toUpperCase():'AUDIO';
 const format=/^[A-Z0-9]{2,5}$/.test(suffix)?suffix:'AUDIO';
 const fileSize=Number(size)>0?(Number(size)/1048576).toFixed(1)+' MB · ':'';
 const sampleRate=(buffer.sampleRate/1000).toFixed(1)+' kHz';
 return {loaded:true,title,format,details:clock(buffer.duration).replace(/\.\d\d$/,'')+' · '+fileSize+buffer.numberOfChannels+' ch · '+sampleRate,duration:clock(buffer.duration)};
}
