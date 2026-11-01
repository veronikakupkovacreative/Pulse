import test from 'node:test';
import assert from 'node:assert/strict';
import {ThePulseStudioEngine} from '../source/pulse-engine.mjs';

function createContext(){
  const param=()=>({value:0,setValueAtTime(x){this.value=x;},cancelScheduledValues(){},linearRampToValueAtTime(x){this.value=x;}});
  const node=()=>({connect(x){this.next=x;},disconnect(){}});
  return {sampleRate:48000,currentTime:0,
    createBuffer(n,length,rate){
      const arrays=Array.from({length:n},()=>new Float32Array(length));
      return {numberOfChannels:n,length,sampleRate:rate,duration:length/rate,
        getChannelData:i=>arrays[i],copyToChannel:(data,i)=>arrays[i].set(data)};
    },
    createGain:()=>({...node(),gain:param()}),
    createBiquadFilter:()=>({...node(),frequency:param(),gain:param(),Q:param()}),
    createDynamicsCompressor:()=>({...node(),ratio:param(),threshold:param(),attack:param()}),
    createAnalyser:()=>({...node(),frequencyBinCount:256,getByteFrequencyData:()=>{},set fftSize(x){}})
  };
}
test('unified engine provides non-mutating cut and reverse',()=>{
  const ctx=createContext(),engine=new ThePulseStudioEngine(ctx);
  const b=ctx.createBuffer(2,6,48000);b.getChannelData(0).set([1,2,3,4,5,6]);
  const reversed=engine.reverseAudioBuffer(b);
  assert.deepEqual([...reversed.getChannelData(0)],[6,5,4,3,2,1]);
  assert.equal(b.getChannelData(0)[0],1);
  const clip=engine.cutAudioBuffer(b,1/48000,4/48000);
  assert.deepEqual([...clip.getChannelData(0)],[2,3,4]);
  assert.throws(()=>engine.cutAudioBuffer(b,0,2),/Invalid cut/);
});
test('EQ and dynamics facade expose available nodes, without false limiter claims',()=>{
  const engine=new ThePulseStudioEngine(createContext());
  const eq3=engine.create3BandEQ(),eq5=engine.create5BandEQ();
  assert.equal(Object.keys(eq3.bands).length,3);
  assert.equal(Object.keys(eq5.bands).length,5);
  assert.deepEqual(eq5.applyPreset('warm_vocals'),[-3,1,3,4,2]);
  assert.equal(engine.createAIMasteringEngine().limiter,false);
  const voice=engine.createAIVoiceCleaner();
  assert.match(voice.note,/not neural/);
});
test('center-channel approximation explicitly warns that it is not AI separation',()=>{
  const ctx=createContext(),engine=new ThePulseStudioEngine(ctx),source=ctx.createBuffer(2,3,48000);
  source.getChannelData(0).set([1,0,-1]);source.getChannelData(1).set([1,0,-1]);
  const parts=engine.separateVocalStems(source);
  assert.match(parts.method,/not AI/);
  assert.ok(Math.abs(parts.instrumental.getChannelData(0)[0]-.3)<1e-6);
});
test('audio parameters reject out-of-range values',()=>{
  const engine=new ThePulseStudioEngine(createContext());
  assert.throws(()=>engine.createBassBooster(30),/range/);
  assert.throws(()=>engine.createNoiseReductionFilter(0),/cutoff/);
  assert.throws(()=>engine.createVolumeNode(-1),/range/);
});
