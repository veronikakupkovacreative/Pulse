import {analyzeTempo} from './analyzer.mjs';
self.onmessage = ({data}) => {
  try { self.postMessage({result:analyzeTempo(data.samples,data.sampleRate)}); }
  catch(error) { self.postMessage({error:error.message}); }
};
