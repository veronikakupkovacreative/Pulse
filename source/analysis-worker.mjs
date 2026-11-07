import {analyzeSong} from './song-analyzer.mjs';
self.onmessage = ({data}) => {
  try { self.postMessage({result:analyzeSong(data.samples,data.sampleRate)}); }
  catch(error) { self.postMessage({error:error.message}); }
};
