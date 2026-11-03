/** Local producer DSP: measurable frequency matching, tail reduction, chord estimation.
 * No trained neural model is used; no fabricated stem separation is performed.
 */
import {fromChannels} from './dsp.mjs';
import {renderWithNodes} from './legacy-dsp.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
export const MATCH_CENTERS=Object.freeze([70,160,350,750,1600,3400,7000,12500]);
const check=b=>{if(!b||!Number.isInteger(b.length)||b.length<4096||!Number.isFinite(b.sampleRate)||b.sampleRate<8000||b.sampleRate>192000||!Number.isInteger(b.numberOfChannels)||b.numberOfChannels<1||b.numberOfChannels>8||typeof b.getChannelData!=='function')throw Error('Load a supported audio file (minimum 4096 samples).');return b};
const peak=b=>{let p=0;for(let c=0;c<b.numberOfChannels;c++)for(const x of b.getChannelData(c)){if(!Number.isFinite(x))throw Error('Audio contains nonfinite samples.');p=Math.max(p,Math.abs(x));}return p};
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;}}for(let len=2;len<=n;len*=2){const theta=-2*Math.PI/len,wr0=Math.cos(theta),wi0=Math.sin(theta);for(let start=0;start<n;start+=len){let wr=1,wi=0;for(let k=0;k<len/2;k++){const a=start+k,b=a+len/2,r=re[b]*wr-im[b]*wi,j=im[b]*wr+re[b]*wi;re[b]=re[a]-r;im[b]=im[a]-j;re[a]+=r;im[a]+=j;const t=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=t;}}}}
export function analyzeSpectra(b,{maxFrames=84}={}){
 check(b);const size=4096,channels=Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i));const frames=Math.min(maxFrames,Math.max(1,Math.round(b.length/b.sampleRate/.2)));const result=[];
 for(let f=0;f<frames;f++){
   const start=Math.floor((f+.5)*Math.max(0,b.length-size)/frames),re=new Float64Array(size),im=new Float64Array(size);let rms=0;
   for(let i=0;i<size;i++){let value=0;for(const ch of channels)value+=ch[start+i]/channels.length;re[i]=value*(.5-.5*Math.cos(i*2*Math.PI/(size-1)));rms+=value*value;}
   if(rms/size<1e-8)continue;fft(re,im);result.push({re,im,time:(start+size/2)/b.sampleRate});
 }
 return result;
}
export function referenceProfile(b){
 const bands=new Float64Array(MATCH_CENTERS.length);
 for(const {re,im} of analyzeSpectra(b))for(let k=2;k<2048;k++){
   const hz=k*b.sampleRate/4096;if(hz<35||hz>Math.min(16000,b.sampleRate*.48))continue;
   const magnitude=re[k]*re[k]+im[k]*im[k];const band=MATCH_CENTERS.findIndex(v=>hz<v*Math.SQRT2);bands[band<0?bands.length-1:band]+=magnitude/Math.sqrt(hz);
 }
 const total=bands.reduce((a,x)=>a+x,0);if(total<1e-10)throw Error('No measurable spectrum in this recording.');return Array.from(bands,x=>Math.max(x/total,1e-10));
}
export function analyzeReferenceMatch(b,reference,{amount=.7,maxDb=5}={}){
 check(b);check(reference);
 if(!Number.isFinite(amount)||amount<0||amount>1||!Number.isFinite(maxDb)||maxDb<1||maxDb>9)throw Error('Invalid matching controls.');
 const target=referenceProfile(b),ref=referenceProfile(reference);
 const raw=target.map((v,i)=>clamp(10*Math.log10(ref[i]/v)*amount,-maxDb,maxDb));const avg=raw.reduce((a,x)=>a+x,0)/raw.length;
 return {frequencies:MATCH_CENTERS.slice(),gains:raw.map(v=>Math.round(clamp(v-avg*.5,-maxDb,maxDb)*10)/10),target,reference:ref};
}
export async function matchReference(b,reference,settings={}){
 const profile=analyzeReferenceMatch(b,reference,settings);
 const filters=profile.frequencies.map((frequency,i)=>({type:i===0?'lowshelf':i===profile.frequencies.length-1?'highshelf':'peaking',frequency,q:.75,gain:profile.gains[i]}));
 const render=await renderWithNodes(b,filters),originalPeak=peak(b),newPeak=peak(render);
 const scale=newPeak?Math.min(1,.98/newPeak,Math.max(.04,originalPeak)*1.15/newPeak):1;
 const output=fromChannels(Array.from({length:render.numberOfChannels},(_,i)=>Float32Array.from(render.getChannelData(i),x=>clamp(x*scale,-1,1))),render.sampleRate);
 return {buffer:output,profile};
}
/** Linked dynamic attenuation of quiet tails. NOT neural dereverb or echo inversion. */
export function reduceRoomTails(b,{amount=.65,thresholdDb=-42}={}){
 check(b);if(!Number.isFinite(amount)||amount<0||amount>1||!Number.isFinite(thresholdDb)||thresholdDb< -70||thresholdDb> -15)throw Error('Invalid tail reduction controls.');
 const input=Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c));const hop=Math.max(128,Math.round(b.sampleRate*.012)),n=Math.ceil(b.length/hop),levels=new Float64Array(n);let max=0;
 for(let block=0;block<n;block++){let sum=0,length=0;for(let i=block*hop;i<Math.min(b.length,(block+1)*hop);i++){let v=0;for(const ch of input)v=Math.max(v,Math.abs(ch[i]));sum+=v*v;length++;}levels[block]=Math.sqrt(sum/Math.max(1,length));max=Math.max(max,levels[block]);}
 const sorted=Array.from(levels).sort((a,b)=>a-b),floor=sorted[Math.floor(n*.2)]||0;
 const threshold=Math.max(10**(thresholdDb/20),floor*2,max*.01),hold=Math.max(1,Math.round(.06*b.sampleRate/hop)),release=Math.max(1,Math.round(.11*b.sampleRate/hop));
 const gains=new Float64Array(n);let last=-100000;
 for(let block=0;block<n;block++){
   if(levels[block]>=threshold)last=block;
   const silent=block-last,open=silent<=hold?1:Math.exp(-(silent-hold)/release);
   gains[block]=1-(1-open)*amount*.88;
 }
 const channels=input.map(data=>{const out=new Float32Array(b.length);for(let i=0;i<data.length;i++){const block=Math.floor(i/hop),t=(i%hop)/hop,g=gains[block]*(1-t)+gains[Math.min(n-1,block+1)]*t;out[i]=data[i]*g;}return out;});
 return fromChannels(channels,b.sampleRate);
}
function score(profile,template,root){const a=profile.reduce((x,y)=>x+y,0)/12,b=template.reduce((x,y)=>x+y,0)/12;let n=0,d1=0,d2=0;for(let i=0;i<12;i++){const x=profile[(root+i)%12]-a,y=template[i]-b;n+=x*y;d1+=x*x;d2+=y*y;}return n/Math.sqrt(Math.max(1e-12,d1*d2));}
function bestChord(chroma){let best={value:-Infinity,root:0,mode:'maj'},runner=-Infinity;for(let root=0;root<12;root++)for(const mode of ['maj','min']){const steps=mode==='maj'?[0,4,7]:[0,3,7],v=steps.reduce((sum,k)=>sum+chroma[(root+k)%12],0);if(v>best.value){runner=best.value;best={root,mode,value:v};}else runner=Math.max(runner,v);}return {name:NOTES[best.root]+' '+best.mode,confidence:Math.round(clamp((best.value-runner)*250+25,0,95)),strength:best.value};}
export function detectKeyAndChords(b){
 check(b);const frames=analyzeSpectra(b,{maxFrames:220}),total=new Float64Array(12),records=[];
 for(const f of frames){const chroma=new Float64Array(12);for(let k=3;k<2048;k++){const hz=k*b.sampleRate/4096;if(hz<90||hz>2300)continue;const midi=Math.round(69+12*Math.log2(hz/440));if(midi<35||midi>94)continue;chroma[(midi%12+12)%12]+=Math.hypot(f.re[k],f.im[k])/(1+Math.abs(midi-65)*.025);}
   const strength=chroma.reduce((a,v)=>a+v,0);if(strength<1e-6)continue;for(let i=0;i<12;i++){chroma[i]/=strength;total[i]+=chroma[i];}records.push({time:f.time,chroma});
 }
 if(records.length<2)return {key:'Undetermined',confidence:0,chords:[],method:'FFT chroma'};
 let best={score:-Infinity,root:0,mode:'major'},runner=-Infinity;
 for(let root=0;root<12;root++)for(const [mode,p] of [['major',MAJOR],['minor',MINOR]]){const v=score(total,p,root);if(v>best.score){runner=best.score;best={score:v,root,mode};}else runner=Math.max(runner,v);}
 const sequence=[];let last=null;
 for(const f of records){const c=bestChord(f.chroma);if(c.strength<.28)continue;if(last&&last.name===c.name){last.frames++;last.confidence+=c.confidence;}else{last={name:c.name,time:f.time,frames:1,confidence:c.confidence};sequence.push(last);}}
 return {key:NOTES[best.root]+' '+best.mode,confidence:Math.round(clamp((best.score-runner)*165+best.score*20,0,95)),chords:sequence.filter(x=>x.frames>=2).slice(0,24).map(x=>({time:Math.round(x.time*10)/10,label:x.name,confidence:Math.round(x.confidence/x.frames)})),method:'FFT chroma / tonal-template estimation'};
}
