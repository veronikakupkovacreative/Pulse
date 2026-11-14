import {workspace as w} from './workspace.mjs';
import {base64File,audoWorkspaceFile,completeAudo} from './audo-ui.mjs';
import {encodeWav} from './dsp.mjs';
import {resampleBuffer} from './legacy-dsp.mjs';

const safeName=value=>String(value||'audio').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,64)||'audio';
const message=(host,selector,text,error=false)=>{const el=host.querySelector(selector);if(el){el.textContent=text;el.dataset.error=String(error);}};
const waitText='Preparing audio…';
async function inputSource(host,{maxSeconds=120,fullFile=false}={}){
 const selected=host.querySelector('[data-pw-file]')?.files?.[0];
 if(selected)return {file:await base64File(selected),name:selected.name,scope:'FILE'};
 const url=host.querySelector('[data-pw-url]')?.value.trim();
 if(url)return {fileUrl:url,name:'remote-audio',scope:'PUBLIC URL'};
 const source=await audoWorkspaceFile({maxSeconds});
 if(fullFile&&source.scope!=='FULL FILE')throw Error('For a full-file report, choose a compressed file under 2.4 MB or paste a public HTTPS download URL.');
 return {...source,name:w.displayName||w.name||'source-audio'};
}
function fileInputMarkup(label='AUDIO FILE'){
 return '<label class="pw-field">'+label+'<input type="file" data-pw-file accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aiff"></label>'+
  '<label class="pw-field">PUBLIC HTTPS AUDIO URL <input type="url" data-pw-url placeholder="https://…"></label>';
}
function bytesFromBase64(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function blobDownload(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function downloadText(text,name,mime='text/plain'){blobDownload(new Blob([text],{type:mime+';charset=utf-8'}),name);}
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function concat(parts){const size=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
export function createZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>200)throw Error('The package has no files or too many files.');
 const encoder=new TextEncoder(),local=[],central=[];let offset=0;
 for(const entry of entries){
  const name=encoder.encode(String(entry.name||'file').replace(/\\/g,'/').replace(/^\/+|\.\./g,'_').slice(0,180));
  const data=entry.data instanceof Uint8Array?entry.data:new Uint8Array(entry.data);
  const crc=crc32(data),localHeader=new Uint8Array(30+name.length),lv=new DataView(localHeader.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
  lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,33,true);
  lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);
  lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);localHeader.set(name,30);local.push(localHeader,data);
  const centralHeader=new Uint8Array(46+name.length),cv=new DataView(centralHeader.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
  cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,33,true);
  cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);
  cv.setUint16(28,name.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);
  cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);
  centralHeader.set(name,46);central.push(centralHeader);offset+=localHeader.length+data.length;
 }
 const centralBytes=concat(central),localBytes=concat(local),end=new Uint8Array(22),v=new DataView(end.buffer);
 v.setUint32(0,0x06054b50,true);v.setUint16(4,0,true);v.setUint16(6,0,true);
 v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);
 v.setUint32(12,centralBytes.length,true);v.setUint32(16,localBytes.length,true);v.setUint16(20,0,true);
 return new Blob([localBytes,centralBytes,end],{type:'application/zip'});
}
function renderAudioResult(host,result,slot){
 const root=host.querySelector(slot);if(!root)return;root.replaceChildren();
 if(result.kind==='audio'&&result.base64){
  const bytes=bytesFromBase64(result.base64),url=URL.createObjectURL(new Blob([bytes],{type:result.mime||'audio/wav'}));
  const player=document.createElement('audio');player.controls=true;player.src=url;
  const link=document.createElement('a');link.href=url;link.download=result.name||'pulse-result.wav';link.textContent='DOWNLOAD ↗';
  root.append(player,link);root.hidden=false;return;
 }
 if((result.kind==='audio-link'||result.kind==='file-link')&&result.url){
  const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='OPEN RESULT ↗';
  root.append(link);root.hidden=false;return;
 }
 if(result.kind==='text'){
  const area=document.createElement('textarea');area.readOnly=true;area.value=result.text||'';area.rows=10;
  const link=document.createElement('button');link.type='button';link.textContent='DOWNLOAD TEXT';link.onclick=()=>downloadText(area.value,'pulse-result.txt');
  root.append(area,link);root.hidden=false;return;
 }
 const pre=document.createElement('pre');pre.textContent=JSON.stringify(result.result??result,null,2);
 const button=document.createElement('button');button.type='button';button.textContent='DOWNLOAD JSON';button.onclick=()=>downloadText(pre.textContent,'pulse-result.json','application/json');
 root.append(pre,button);root.hidden=false;
}
function metric(label,value,unit=''){
 const box=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');
 box.className='pw-metric';small.textContent=label;strong.textContent=value==null?'—':String(value)+(unit?' '+unit:'');box.append(small,strong);return box;
}
function reportData(raw){
 const root=raw?.result??raw?.analysis??raw?.data??raw;if(!root||typeof root!=='object')throw Error('No media report was returned.');
 const audio=root.audio||{},loud=root.loudness||{};
 return {root,metrics:[
  ['DURATION',root.duration_seconds!=null&&Number.isFinite(Number(root.duration_seconds))?Number(root.duration_seconds).toFixed(1):null,'s'],
  ['FORMAT',root.format_name||audio.codec||null,''],['SAMPLE RATE',audio.sample_rate||null,'Hz'],
  ['CHANNELS',audio.channels||null,''],['BIT RATE',audio.bit_rate?Math.round(Number(audio.bit_rate)/1000):null,'kbps'],
  ['INTEGRATED LOUDNESS',loud.integrated_lufs??null,'LUFS'],['TRUE PEAK',loud.true_peak_dbtp??null,'dBTP'],
  ['LOUDNESS RANGE',loud.lra_lu??null,'LU'],['NOISE FLOOR',root.noise_floor_db??null,'dB'],
  ['SAMPLE PEAK',root.peak_db??null,'dBFS'],['RMS',root.rms_db??null,'dBFS'],['CLIPPED SAMPLES',root.clipped_samples??null,'']
 ]};
}
function mountReleasePreflight({host}){
 host.innerHTML='<section class="tool-view pw-panel"><div class="tool-view-header"><span>01 / ANALYZE / RELEASE PREFLIGHT</span><span>MASTER CHECK</span></div>'+
  '<h3>Check the master.<br><span>Before release.</span></h3><p class="tool-description">Measure loudness, true peak, clipping, noise floor, format and file metadata.</p>'+
  fileInputMarkup()+'<label class="pw-consent"><input type="checkbox" data-pw-consent> I agree to send this audio to Audo for analysis.</label>'+
  '<button class="pw-action" type="button" data-pw-run>ANALYZE RELEASE ↗</button>'+
  '<p class="pw-status" data-pw-status role="status" aria-live="polite">Choose a master or use a public download URL.</p>'+
  '<div class="pw-metrics" data-pw-metrics hidden></div><div class="pw-report-actions" data-pw-report-actions hidden><button type="button" data-pw-export>EXPORT REPORT JSON</button></div></section>';
 const run=host.querySelector('[data-pw-run]'),grid=host.querySelector('[data-pw-metrics]');
 let disposed=false,busy=false,report=null,controller=null;
 run.onclick=async()=>{
  if(busy||disposed)return;if(!host.querySelector('[data-pw-consent]').checked)return message(host,'[data-pw-status]','Confirm the upload first.',true);
  busy=true;run.disabled=true;controller=new AbortController();
  try{
   message(host,'[data-pw-status]',waitText);const input=await inputSource(host,{maxSeconds:600,fullFile:true});
   const result=await completeAudo({tool:'release',...input,detail:'full',consent:true},'release',{signal:controller.signal,onProgress:text=>!disposed&&message(host,'[data-pw-status]',text)});
   if(disposed||controller.signal.aborted)return;if(result.kind!=='json')throw Error('A media report was not returned.');
   report=reportData(result.result);grid.replaceChildren(...report.metrics.map(([label,value,unit])=>metric(label,value,unit)));
   grid.hidden=false;host.querySelector('[data-pw-report-actions]').hidden=false;
   const peakValue=report.root?.loudness?.true_peak_dbtp,clippedValue=report.root?.clipped_samples,peak=Number(peakValue),clipped=Number(clippedValue),checks=[];
   if(peakValue!=null&&Number.isFinite(peak))checks.push(peak<=-1?'TRUE PEAK OK':'TRUE PEAK ABOVE -1 dBTP');
   if(clippedValue!=null&&Number.isFinite(clipped))checks.push(clipped===0?'NO CLIPPED SAMPLES':clipped+' CLIPPED SAMPLES');
   message(host,'[data-pw-status]','Analysis complete'+(checks.length?' · '+checks.join(' · '):'')+'.');
  }catch(error){if(!disposed&&error.name!=='AbortError')message(host,'[data-pw-status]',error.message,true);}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 host.querySelector('[data-pw-export]').onclick=()=>{if(report)downloadText(JSON.stringify(report.root,null,2),'pulse-release-report.json','application/json');};
 return()=>{disposed=true;controller?.abort();};
}
function mountVocalSessionMapper({host}){
 host.innerHTML='<section class="tool-view pw-panel"><div class="tool-view-header"><span>01 / ANALYZE / VOCAL SESSION MAPPER</span><span>TRANSCRIPT + TIMING</span></div>'+
  '<h3>Put the words<br><span>on the timeline.</span></h3><p class="tool-description">Transcribe vocals, align your exact lyrics to the recording, or translate the transcript.</p>'+
  fileInputMarkup()+'<div class="pw-mode-tabs" role="group" aria-label="Vocal session mode"><button type="button" data-pw-mode="transcribe" aria-pressed="true">TRANSCRIBE</button><button type="button" data-pw-mode="align" aria-pressed="false">ALIGN LYRICS</button><button type="button" data-pw-mode="translate" aria-pressed="false">TRANSLATE</button></div>'+
  '<label class="pw-field" data-pw-script-wrap hidden>LYRICS / SCRIPT<textarea data-pw-script rows="5" maxlength="20000" placeholder="Paste the exact lyrics or script here…"></textarea></label>'+
  '<label class="pw-field" data-pw-language-wrap hidden>TRANSLATE TO<select data-pw-language><option value="en">English</option><option value="cs">Czech</option><option value="de">German</option><option value="fr">French</option><option value="es">Spanish</option><option value="it">Italian</option><option value="pt">Portuguese</option><option value="ja">Japanese</option><option value="ko">Korean</option></select></label>'+
  '<label class="pw-field">OUTPUT FORMAT<select data-pw-format><option value="srt">SRT</option><option value="vtt">VTT</option><option value="txt">TXT</option></select></label>'+
  '<label class="pw-consent"><input type="checkbox" data-pw-consent> I agree to send this vocal to Audo for processing.</label>'+
  '<button class="pw-action" type="button" data-pw-run>TRANSCRIBE VOCAL ↗</button><p class="pw-status" data-pw-status role="status" aria-live="polite">Choose a vocal recording or use SOURCE AUDIO.</p>'+
  '<div class="pw-output" data-pw-output hidden></div></section>';
 const run=host.querySelector('[data-pw-run]'),script=host.querySelector('[data-pw-script]'),scriptWrap=host.querySelector('[data-pw-script-wrap]'),languageWrap=host.querySelector('[data-pw-language-wrap]'),format=host.querySelector('[data-pw-format]');
 let mode='transcribe',busy=false,disposed=false,controller=null;
 function setMode(next){
  mode=next;host.querySelectorAll('[data-pw-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pwMode===mode)));
  scriptWrap.hidden=mode!=='align';languageWrap.hidden=mode!=='translate';format.querySelector('[value="txt"]').disabled=mode==='align';
  if(mode==='align'&&format.value==='txt')format.value='srt';
  run.textContent=({transcribe:'TRANSCRIBE VOCAL ↗',align:'ALIGN LYRICS ↗',translate:'TRANSLATE TRANSCRIPT ↗'})[mode];
 }
 host.querySelectorAll('[data-pw-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.pwMode));
 run.onclick=async()=>{
  if(busy||disposed)return;if(!host.querySelector('[data-pw-consent]').checked)return message(host,'[data-pw-status]','Confirm the upload first.',true);
  if(mode==='align'&&!script.value.trim())return message(host,'[data-pw-status]','Paste the exact lyrics or script first.',true);
  busy=true;run.disabled=true;controller=new AbortController();
  try{
   message(host,'[data-pw-status]',waitText);const input=await inputSource(host,{maxSeconds:120});
   const request={tool:mode,...input,format:format.value,consent:true};
   if(mode==='align')request.scriptText=script.value;if(mode==='translate')request.targetLanguage=host.querySelector('[data-pw-language]').value;
   const result=await completeAudo(request,mode,{signal:controller.signal,onProgress:text=>!disposed&&message(host,'[data-pw-status]',text)});
   if(disposed||controller.signal.aborted)return;renderAudioResult(host,result,'[data-pw-output]');
   message(host,'[data-pw-status]',mode==='align'?'Lyrics aligned.':mode==='translate'?'Transcript translated.':'Transcript ready.');
  }catch(error){if(!disposed&&error.name!=='AbortError')message(host,'[data-pw-status]',error.message,true);}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 setMode('transcribe');return()=>{disposed=true;controller?.abort();};
}
function parseRanges(value){
 const parts=String(value||'').split(',').map(s=>s.trim()).filter(Boolean);if(!parts.length)return [];
 return parts.map(part=>{
  const m=part.match(/^(\d+(?:\.\d+)?)\s*[-–:]\s*(\d+(?:\.\d+)?)$/);if(!m)throw Error('Use ranges such as 0-1.5, 2-4.');
  const start=Number(m[1]),end=Number(m[2]);if(end<=start)throw Error('Each range must end after it starts.');return [start,end];
 });
}
function audioResultFile(result,originalName){
 if(result.kind!=='audio'||!result.base64)throw Error('The processed result is too large to include in a ZIP. Download it separately from the result link.');
 const mime=result.mime||'audio/wav',ext=mime.includes('mpeg')?'mp3':mime.includes('flac')?'flac':mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'wav';
 return {name:safeName(result.name||originalName)+'.'+ext,data:bytesFromBase64(result.base64),payload:{name:safeName(result.name||originalName)+'.'+ext,base64:result.base64}};
}
function mountSamplePackLab({host}){
 host.innerHTML='<section class="tool-view pw-panel"><div class="tool-view-header"><span>03 / PREPARE / SAMPLE PACK LAB</span><span>BATCH PROCESSING</span></div>'+
  '<h3>Clean the pack.<br><span>Keep the character.</span></h3><p class="tool-description">Process up to five short samples in one batch, then export an organized ZIP.</p>'+
  '<label class="pw-field">SAMPLE FILES · UP TO 5<input type="file" data-pw-files multiple accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aiff"></label>'+
  '<div class="pw-options"><label><input type="checkbox" data-pw-silence> REMOVE SILENCE</label><label><input type="checkbox" data-pw-loudness> MATCH LOUDNESS</label><label><input type="checkbox" data-pw-convert checked> CONVERT FORMAT</label></div>'+
  '<label class="pw-field">LOUDNESS TARGET<select data-pw-target><option value="streaming">STREAMING · -14 LUFS</option><option value="podcast">PODCAST · -16 LUFS</option><option value="broadcast">BROADCAST · -23 LUFS</option></select></label>'+
  '<label class="pw-field">OUTPUT FORMAT<select data-pw-format><option value="wav">WAV</option><option value="flac">FLAC</option><option value="mp3">MP3</option></select></label>'+
  '<label class="pw-field">SAMPLE CHOP RANGES · OPTIONAL<input type="text" data-pw-ranges placeholder="0-1.5, 2-4"></label>'+
  '<label class="pw-consent"><input type="checkbox" data-pw-consent> I agree to send these samples to Audo for processing.</label>'+
  '<button class="pw-action" type="button" data-pw-run>PROCESS SAMPLE PACK ↗</button><p class="pw-status" data-pw-status role="status" aria-live="polite">Choose samples to begin.</p>'+
  '<div class="pw-output" data-pw-output hidden></div></section>';
 const run=host.querySelector('[data-pw-run]'),input=host.querySelector('[data-pw-files]');let busy=false,disposed=false,controller=null;
 run.onclick=async()=>{
  if(busy||disposed)return;const files=[...(input.files||[])];
  if(!files.length||files.length>5)return message(host,'[data-pw-status]','Select one to five audio files.',true);
  if(!host.querySelector('[data-pw-consent]').checked)return message(host,'[data-pw-status]','Confirm the upload first.',true);
  let ranges;try{ranges=parseRanges(host.querySelector('[data-pw-ranges]').value);}catch(error){return message(host,'[data-pw-status]',error.message,true);}
  const operations={silence:host.querySelector('[data-pw-silence]').checked,loudness:host.querySelector('[data-pw-loudness]').checked,
   convert:host.querySelector('[data-pw-convert]').checked,ranges};
  if(!operations.silence&&!operations.loudness&&!operations.convert&&!operations.ranges.length)return message(host,'[data-pw-status]','Choose at least one processing step.',true);
  busy=true;run.disabled=true;controller=new AbortController();const entries=[],processed=[];
  try{
   for(let index=0;index<files.length;index++){
    if(disposed||controller.signal.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});
    const file=files[index];message(host,'[data-pw-status]','Preparing '+(index+1)+'/'+files.length+' · '+file.name);
    let payload=await base64File(file),name=file.name;
    const apply=async(tool,request,label)=>{
     message(host,'[data-pw-status]',file.name+' · '+label);
     const result=await completeAudo({tool,file:payload,consent:true,...request},tool,{signal:controller.signal,onProgress:text=>!disposed&&message(host,'[data-pw-status]',file.name+' · '+text)});
     const output=audioResultFile(result,name);payload=output.payload;name=output.name;return output;
    };
    if(operations.silence)await apply('removeSilence',{},'removing silence');
    if(operations.ranges.length)await apply('cut',{mode:'keep',ranges:operations.ranges},'cutting samples');
    if(operations.loudness)await apply('loudness',{target:host.querySelector('[data-pw-target]').value},'matching loudness');
    if(operations.convert)await apply('convert',{format:host.querySelector('[data-pw-format]').value},'converting');
    const final={name,data:bytesFromBase64(payload.base64),payload};processed.push(final);entries.push({name:final.name,data:final.data});
   }
   if(processed.length>1){
    try{
     message(host,'[data-pw-status]','Joining processed samples…');
     const joined=await completeAudo({tool:'join',files:processed.map(x=>x.payload),consent:true},'join',{signal:controller.signal,onProgress:text=>!disposed&&message(host,'[data-pw-status]',text)});
     const output=audioResultFile(joined,'joined-sample-pack');entries.push({name:'joined-sample-pack'+output.name.slice(output.name.lastIndexOf('.')),data:output.data});
    }catch(error){entries.push({name:'JOIN-NOT-CREATED.txt',data:new TextEncoder().encode(error.message)});}
   }
   const manifest={createdAt:new Date().toISOString(),files:processed.map(x=>x.name),sourceFiles:files.map(f=>f.name)};
   entries.push({name:'pulse-sample-pack-manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
   blobDownload(createZip(entries),'pulse-sample-pack.zip');message(host,'[data-pw-status]',processed.length+' sample(s) processed. ZIP downloaded.');
  }catch(error){if(!disposed&&error.name!=='AbortError')message(host,'[data-pw-status]',error.message,true);}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 return()=>{disposed=true;controller?.abort();};
}
function extractHighlights(result){
 const root=result?.result??result?.data??result,list=root?.highlights??root?.segments??root?.clips??root?.results??root?.items;
 if(!Array.isArray(list))return [];
 return list.map((item,index)=>{
  const start=Number(item.start_seconds??item.startSeconds??item.start??item.from),end=Number(item.end_seconds??item.endSeconds??item.end??item.to);
  return {index,start,end,label:String(item.title??item.reason??item.description??item.label??('HIGHLIGHT '+(index+1))).slice(0,180)};
 }).filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.start>=0&&item.end>item.start);
}
function mountSmartSampleFinder({host}){
 host.innerHTML='<section class="tool-view pw-panel"><div class="tool-view-header"><span>01 / ANALYZE / SMART SAMPLE FINDER</span><span>HIGHLIGHT DETECTION</span></div>'+
  '<h3>Find the moment.<br><span>Make it a sample.</span></h3><p class="tool-description">Find standout sections in a track, review their timestamps and export selected ranges.</p>'+
  fileInputMarkup()+'<label class="pw-field">NUMBER OF HIGHLIGHTS<select data-pw-count><option value="3">3</option><option value="5" selected>5</option><option value="8">8</option><option value="10">10</option></select></label>'+
  '<label class="pw-consent"><input type="checkbox" data-pw-consent> I agree to send this audio to Audo for highlight analysis.</label>'+
  '<button class="pw-action" type="button" data-pw-run>FIND HIGHLIGHTS ↗</button><p class="pw-status" data-pw-status role="status" aria-live="polite">Choose a track to begin.</p>'+
  '<div class="pw-highlight-list" data-pw-highlights hidden></div><div class="pw-output" data-pw-output hidden></div></section>';
 const run=host.querySelector('[data-pw-run]'),list=host.querySelector('[data-pw-highlights]');let busy=false,disposed=false,controller=null,currentInput=null;
 run.onclick=async()=>{
  if(busy||disposed)return;if(!host.querySelector('[data-pw-consent]').checked)return message(host,'[data-pw-status]','Confirm the upload first.',true);
  busy=true;run.disabled=true;controller=new AbortController();list.replaceChildren();list.hidden=true;
  try{
   message(host,'[data-pw-status]',waitText);currentInput=await inputSource(host,{maxSeconds:600});
   const result=await completeAudo({tool:'highlights',...currentInput,count:Number(host.querySelector('[data-pw-count]').value),consent:true},
    'highlights',{signal:controller.signal,onProgress:text=>!disposed&&message(host,'[data-pw-status]',text)});
   if(disposed||controller.signal.aborted)return;const items=extractHighlights(result.result??result);
   if(!items.length){renderAudioResult(host,result,'[data-pw-output]');message(host,'[data-pw-status]','Analysis complete.');return;}
   for(const item of items){
    const row=document.createElement('article'),title=document.createElement('strong'),time=document.createElement('span'),button=document.createElement('button');
    title.textContent=item.label;time.textContent=item.start.toFixed(2)+' – '+item.end.toFixed(2)+' s';button.type='button';button.textContent='EXPORT SAMPLE ↗';
    button.onclick=async()=>{
     button.disabled=true;
     try{const cut=await completeAudo({tool:'cut',...currentInput,mode:'keep',ranges:[[item.start,item.end]],consent:true},
      'cut',{signal:controller.signal,onProgress:text=>message(host,'[data-pw-status]',text)});
      renderAudioResult(host,cut,'[data-pw-output]');message(host,'[data-pw-status]','Sample exported.');
     }catch(error){message(host,'[data-pw-status]',error.message,true);}finally{button.disabled=false;}
    };
    row.append(title,time,button);list.append(row);
   }
   list.hidden=false;message(host,'[data-pw-status]',items.length+' highlights found.');
  }catch(error){if(!disposed&&error.name!=='AbortError')message(host,'[data-pw-status]',error.message,true);}
  finally{busy=false;controller=null;if(!disposed)run.disabled=false;}
 };
 return()=>{disposed=true;controller?.abort();};
}
function mountStemDeliveryStudio({host}){
 host.innerHTML='<section class="tool-view pw-panel"><div class="tool-view-header"><span>03 / PREPARE / STEM DELIVERY STUDIO</span><span>LOCAL PACKAGE BUILDER</span></div>'+
  '<h3>Deliver clean stems.<br><span>Ready for the mix.</span></h3><p class="tool-description">Validate, standardize and package up to ten stems as synchronized WAV files.</p>'+
  '<label class="pw-field">STEM FILES · UP TO 10<input type="file" data-pw-stems multiple accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.aiff"></label>'+
  '<div class="pw-fields-row"><label class="pw-field">SAMPLE RATE<select data-pw-rate><option value="44100">44.1 kHz</option><option value="48000" selected>48 kHz</option></select></label><label class="pw-field">BIT DEPTH<select data-pw-depth><option value="24" selected>24-bit PCM</option><option value="16">16-bit PCM</option></select></label></div>'+
  '<div class="pw-fields-row"><label class="pw-field">BPM · OPTIONAL<input type="number" data-pw-bpm min="30" max="300" step="0.1" placeholder="145"></label><label class="pw-field">KEY · OPTIONAL<input type="text" data-pw-key maxlength="30" placeholder="F minor"></label></div>'+
  '<p class="pw-small">Assumes every stem starts at the same timeline position. Shorter files are padded to the longest duration.</p>'+
  '<button class="pw-action" type="button" data-pw-run>BUILD STEM PACKAGE ↗</button><p class="pw-status" data-pw-status role="status" aria-live="polite">Select the stems to prepare.</p>'+
  '<div class="pw-output" data-pw-output hidden></div></section>';
 const run=host.querySelector('[data-pw-run]'),input=host.querySelector('[data-pw-stems]');let busy=false,disposed=false;
 run.onclick=async()=>{
  if(busy||disposed)return;const files=[...(input.files||[])];
  if(!files.length||files.length>10)return message(host,'[data-pw-status]','Select one to ten stem files.',true);
  if(files.some(file=>file.size>100*1024*1024))return message(host,'[data-pw-status]','Each stem must be under 100 MB.',true);
  if(files.reduce((sum,file)=>sum+file.size,0)>300*1024*1024)return message(host,'[data-pw-status]','The total input size must be under 300 MB.',true);
  busy=true;run.disabled=true;
  try{
   const context=await w.ensureContext(),rate=Number(host.querySelector('[data-pw-rate]').value),depth=Number(host.querySelector('[data-pw-depth]').value),decoded=[];
   for(let i=0;i<files.length;i++){
    if(disposed)throw Error('Package creation cancelled.');
    message(host,'[data-pw-status]','Reading stem '+(i+1)+'/'+files.length+'…');
    decoded.push({file:files[i],buffer:await context.decodeAudioData(await files[i].arrayBuffer())});
   }
   const resampled=[];
   for(let i=0;i<decoded.length;i++){message(host,'[data-pw-status]','Standardizing '+decoded[i].file.name+'…');resampled.push(await resampleBuffer(decoded[i].buffer,rate));}
   const duration=Math.max(...resampled.map(buffer=>buffer.duration)),frames=Math.ceil(duration*rate),entries=[];
   const estimatedBytes=frames*resampled.reduce((sum,b)=>sum+b.numberOfChannels,0)*(depth/8);
   if(estimatedBytes>240*1024*1024)throw Error('This stem package would exceed 240 MB. Use shorter stems or export fewer tracks at a time.');
   for(let i=0;i<resampled.length;i++){
    const source=resampled[i],output=context.createBuffer(source.numberOfChannels,frames,rate);
    for(let channel=0;channel<source.numberOfChannels;channel++)output.getChannelData(channel).set(source.getChannelData(channel));
    const blob=encodeWav(output,depth);
    entries.push({name:safeName(decoded[i].file.name)+'-'+rate+'hz-'+depth+'bit.wav',data:new Uint8Array(await blob.arrayBuffer())});
   }
   const bpm=host.querySelector('[data-pw-bpm]').value,key=host.querySelector('[data-pw-key]').value.trim();
   const manifest=['PULSE STEM DELIVERY','',...decoded.map((item,i)=>(i+1)+'. '+entries[i].name+' | '+resampled[i].numberOfChannels+' ch | '+duration.toFixed(3)+' s'),
    '', 'Sample rate: '+rate+' Hz','Bit depth: '+depth+'-bit PCM','Duration: '+duration.toFixed(3)+' s',
    'BPM: '+(bpm||'not supplied'),'Key: '+(key||'not supplied'),
    'Alignment: files assumed to share the same start time; shorter stems padded with silence.'].join('\n');
   entries.push({name:'session-manifest.txt',data:new TextEncoder().encode(manifest)});
   blobDownload(createZip(entries),'pulse-stem-delivery.zip');message(host,'[data-pw-status]',files.length+' stems packaged · '+rate+' Hz · '+depth+' bit.');
  }catch(error){if(!disposed)message(host,'[data-pw-status]',error.message||'Stem package failed.',true);}
  finally{busy=false;if(!disposed)run.disabled=false;}
 };
 return()=>{disposed=true;};
}
export const producerModules=Object.freeze([
 {id:'release-preflight',category:'analyze',label:'Release Preflight',mount:mountReleasePreflight},
 {id:'vocal-session-mapper',category:'analyze',label:'Vocal Session Mapper',mount:mountVocalSessionMapper},
 {id:'smart-sample-finder',category:'analyze',label:'Smart Sample Finder',mount:mountSmartSampleFinder},
 {id:'sample-pack-lab',category:'prepare',label:'Sample Pack Lab',mount:mountSamplePackLab},
 {id:'stem-delivery-studio',category:'prepare',label:'Stem Delivery Studio',mount:mountStemDeliveryStudio}
]);
