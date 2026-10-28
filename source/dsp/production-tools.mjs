// Pulse production DSP. Pure JS, zero runtime dependencies and no network.
// Pitch/time use a WSOLA-like waveform-similarity overlap/add algorithm.
const assertAudio=(channels,rate)=>{
  if(!Array.isArray(channels)||channels.length<1||channels.length>2||!channels[0]?.length||channels.some(c=>!(c instanceof Float32Array)||c.length!==channels[0].length))throw Error('Neplatná mono/stereo audio data.');
  if(!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Neplatná vzorkovací frekvence.');
};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const hzToMidi=hz=>69+12*Math.log2(hz/440);
const NOTE=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const frequencyNote=hz=>{
  if(!(hz>0)||!Number.isFinite(hz))return null;
  const exact=hzToMidi(hz),nearest=Math.round(exact),pc=((nearest%12)+12)%12;
  return {note:NOTE[pc]+(Math.floor(nearest/12)-1),hz:440*Math.pow(2,(nearest-69)/12),cents:(exact-nearest)*100,midi:nearest};
};

// YIN normalized difference on low-pass decimated bass windows.
// A kick with pitch sweep or noisy signal will produce low confidence.
export function detectFundamental(channels,rate,{minHz=28,maxHz=260}={}){
  assertAudio(channels,rate);
  if(minHz<20||maxHz>450||maxHz<=minHz)throw Error('Neplatný rozsah frekvencí.');
  const targetRate=2000,step=rate/targetRate,windowLen=480,minLag=Math.max(2,Math.floor(targetRate/maxHz)),maxLag=Math.min(130,Math.ceil(targetRate/minHz));
  const n=channels[0].length,duration=n/rate;
  if(duration<.13)throw Error('Pro 808 tuner použij alespoň 130 ms audia.');
  const energy=channels.map(c=>{let e=0;for(let i=0;i<c.length;i+=32)e+=c[i]*c[i];return e;});
  const best=channels[energy.indexOf(Math.max(...energy))];
  const windows=[],positions=Math.min(34,Math.max(1,Math.floor(duration/.12)));
  for(let k=0;k<positions;k++){
    const time=duration<.28?0:Math.min(Math.max(0,duration-.25),.045+k*Math.max(0,Math.min(duration-0.28,5.5))/Math.max(1,positions-1));
    const sourceAt=Math.round(time*rate);const samples=new Float32Array(windowLen);
    let amp=0;
    for(let i=0;i<windowLen;i++){
      const at=sourceAt+i*step,j=Math.floor(at),frac=at-j;
      if(j+1<best.length){samples[i]=(best[j]*(1-frac)+best[j+1]*frac);amp+=samples[i]*samples[i];}
    }
    const rms=Math.sqrt(amp/windowLen);
    if(rms<.001)continue;
    // Remove DC and apply a gentle zero-phase moving-average low-pass.
    const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
    for(let i=0;i<samples.length;i++)samples[i]-=mean;
    const dif=new Float64Array(maxLag+1);let cumulative=0,lag=-1,bestVal=1;
    for(let tau=1;tau<=maxLag;tau++){
      let diff=0;for(let j=0;j<windowLen-maxLag;j++){const x=samples[j]-samples[j+tau];diff+=x*x;}
      dif[tau]=diff;cumulative+=diff;
      if(tau>=minLag){const cmnd=diff*tau/(cumulative||1);
        if(cmnd<bestVal){bestVal=cmnd;lag=tau;}
      }
    }
    // Prefer the first convincing local YIN minimum to reduce octave errors.
    cumulative=0;
    for(let tau=1;tau<=maxLag;tau++){
      cumulative+=dif[tau];if(tau<minLag)continue;
      const cur=dif[tau]*tau/(cumulative||1),next=tau<maxLag?dif[tau+1]*(tau+1)/(cumulative+dif[tau+1]||1):Infinity;
      if(cur<.16&&cur<=next){lag=tau;bestVal=cur;break;}
    }
    if(lag<minLag)continue;
    // Parabolic interpolation on the raw difference function.
    const a=dif[lag-1]??dif[lag],b=dif[lag],c=dif[lag+1]??dif[lag];
    const shift=(a-2*b+c)!==0?clamp(.5*(a-c)/(a-2*b+c),-.5,.5):0;
    const hz=targetRate/(lag+shift),confidence=clamp(1-bestVal,0,1);
    if(hz>=minHz&&hz<=maxHz)windows.push({hz,confidence,rms});
  }
  if(!windows.length)return {hz:null,confidence:0,label:'Nelze určit fundamentální frekvenci',note:null,frames:0};
  // Weighted median is stable under sparse pitched sections.
  const sorted=windows.sort((a,b)=>a.hz-b.hz),weights=sorted.reduce((a,b)=>a+b.rms*b.confidence*b.confidence,0),half=weights/2;
  let running=0,median=sorted[Math.floor(sorted.length/2)].hz;
  for(const w of sorted){running+=w.rms*w.confidence*w.confidence;if(running>=half){median=w.hz;break;}}
  const near=sorted.filter(w=>Math.abs(1200*Math.log2(w.hz/median))<65);
  const consistency=near.length/sorted.length;
  const confidence=clamp((near.reduce((a,b)=>a+b.confidence,0)/(near.length||1))*consistency,0,1);
  const hz=near.reduce((a,b)=>a+b.hz*b.confidence,0)/(near.reduce((a,b)=>a+b.confidence,0)||1);
  return {hz:hz||median,confidence,label:confidence>=.75?'Vyšší':confidence>=.52?'Střední':'Nízká',note:frequencyNote(hz||median),frames:windows.length};
}

// Waveform Similarity Overlap Add: phase-coherent multi-channel alignment.
export function stretchWsola(channels,targetLen,rate){
  assertAudio(channels,rate);
  const inputLen=channels[0].length;
  if(!Number.isInteger(targetLen)||targetLen<1||targetLen>rate*1200)throw Error('Neplatná délka výstupu.');
  if(targetLen===inputLen)return channels.map(c=>c.slice());
  if(inputLen<rate*.08)throw Error('Pro time stretching je potřeba alespoň 80 ms audia.');
  const ratio=targetLen/inputLen;
  if(ratio<.25||ratio>4)throw Error('Tempo/pitch mimo bezpečný rozsah pro WSOLA.');
  const size=Math.max(512,Math.round(rate*.038/64)*64),hop=Math.max(128,Math.floor(size/4)),search=Math.max(32,Math.floor(size*.22)),analysisHop=hop/ratio;
  const out=channels.map(()=>new Float32Array(targetLen)),weights=new Float32Array(targetLen);
  const win=Float32Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(size-1)));
  const reference=channels[0];let prevSource=0;
  const maxAt=Math.max(0,inputLen-size),nFrames=Math.ceil((targetLen+size)/hop);
  for(let frame=0;frame<nFrames;frame++){
    const dest=frame*hop;if(dest>=targetLen)break;
    let expected=clamp(Math.round(frame*analysisHop),0,maxAt),at=expected;
    if(frame>0&&dest>hop){
      let best=-Infinity;
      const from=Math.max(0,expected-search),to=Math.min(maxAt,expected+search);
      // Small alignment search, sampled correlation, shared across all channels.
      for(let candidate=from;candidate<=to;candidate+=8){
        let corr=0,a2=0,b2=0;
        for(let j=0;j<size-hop;j+=16){
          const pos=dest+j;if(pos>=targetLen)break;
          const x=out[0][pos]/Math.max(weights[pos],1e-9),y=reference[candidate+j];
          corr+=x*y;a2+=x*x;b2+=y*y;
        }
        const score=corr/(Math.sqrt(a2*b2)+1e-8);
        if(score>best){best=score;at=candidate;}
      }
    }
    prevSource=at;
    for(let j=0;j<size;j++){
      const destAt=dest+j,sourceAt=at+j;if(destAt>=targetLen||sourceAt>=inputLen)break;
      const w=win[j];weights[destAt]+=w;
      for(let ch=0;ch<channels.length;ch++)out[ch][destAt]+=channels[ch][sourceAt]*w;
    }
  }
  for(let i=0;i<targetLen;i++){
    if(weights[i]<.00001){const source=Math.min(inputLen-1,Math.floor(i/ratio));for(let ch=0;ch<channels.length;ch++)out[ch][i]=channels[ch][source];}
    else for(let ch=0;ch<channels.length;ch++)out[ch][i]/=weights[i];
  }
  return out;
}
export function processPitchTime(channels,rate,{originalBpm=120,targetBpm=120,semitones=0,cents=0,preservePitch=true}={}){
  assertAudio(channels,rate);
  if(!Number.isFinite(originalBpm)||originalBpm<20||originalBpm>400||!Number.isFinite(targetBpm)||targetBpm<20||targetBpm>400)throw Error('BPM musí být v rozsahu 20–400.');
  if(!Number.isFinite(semitones)||semitones<-12||semitones>12||!Number.isFinite(cents)||cents<-100||cents>100)throw Error('Pitch musí být ±12 semitonů a ±100 centů.');
  const timeFactor=originalBpm/targetBpm;
  const desiredLen=Math.max(1,Math.round(channels[0].length*timeFactor));
  const ratio=Math.pow(2,(semitones+cents/100)/12)*(preservePitch?1:targetBpm/originalBpm);
  const tempLen=Math.max(1,Math.round(channels[0].length/ratio));
  if(tempLen*channels.length*4>220*1024*1024||desiredLen*channels.length*4>220*1024*1024)throw Error('Výstup je příliš velký. Použij kratší audio úsek.');
  if(Math.abs(timeFactor-1)<1e-8&&Math.abs(ratio-1)<1e-8)return channels.map(c=>c.slice());
  const temp=channels.map(c=>{
    const result=new Float32Array(tempLen);
    for(let i=0;i<tempLen;i++){const x=i*ratio,j=Math.floor(x),f=x-j;result[i]=(c[Math.min(j,c.length-1)]||0)*(1-f)+(c[Math.min(j+1,c.length-1)]||0)*f;}
    return result;
  });
  if(tempLen===desiredLen)return temp;
  return stretchWsola(temp,desiredLen,rate);
}

// Positive spectral flux using band-limited local energy increases.
// Sub-band envelope is robust for short percussion loops and cheap for browsers.
export function detectTransients(channels,rate,{sensitivity=.55,minGapMs=85}={}){
  assertAudio(channels,rate);
  if(!Number.isFinite(sensitivity)||sensitivity<0||sensitivity>1)throw Error('Sensitivity musí být 0–1.');
  const signal=channels[0],hop=Math.max(64,Math.round(rate*.0075)),frame=hop*3;
  const count=Math.floor(signal.length/hop),energy=new Float64Array(count),flux=new Float64Array(count);
  for(let i=1;i<count;i++){
    const start=i*hop,end=Math.min(signal.length,start+frame);let sum=0;
    for(let k=start;k<end;k++)sum+=signal[k]*signal[k];
    energy[i]=Math.sqrt(sum/Math.max(1,end-start));
    flux[i]=Math.max(0,energy[i]-energy[i-1]);
  }
  const minGap=Math.max(1,Math.round(minGapMs/1000*rate/hop));
  const markers=[0];let last=-minGap;
  const avgWindow=Math.max(3,Math.round(.24*rate/hop));
  for(let i=2;i<count-2;i++){
    if(i-last<minGap||flux[i]<=flux[i-1]||flux[i]<flux[i+1])continue;
    let sum=0,n=0;
    for(let j=Math.max(1,i-avgWindow);j<=Math.min(count-1,i+avgWindow);j+=2){sum+=flux[j];n++;}
    const local=sum/Math.max(1,n),factor=2.9-2.35*sensitivity;
    if(flux[i]>Math.max(.0015,energy[i]*.28,local*factor)&&energy[i]>.0025){
      // Offset transient marker slightly earlier than current envelope peak.
      const at=Math.max(0,i*hop/rate);
      if(at-markers[markers.length-1]>=minGapMs/1000){markers.push(at);last=i;}
    }
  }
  if(markers.length===0||markers[markers.length-1]!==signal.length/rate)markers.push(signal.length/rate);
  return markers;
}
export function sliceAudio(channels,rate,markers,index){
  assertAudio(channels,rate);
  if(!Array.isArray(markers)||index<0||index>=markers.length-1)throw Error('Neplatný index slicu.');
  const start=clamp(Math.round(markers[index]*rate),0,channels[0].length);
  const end=clamp(Math.round(markers[index+1]*rate),start+1,channels[0].length);
  if(end<=start)throw Error('Slice je příliš krátký.');
  return channels.map(c=>c.slice(start,end));
}
