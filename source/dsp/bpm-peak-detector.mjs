// Rhythmic peak-voting diagnostic inspired by the supplied AIBPMDetector.
// The existing multiband autocorrelation remains the authoritative BPM estimate.
export class AIBPMDetector {
  constructor(audioContext=null){this.audioContext=audioContext;}
  estimateGenre(bpm){
    if(!Number.isFinite(bpm)||bpm<=0)return 'Unknown tempo';
    if(bpm<90)return 'Ambient / Chillout / Hip-Hop';
    if(bpm<115)return 'Pop / R&B';
    if(bpm<130)return 'House / Techno / Dance';
    if(bpm<155)return 'Trance / Drum & Bass (Half-time)';
    return 'Drum & Bass / Hardcore';
  }
  calculateThreshold(envelope){
    if(!envelope.length)return Infinity;
    let sum=0;for(const value of envelope)sum+=value;
    return 1.5*sum/envelope.length;
  }
  analyzePeaks(samples,sampleRate){
    if(!(samples instanceof Float32Array)||!Number.isFinite(sampleRate)||sampleRate<8000)throw Error('Invalid BPM input.');
    const blockSize=Math.max(1,Math.round(sampleRate*.05));
    const count=Math.floor(samples.length/blockSize);
    if(count<5)return {bpm:null,confidence:0,peakCount:0,genreHint:null};
    const envelope=new Float32Array(count);
    for(let i=0;i<count;i++){let sum=0;for(let j=0;j<blockSize;j++)sum+=Math.abs(samples[i*blockSize+j]);envelope[i]=sum/blockSize;}
    const threshold=this.calculateThreshold(envelope),peaks=[];
    for(let i=1;i<count-1;i++)if(envelope[i]>threshold&&envelope[i]>envelope[i-1]&&envelope[i]>=envelope[i+1])peaks.push(i);
    if(peaks.length<4)return {bpm:null,confidence:0,peakCount:peaks.length,genreHint:null};
    const votes=new Map(),hop=blockSize/sampleRate;
    for(let i=0;i<peaks.length;i++)for(let j=i+1;j<Math.min(peaks.length,i+10);j++){
      const interval=(peaks[j]-peaks[i])*hop;
      for(const n of [1,2,3,4]){const bpm=60*n/interval;if(bpm>=60&&bpm<=180){const bin=Math.round(bpm);votes.set(bin,(votes.get(bin)||0)+1/n);}}
    }
    if(!votes.size)return {bpm:null,confidence:0,peakCount:peaks.length,genreHint:null};
    const ranking=[...votes].sort((a,b)=>b[1]-a[1]),total=ranking.reduce((sum,entry)=>sum+entry[1],0);
    const bpm=ranking[0][0],confidence=Math.round(100*ranking[0][1]/(total||1));
    return {bpm,confidence,peakCount:peaks.length,genreHint:this.estimateGenre(bpm)};
  }
  async analyzeBPM(audioBuffer){
    if(!audioBuffer?.getChannelData||!audioBuffer.sampleRate)throw Error('Invalid audio buffer.');
    const result=this.analyzePeaks(audioBuffer.getChannelData(0),audioBuffer.sampleRate);
    if(result.bpm===null)throw Error('NO_RHYTHM');
    return result;
  }
}
