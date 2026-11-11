/** Local vocal DSP, deliberately not presented as neural pitch correction. */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export async function processVocal(buffer, settings={}) {
  if (!buffer || buffer.length < 1) throw Error('Load a vocal recording first.');
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline) throw Error('Offline audio rendering is unavailable in this browser.');
  const rate=buffer.sampleRate, channels=Math.min(buffer.numberOfChannels,2);
  const ctx=new Offline(channels,buffer.length,rate), input=ctx.createBuffer(channels,buffer.length,rate);
  for(let c=0;c<channels;c++) input.copyToChannel(buffer.getChannelData(c),c);
  const src=ctx.createBufferSource(); src.buffer=input;
  const highpass=ctx.createBiquadFilter(); highpass.type='highpass';
  highpass.frequency.value=clamp(Number(settings.highpass)||80,40,220);
  const body=ctx.createBiquadFilter();body.type='peaking';body.frequency.value=280;body.Q.value=.8;
  body.gain.value=clamp(Number(settings.warmth)||0,-5,5);
  const presence=ctx.createBiquadFilter();presence.type='peaking';presence.frequency.value=3300;presence.Q.value=.7;
  presence.gain.value=clamp(Number(settings.presence)||2,-5,6);
  const tame=ctx.createBiquadFilter();tame.type='highshelf';tame.frequency.value=6800;
  tame.gain.value=-clamp(Number(settings.sibilance)||0,0,8);
  const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-clamp(Number(settings.compression)||16,4,32);
  comp.ratio.value=2.6; comp.attack.value=.008; comp.release.value=.15; comp.knee.value=10;
  const wet=ctx.createGain(), dry=ctx.createGain();
  const amount=clamp(Number(settings.mix??100),0,100)/100;
  wet.gain.value=amount;dry.gain.value=1-amount;
  src.connect(highpass);highpass.connect(body);body.connect(presence);presence.connect(tame);
  tame.connect(comp);comp.connect(wet);wet.connect(ctx.destination);
  src.connect(dry);dry.connect(ctx.destination);
  src.start(); return ctx.startRendering();
}
