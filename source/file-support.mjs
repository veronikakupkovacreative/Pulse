// Shared browser upload validation. Files.app may return M4A or a MIME-only filename.
const supportedExtension=/\.(?:wav|wave|mp3|mp4|m4a|aac|aiff|aif|caf|flac|ogg)$/i;
const supportedMime=/^(?:audio\/[a-z0-9.+-]+|video\/mp4)$/i;
export function audioFileError(file, maxBytes=100*1024*1024){
  if(!file)return 'Select an audio file.';
  if(!Number.isFinite(file.size)||file.size===0)return 'This file is empty or not available offline. Save it to Files and retry.';
  if(file.size>maxBytes)return 'File exceeds 100 MB. Choose a smaller file.';
  const name=typeof file.name==='string'?file.name:'';
  const type=typeof file.type==='string'?file.type.toLowerCase():'';
  if(!supportedExtension.test(name)&&!supportedMime.test(type))return 'Unsupported format. Choose WAV, MP3, M4A, AAC or MP4 audio.';
  return null;
}
