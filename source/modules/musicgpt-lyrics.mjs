/** PULSE AI Studio Lyrics Generator — input stays in this panel until an explicit paid request.
 * MusicGPT uses one GET prompt query behind the owner's POST-only Vercel gateway.
 * Generated lyrics are editable and can be exported as plain text.
 */
const escapeText=s=>String(s??'').trim().replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ');
export function composeLyricsPrompt(input){
 const subject=escapeText(input?.theme);
 if(!subject)throw Error('Describe the song theme to generate lyrics.');
 if(subject.length>750)throw Error('Theme must contain at most 750 characters.');
 const language=escapeText(input?.language||'English');
 const genre=escapeText(input?.genre||'No strict genre');
 const mood=escapeText(input?.mood||'Expressive');
 const structure=escapeText(input?.structure||'Verse / Chorus / Verse / Chorus / Bridge / Chorus');
 const keywords=escapeText(input?.keywords);
 const instructions=[
  'Write complete ORIGINAL song lyrics in '+language+'.',
  'Theme and imagery: '+subject+'.',
  'Genre and writing style: '+genre+'. Mood: '+mood+'.',
  'Song structure: '+structure+'. Label the sections on separate lines.',
  'Use natural, singable lines and a memorable hook. Output only the lyrics.',
  keywords?'Optional keywords or images: '+keywords+'.':''
 ].filter(Boolean).join(' ');
 if(instructions.length>1000)throw Error('Your instructions are too long for MusicGPT (maximum 1,000 characters). Shorten the theme or keywords.');
 return instructions;
}
function downloadText(name,content){
 const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(escapeText(name)||'pulse-lyrics').replace(/[^a-z0-9_-]/gi,'-').slice(0,60)+'-lyrics.txt';
 a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
const errors={
 CREDIT_PROTECTION_REQUIRED:'Refresh the page and try again.',
 MUSICGPT_LYRICS_NOT_CONFIGURED:'Lyrics Generator is not configured on this PULSE deployment.',
 TEXT_UPLOAD_CONSENT_REQUIRED:'Confirm you agree to send the prompt to MusicGPT.',
 INSUFFICIENT_CREDITS:'Your MusicGPT account has insufficient credits.',
 MUSICGPT_LYRICS_AUTH_FAILED:'MusicGPT rejected the server-side lyrics API key.',
 MUSICGPT_RATE_LIMITED:'MusicGPT is rate limiting requests. Try again later.',
 MUSICGPT_INVALID_PROMPT:'MusicGPT rejected the description. Shorten or revise it.',
 INVALID_PROVIDER_RESPONSE:'MusicGPT returned no lyrics. No result was saved.',
 MUSICGPT_LYRICS_TIMEOUT:'MusicGPT did not respond in time. Check your account before retrying to avoid duplicate charges.',
 MUSICGPT_LYRICS_CONNECTION_ERROR:'Unable to connect to MusicGPT. Please check your connection.'
};
export function mountLyricsGenerator({host}){
 host.innerHTML='<section class="tool-view ai2-panel pulse-lyrics">'+
 '<div class="tool-view-header"><span>04 / AI STUDIO / LYRICS GENERATOR</span><span>MUSICGPT / TEXT TO LYRICS</span></div>'+
 '<h3>Write the words.<br><span>Find the hook.</span></h3>'+
 '<p class="tool-description">Generate original song lyrics from a theme, genre, mood and structure. The result stays editable in PULSE. MusicGPT processes your text prompt on its servers; no audio is uploaded.</p>'+
 '<div class="pulse-lyrics-grid"><form class="pulse-lyrics-form" data-lyrics-form>'+
 '<label>SONG THEME / IDEA<textarea name="theme" data-lyrics-theme rows="4" maxlength="750" required placeholder="A night drive after the last show, trying to forget the past..."></textarea></label>'+
 '<div class="pulse-lyrics-options">'+
 '<label>GENRE<select name="genre" data-lyrics-genre><option>Trap</option><option>Hip-Hop</option><option>R&B</option><option>Pop</option><option>Electronic</option><option>House</option><option>Indie</option><option>Rock</option><option>Alternative</option><option>Other</option></select></label>'+
 '<label>MOOD<select name="mood" data-lyrics-mood><option>Dark</option><option>Melancholic</option><option>Confident</option><option>Romantic</option><option>Energetic</option><option>Dreamy</option><option>Hopeful</option><option>Raw</option><option>Playful</option></select></label>'+
 '<label>LANGUAGE<select name="language" data-lyrics-language><option>English</option><option>Czech</option><option>Slovak</option><option>Spanish</option><option>German</option><option>French</option><option>Italian</option></select></label>'+
 '<label>STRUCTURE<select name="structure" data-lyrics-structure><option>Verse / Chorus / Verse / Chorus / Bridge / Chorus</option><option>Intro / Verse / Pre-Chorus / Chorus / Verse / Chorus / Outro</option><option>Hook / Verse / Hook / Verse / Hook</option><option>Free-form / Spoken word</option></select></label>'+
 '</div>'+
 '<label>OPTIONAL / KEYWORDS<input name="keywords" data-lyrics-keywords maxlength="160" placeholder="city lights, midnight, no sleep"></label>'+
 '<p class="pulse-lyrics-note">No API key required · PULSE credits.</p>'+
 '<label class="pulse-lyrics-consent"><input type="checkbox" data-lyrics-consent required> I agree to send this prompt to MusicGPT.</label>'+
 '<button class="ai2-action pulse-lyrics-generate" type="submit" data-lyrics-generate>GENERATE LYRICS <span aria-hidden="true">↗</span></button>'+
 '<p class="pulse-lyrics-status" role="status" aria-live="polite" data-lyrics-status>Describe your idea and press Generate Lyrics. Audio is never sent.</p>'+
 '</form>'+
 '<section class="pulse-lyrics-result" aria-label="Lyrics output">'+
 '<div class="pulse-lyrics-result-head"><h4>YOUR LYRICS</h4><span data-lyrics-meta>NO GENERATION YET</span></div>'+
 '<div class="pulse-lyrics-empty" data-lyrics-empty><span>01 /</span><p>Your generated song lyrics will appear here. Edit, copy or export the finished text.</p></div>'+
 '<label class="pulse-lyrics-editor" data-lyrics-editor hidden>EDITABLE LYRICS<textarea data-lyrics-output rows="18" spellcheck="true" aria-label="Generated lyrics, editable"></textarea></label>'+
 '<div class="pulse-lyrics-output-actions"><button type="button" data-lyrics-action="copy" disabled>COPY LYRICS</button><button type="button" data-lyrics-action="download" disabled>EXPORT TXT ↗</button></div>'+
 '<p class="pulse-lyrics-note">Generated lyrics may need editing for rhythm and rhyme. MusicGPT estimates credit usage after generation. Avoid asking for copyrighted lyrics or imitation of a specific artist.</p>'+
 '</section></div></section>';
 const $=q=>host.querySelector(q);
 let disposed=false,controller=null,busy=false,generation=0,lastPrompt='',lastCost=null;
 const submit=$('[data-lyrics-generate]'),form=$('[data-lyrics-form]');
 const status=(message,isError=false)=>{
  const node=$('[data-lyrics-status]');node.textContent=message;node.dataset.error=String(isError);
 };
 const setBusy=flag=>{
  busy=flag;submit.disabled=flag;submit.textContent=flag?'GENERATING LYRICS…':'GENERATE LYRICS ↗';
 };
 const setActions=()=>{
  const ready=Boolean($('[data-lyrics-output]').value.trim());
  $('[data-lyrics-action="copy"]').disabled=!ready;
  $('[data-lyrics-action="download"]').disabled=!ready;
 };
 const showResult=(lyrics,credit)=>{
  $('[data-lyrics-output]').value=lyrics;
  $('[data-lyrics-editor]').hidden=false;
  $('[data-lyrics-empty]').hidden=true;
  $('[data-lyrics-meta]').textContent=credit===null?'GENERATED WITH MUSICGPT':'GENERATED / EST. '+credit+' CREDITS';
  setActions();
 };
 const validate=()=>{
  const theme=$('[data-lyrics-theme]').value;
  const instructions=composeLyricsPrompt({
   theme,genre:$('[data-lyrics-genre]').value,mood:$('[data-lyrics-mood]').value,
   language:$('[data-lyrics-language]').value,structure:$('[data-lyrics-structure]').value,
   keywords:$('[data-lyrics-keywords]').value
  });
  if(!$('[data-lyrics-consent]').checked)throw Error('Confirm consent and credit usage before generating.');
  return {instructions};
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(disposed||busy)return;
  let payload;
  try{payload=validate();}catch(error){status(error.message,true);return;}
  const signalController=new AbortController(),run=++generation;controller=signalController;
  setBusy(true);status('Sending text instructions to MusicGPT. The generated lyrics will appear here…');
  try{
   const response=await fetch('/api/pulse-lyrics?charge=1',{method:'POST',headers:{
    'Content-Type':'application/json'
   },body:JSON.stringify({action:'generate',consent:true,prompt:payload.instructions}),signal:signalController.signal});
   const output=await response.json().catch(()=>({error:'INVALID_PROVIDER_RESPONSE'}));
   if(!response.ok){
    const error=new Error(response.status===429?'PULSE cloud limit reached. Try in 10 minutes.':errors[output.error]||'MusicGPT returned an error ('+(output.error||response.status)+').');
    error.code=output.error;throw error;
   }
   if(typeof output.lyrics!=='string'||!output.lyrics.trim())throw Error('MusicGPT returned no lyrics.');
   if(disposed||run!==generation)return;
   lastPrompt=payload.instructions;lastCost=Number.isFinite(output.creditEstimate)?output.creditEstimate:null;
   showResult(output.lyrics,lastCost);
   status('Lyrics generated. You can edit, copy, or export the result without another API request.');
  }catch(error){
   if(!disposed&&run===generation&&error.name!=='AbortError')status(error.message||'Lyrics generation failed.',true);
  }finally{
   if(controller===signalController){controller=null;if(!disposed)setBusy(false);}
  }
 });
 $('[data-lyrics-output]').addEventListener('input',setActions);
 $('[data-lyrics-action="copy"]').onclick=async()=>{
  const lyrics=$('[data-lyrics-output]').value;
  if(!lyrics.trim())return;
  try{await navigator.clipboard.writeText(lyrics);status('Lyrics copied to clipboard.');}
  catch{status('Could not copy automatically. Select the lyrics and copy manually.',true);}
 };
 $('[data-lyrics-action="download"]').onclick=()=>{
  const lyrics=$('[data-lyrics-output]').value;if(!lyrics.trim())return;
  downloadText($('[data-lyrics-theme]').value.slice(0,44),lyrics);
  status('Lyrics TXT exported. Editing remains available in PULSE.');
 };
 return()=>{disposed=true;generation++;controller?.abort();};
}
