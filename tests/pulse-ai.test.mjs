import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import handler from '../api/pulse-ai.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
class MockResponse {
  constructor(){this.statusCode=200;this.headers={};this.body=null}
  setHeader(key,value){this.headers[key.toLowerCase()]=value;return this}
  status(code){this.statusCode=code;return this}
  json(body){this.body=body;return this}
  send(body){this.body=body;return this}
}
const token='strong-private-test-token';
const MP3='a'.repeat(1024); // uploaded test bytes, provider mocked before decoding
const audioBase64=Buffer.from(MP3).toString('base64');
const req=(body,access=token)=>({method:'POST',headers:{'x-pulse-access':access,host:'pulse.example',origin:'https://pulse.example'},body});
const withServer=async (mockFetch,fn)=>{
  const previousKey=process.env.ELEVENLABS_API_KEY,previousGate=process.env.PULSE_AI_GATE_TOKEN;
  const fetchBefore=globalThis.fetch;
  process.env.ELEVENLABS_API_KEY='fake-elevenlabs-key';process.env.PULSE_AI_GATE_TOKEN=token;
  globalThis.fetch=mockFetch;
  try{return await fn()}finally{
    globalThis.fetch=fetchBefore;
    if(previousKey===undefined)delete process.env.ELEVENLABS_API_KEY;else process.env.ELEVENLABS_API_KEY=previousKey;
    if(previousGate===undefined)delete process.env.PULSE_AI_GATE_TOKEN;else process.env.PULSE_AI_GATE_TOKEN=previousGate;
  }
};

test('server refuses missing credentials, unrelated methods and invalid tokens',async()=>{
  const res=new MockResponse();
  await handler({method:'GET',headers:{},body:{}},res);
  assert.equal(res.statusCode,405);
  await withServer(async()=>{throw Error('Never call provider');},async()=>{
    const bad=new MockResponse();await handler(req({action:'speak'},'incorrect'),bad);assert.equal(bad.statusCode,401);
    const cross=new MockResponse();await handler({...req({action:'speak'}),headers:{'x-pulse-access':token,host:'pulse.example',origin:'https://evil.example'}},cross);
    assert.equal(cross.statusCode,403);
  });
});

test('voice clone requires consent and rejects oversized uploads',async()=>{
  await withServer(async()=>{throw Error('Provider must not be called');},async()=>{
    const base={action:'clone',name:'Authorized Voice',filename:'clean.mp3',mime:'audio/mpeg',audioBase64};
    const missing=new MockResponse();await handler(req(base),missing);
    assert.equal(missing.statusCode,400);
    const over=new MockResponse();await handler(req({...base,consent:true,audioBase64:'A'.repeat(4_000_000)}),over);
    assert.equal(over.statusCode,400);
    const unsupported=new MockResponse();await handler(req({...base,consent:true,filename:'sample.exe'}),unsupported);
    assert.equal(unsupported.statusCode,400);
  });
});

test('clone proxies only to fixed ElevenLabs endpoint with key and multipart voice sample',async()=>{
  let captured;
  await withServer(async(url,opts)=>{
    captured={url,opts};return new Response(JSON.stringify({voice_id:'CLONEabcdef123456',requires_verification:false}),{status:200,headers:{'content-type':'application/json'}});
  },async()=>{
    const out=new MockResponse();
    await handler(req({action:'clone',consent:true,name:'My Voice',filename:'sample.mp3',mime:'audio/mpeg',audioBase64}),out);
    assert.equal(out.statusCode,200);assert.equal(out.body.voice_id,'CLONEabcdef123456');
  });
  assert.equal(captured.url,'https://api.elevenlabs.io/v1/voices/add');
  assert.equal(captured.opts.headers['xi-api-key'],'fake-elevenlabs-key');
  assert.equal(captured.opts.body.get('name'),'My Voice');
  assert.equal(captured.opts.body.get('files').size,1024);
});

test('voice isolation and text-to-speech return binary audio',async()=>{
  const calls=[];
  await withServer(async(url,opts)=>{
    calls.push({url,opts});return new Response(new Uint8Array([1,2,3,4]),{status:200,headers:{'content-type':'audio/wav'}});
  },async()=>{
    const isolated=new MockResponse();await handler(req({action:'isolate',filename:'sample.mp3',mime:'audio/mpeg',audioBase64}),isolated);
    assert.equal(isolated.statusCode,200);assert.deepEqual([...isolated.body],[1,2,3,4]);
    const speech=new MockResponse();await handler(req({action:'speak',voiceId:'CLONEabcdef123456',text:'Hello world!'}),speech);
    assert.equal(speech.statusCode,200);assert.equal(speech.headers['content-type'],'audio/mpeg');
  });
  assert.equal(calls[0].url,'https://api.elevenlabs.io/v1/audio-isolation');
  assert.ok(calls[1].url.endsWith('CLONEabcdef123456?output_format=mp3_44100_128'));
  assert.equal(JSON.parse(calls[1].opts.body).model_id,'eleven_multilingual_v2');
});

test('voice deletion uses only restricted identifier path',async()=>{
  let url;
  await withServer(async(u)=>{url=u;return new Response(JSON.stringify({status:'ok'}),{status:200});},async()=>{
    const out=new MockResponse();await handler(req({action:'delete',voiceId:'CLONEabcdef123456'}),out);
    assert.equal(out.statusCode,200);assert.equal(out.body.deleted,true);
    const bad=new MockResponse();await handler(req({action:'delete',voiceId:'../../evil'}),bad);
    assert.equal(bad.statusCode,400);
  });
  assert.equal(url,'https://api.elevenlabs.io/v1/voices/CLONEabcdef123456');
});

test('module registers three AI tools, preserving renderer code for future release',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pulse-ai-test-'));
  try{
    await writeFile(join(dir,'package.json'),JSON.stringify({type:'module'}));
    await writeFile(join(dir,'workspace.mjs'),'export const workspace={source:null,buffer:null};\n');
    await writeFile(join(dir,'music-tagger.mjs'),'export const makeCloudTaggingExcerpt=()=>({file:{name:"clip.wav",base64:""}});\n');
    await copyFile(join(root,'source/modules/pulse-ai-master.mjs'),join(dir,'pulse-ai-master.mjs'));
    const mod=await import(pathToFileURL(join(dir,'pulse-ai-master.mjs')).href);
    assert.deepEqual(mod.pulseAiModules.map(m=>m.id),['ai-voice-cleaner','ai-speech-enhancer','ai-voice-cloning']);
    assert.deepEqual(mod.pulseAiModules.map(m=>m.category),['ai','ai','ai']);
    const ops=[];
    const g={fillRect:(...a)=>ops.push(['fillRect',a]),beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},save(){},restore(){}};
    const canvas={width:640,height:360,getContext:()=>g};
    for(const mode of ['radial','spectrum','mirror','oscilloscope','vectorscope','particles']){
      mod.renderPulseFrame(canvas,{mode,bars:48,fftSize:2048,sensitivity:1.2,low:30,high:10000},{
        freq:new Uint8Array(1024).fill(80),wave:new Uint8Array(2048).fill(128),left:new Uint8Array(2048).fill(120),right:new Uint8Array(2048).fill(140)
      });
    }
    assert.ok(ops.length>100,'Renderer produced drawing commands for six modes');
  }finally{await rm(dir,{recursive:true,force:true})}
});

test('installer adds module import and registration only once',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pulse-install-test-'));
  try{
    await mkdir(join(dir,'source/modules'),{recursive:true});await mkdir(join(dir,'api'),{recursive:true});
    await writeFile(join(dir,'package.json'),JSON.stringify({type:'module'}));
    await writeFile(join(dir,'source/modules/features.mjs'),"import {creativeModules} from './creative-tools.mjs';\nexport const toolModules=Object.freeze([...creativeModules]);\n");
    await writeFile(join(dir,'source/modules/pulse-ai-master.mjs'),'export const pulseAiModules=[];\n');
    await writeFile(join(dir,'api/pulse-ai.js'),'export default ()=>{};\n');
    const {spawnSync}=await import('node:child_process');
    const installer=join(root,'scripts/install-pulse-ai.mjs');
    for(let repeat=0;repeat<2;repeat++){
      const run=spawnSync(process.execPath,[installer],{cwd:dir,encoding:'utf8'});
      assert.equal(run.status,0,run.stderr);
    }
    const result=await readFile(join(dir,'source/modules/features.mjs'),'utf8');
    assert.equal(result.split("import {pulseAiModules}").length,2);
    assert.equal(result.split('...pulseAiModules').length,2);
  }finally{await rm(dir,{recursive:true,force:true})}
});