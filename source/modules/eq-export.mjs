import {encodeWav} from './dsp.mjs';
/** Encode the rendered EQ audio directly, without committing or mastering it again. */
export function createEqWav(buffer,bits=24){
 if(![16,24].includes(bits))throw Error('EQ export supports 16 or 24-bit WAV.');
 return encodeWav(buffer,bits);
}
export function downloadEqWav(buffer,baseName='pulse-audio',tag='eq'){
 const blob=createEqWav(buffer,24);
 const safeName=String(baseName).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'pulse-audio';
 const safeTag=String(tag).replace(/[^a-z0-9_-]+/gi,'-').slice(0,40)||'eq';
 const filename=safeName+'-'+safeTag+'-24bit.wav';
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;link.style.display='none';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 return {filename,bytes:blob.size};
}
