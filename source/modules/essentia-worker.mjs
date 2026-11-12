/** Classic Web Worker for AGPL-3.0 Essentia.js WASM runtime.
 * Separate Worker instances handle independent rhythm and harmony tasks.
 * importScripts loads pinned same-origin artifacts only (no remote CDN).
 */
let runtime=null,busy=false;
async function getRuntime(){
 if(runtime)return runtime;
 if(typeof importScripts!=='function')throw Error('Classic Web Workers are required for Essentia WASM.');
 importScripts('/vendor/essentia/essentia-wasm.web.js',
   '/vendor/essentia/essentia.js-core.umd.js');
 const module=await self.EssentiaWASM;
 const Core=self.Essentia;
 if(!module?.EssentiaJS||typeof Core!=='function')throw Error('Essentia WebAssembly failed to initialize.');
 const algorithms=await import('/modules/essentia-algorithms.mjs');
 runtime={module,Essentia:new Core(module),algorithms};
 return runtime;
}
self.onmessage=async({data})=>{
 if(data?.type!=='analyze'||typeof data.id!=='string')return;
 if(busy){self.postMessage({type:'error',id:data.id,error:'Essentia worker is busy.'});return;}
 busy=true;
 try{
  const {module,Essentia,algorithms}=await getRuntime();
  const channels=(data.channels||[]).map(b=>new Float32Array(b));
  const sampleRate=Number(data.sampleRate),offset=Number(data.offset)||0;
  if(!['rhythm','harmony'].includes(data.mode))throw Error('Invalid Essentia analysis mode.');
  if(!Number.isFinite(offset)||offset<0||!Number.isFinite(sampleRate))
   throw Error('Invalid analysis position.');
  self.postMessage({type:'progress',id:data.id,progress:10});
  const result=data.mode==='rhythm'?
   algorithms.analyzeEssentiaRhythm(Essentia,channels,sampleRate,offset):
   algorithms.analyzeEssentiaHarmony(Essentia,module,channels,sampleRate,data.beatTimes||[],offset);
  self.postMessage({type:'progress',id:data.id,progress:100});
  self.postMessage({type:'done',id:data.id,result});
 }catch(error){
  self.postMessage({type:'error',id:data.id,error:error?.message||'Essentia WASM analysis failed.'});
 }finally{busy=false;}
};
