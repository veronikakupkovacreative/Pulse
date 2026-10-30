// Spectral DSP core is prepended to this AudioWorklet at build time.
class PulseSpectralDenoiser extends AudioWorkletProcessor {
  constructor(){
    super();
    this.profile=null;
    this.options=spectralSettings({});
    this.channels=[];
    this.clock=0;
    this.ringLength=FFT_SIZE*8;
    this.port.onmessage=event=>{
      const {type,profile,options}=event.data||{};
      if(type==='configure'){
        this.profile=profile?.length===HALF+1?new Float32Array(profile):null;
        this.options=spectralSettings(options||{});
        this.channels=[];this.clock=0;
      }
    };
  }
  createChannel(){return {input:new Float32Array(FFT_SIZE),output:new Float32Array(this.ringLength),
    weight:new Float32Array(this.ringLength),real:new Float64Array(FFT_SIZE),imag:new Float64Array(FFT_SIZE),
    memory:new Float64Array(HALF+1),scratch:new Float64Array(HALF+1)};}
  transform(channel,end){
    const {input,real,imag,memory,scratch,output,weight}=channel,start=end-FFT_SIZE+1;
    for(let i=0;i<FFT_SIZE;i++){
      const at=start+i;real[i]=(at<0?0:input[at%FFT_SIZE])*WINDOW[i];imag[i]=0;
    }
    spectralFft(real,imag);
    spectralProcessFrame(real,imag,this.profile,this.options,memory,scratch);
    spectralFft(real,imag,true);
    for(let i=0;i<FFT_SIZE;i++){
      const at=start+i;if(at<0)continue;
      const slot=at%this.ringLength;
      output[slot]+=real[i]*WINDOW[i];weight[slot]+=WINDOW[i]*WINDOW[i];
    }
  }
  process(inputs,outputs){
    const source=inputs[0],target=outputs[0];if(!target)return true;
    if(!this.profile){for(let c=0;c<target.length;c++){const src=source?.[c]||source?.[0];target[c].fill(0);if(src)target[c].set(src);}return true;}
    for(let c=0;c<target.length;c++)if(!this.channels[c])this.channels[c]=this.createChannel();
    const count=target[0]?.length||128;
    for(let i=0;i<count;i++){
      const n=this.clock++;
      for(let c=0;c<target.length;c++){
        const state=this.channels[c],src=source?.[c]||source?.[0];
        state.input[n%FFT_SIZE]=src?.[i]||0;
        if(n%HOP===HOP-1)this.transform(state,n);
        const pos=n-FFT_SIZE;
        if(pos<0){target[c][i]=0;continue;}
        const slot=pos%this.ringLength;
        target[c][i]=state.weight[slot]>1e-7?state.output[slot]/state.weight[slot]:0;
        state.output[slot]=0;state.weight[slot]=0;
      }
    }
    return true;
  }
}
registerProcessor('pulse-spectral-denoiser',PulseSpectralDenoiser);
