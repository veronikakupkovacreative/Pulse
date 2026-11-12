/** PULSE new-tool visual QA.
 * Checks the actual computed styles in Chromium, not only CSS strings:
 * Lyrics Generator, MusicGPT Voice Changer and local Music Tagger,
 * desktop + 375px, light + dark. Zero network/API charges.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,sep,extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('public');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
 '.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm',
 '.json':'application/json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let path=resolve(root,'.'+pathname);
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);return res.end('Forbidden');}
  if(path===root)path=join(root,'index.html');
  const data=await readFile(path);
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(data);
 }catch(error){res.writeHead(404);res.end(String(error?.code||'not found'));}
});
function rgb(value){
 const found=String(value).match(/[\d.]+/g)?.map(Number)||[];
 if(found.length<3)throw Error('Invalid CSS color: '+value);
 return found.slice(0,3);
}
const light=c=>c.map(value=>{
 const x=value/255;return x<=0.04045?x/12.92:((x+.055)/1.055)**2.4;
 }).reduce((acc,x,i)=>acc+x*[.2126,.7152,.0722][i],0);
function contrast(a,b){
 const x=light(rgb(a)),y=light(rgb(b));
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
async function sample(page,selector){
 const locator=page.locator(selector).first();
 await locator.waitFor({state:'attached'});
 return locator.evaluate(el=>{
  const styles=getComputedStyle(el),canvas=getComputedStyle(el.closest('.tool-settings'));
  const rect=el.getBoundingClientRect();
  return {text:styles.color,bg:styles.backgroundColor,canvas:canvas.backgroundColor,
   fontsize:styles.fontSize,display:styles.display,width:rect.width,scrollWidth:el.scrollWidth};
 });
}
async function checkText(page,selector){
 const row=await sample(page,selector);
 const ratio=contrast(row.text,row.canvas);
 assert.ok(ratio>=4.5,selector+' low color contrast: '+ratio.toFixed(2)+' '+JSON.stringify(row));
 assert.ok(parseFloat(row.fontsize)>=10,selector+' is too small: '+row.fontsize);
}
async function checkCanvas(page,selector){
 const row=await sample(page,selector);
 assert.equal(row.canvas,'rgb(255, 43, 32)','PULSE canonical red canvas changed');
 assert.equal(row.text,'rgb(25, 25, 25)',selector+' should use canonical ink');
}
async function checkSurface(page,selector){
 const row=await sample(page,selector);
 assert.ok(row.bg==='rgba(0, 0, 0, 0)'||row.bg==='rgb(255, 43, 32)',
  selector+' still has a dark tile on red canvas: '+row.bg);
}
async function lyrics(page,label){
 await page.locator('[data-category="ai"]').click();
 await page.locator('[data-tool="ai2-lyrics"]').click();
 await page.locator('.pulse-lyrics-form').waitFor();
 await checkCanvas(page,'.pulse-lyrics');
 await checkSurface(page,'.pulse-lyrics-form');
 await checkSurface(page,'.pulse-lyrics-result');
 for(const sel of [
  '.pulse-lyrics .tool-view-header','.pulse-lyrics h3','.pulse-lyrics .tool-description',
  '.pulse-lyrics-form label','.pulse-lyrics-form [data-lyrics-theme]',
  '.pulse-lyrics-result-head h4','.pulse-lyrics-result-head [data-lyrics-meta]',
  '.pulse-lyrics-empty p','.pulse-lyrics-note','.pulse-lyrics-status'
 ])await checkText(page,sel);
 const grid=await page.locator('.pulse-lyrics-grid').evaluate(el=>({
  widths:getComputedStyle(el).gridTemplateColumns.split(/\s+/),
  width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,
  formWidth:el.querySelector('form').getBoundingClientRect().width
 }));
 assert.equal(grid.widths.length,1,'Lyrics form and result must STACK inside narrow inspector: '+JSON.stringify(grid));
 assert.ok(grid.scrollWidth<=grid.width+3,'Lyrics columns overflow: '+JSON.stringify(grid));
 const primary=await sample(page,'.pulse-lyrics-generate');
 assert.equal(primary.bg,'rgb(25, 25, 25)','Lyrics CTA must be black');
 assert.equal(primary.text,'rgb(255, 255, 255)','Lyrics CTA must be white on black');
 if(label==='desktop')await page.locator('.pulse-lyrics').screenshot({path:'test-results/pulse-colors-lyrics-desktop.png'});
}
async function voice(page,label){
 await page.locator('[data-tool="ai2-vocals"]').click();
 await page.locator('[data-view="ai-voice-changer"]').click();
 await page.locator('.pulse-voice-ai').waitFor();
 await checkCanvas(page,'.pulse-voice-ai');
 for(const sel of ['.pulse-voice-ai h3','.pulse-voice-ai .tool-description',
   '.pulse-voice-fields label','.pulse-voice-fields [data-voice-token]',
   '.pulse-voice-ai .pulse-voice-consent','.pulse-voice-progress p'])await checkText(page,sel);
 const secondary=await sample(page,'.pulse-voice-secondary');
 assert.equal(secondary.text,'rgb(25, 25, 25)','Secondary voice button must have black text');
 if(label==='desktop')await page.locator('.pulse-voice-ai').screenshot({path:'test-results/pulse-colors-voice-desktop.png'});
}
async function tagger(page,label){
 await page.locator('[data-category="analyze"]').click();
 await page.locator('[data-tool="music-tagger"]').click();
 await page.locator('.pulse-tagger').waitFor();
 await checkCanvas(page,'.pulse-tagger');
 await checkSurface(page,'.pulse-tagger-cloud');
 for(const sel of ['.pulse-tagger h3','.pulse-tagger .tool-description','.pulse-tagger-warning',
   '.pulse-tagger-cloud-label','.pulse-tagger-model-credit',
   '.pulse-tagger-ai-head h4','.pulse-tagger .pulse-tagger-progress strong'])
  await checkText(page,sel);
 if(label==='desktop')await page.locator('.pulse-tagger').screenshot({path:'test-results/pulse-colors-tagger-desktop.png'});
}
async function mastering(page,label){
 await page.locator('[data-category="ai"]').click();
 await page.locator('[data-tool="ai2-mastering"]').click();
 await page.locator('.pulse-master-work').waitFor();
 assert.equal(await page.locator('[data-master-engine="cloud"]').count(),0);
 assert.equal(await page.locator('[data-master-cloud]').count(),0);
 await checkText(page,'.pulse-master-work .tool-description');
 await checkText(page,'.pulse-master-work .pulse-master-status');
 await checkText(page,'.pulse-master-work .pulse-master-section-head strong');
 assert.equal(await page.locator('[data-master-action="render"]').count(),1);
 assert.equal(await page.locator('[data-master-action="match"]').count(),1);
 if(label==='desktop')await page.locator('.pulse-master-work').screenshot({path:'test-results/pulse-colors-mastering-desktop.png'});
}

async function musicAI(page,label){
 await page.locator('[data-category="ai"]').click();
 await page.locator('[data-tool="ai2-musicai"]').click();
 await page.locator('.pulse-musicai').waitFor();
 await checkCanvas(page,'.pulse-musicai');
 await checkSurface(page,'.pulse-mai-form');
 await checkSurface(page,'.pulse-mai-status-panel');
 for(const selector of [
  '.pulse-musicai .tool-view-header','.pulse-musicai h3','.pulse-musicai .tool-description',
  '.pulse-mai-field','.pulse-mai-field input[data-mai-token]',
  '.pulse-mai-field textarea','.pulse-mai-consent','.pulse-mai-hint',
  '.pulse-mai-status-heading strong','.pulse-mai-status',
  '.pulse-mai-result-head strong','.pulse-mai-track-head h4'
 ])await checkText(page,selector);
 const button=await sample(page,'.pulse-mai-generate');
 assert.equal(button.bg,'rgb(25, 25, 25)','Music AI CTA must be black');
 assert.equal(button.text,'rgb(255, 255, 255)','Music AI CTA text must be white');
 const bounds=await page.locator('.pulse-musicai').evaluate(el=>{
  const rect=el.getBoundingClientRect();return {width:rect.width,scrollWidth:el.scrollWidth,left:rect.left,right:rect.right,viewport:innerWidth};
 });
 assert.ok(bounds.scrollWidth<=bounds.width+3,'Music AI form overflow: '+JSON.stringify(bounds));
 assert.ok(bounds.left>=-4&&bounds.right<=bounds.viewport+4,'Music AI viewport overflow: '+JSON.stringify(bounds));
 if(label==='desktop')await page.locator('.pulse-musicai').screenshot({path:'test-results/pulse-colors-musicai-desktop.png'});
}

async function main(){
 await mkdir('test-results',{recursive:true});
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const url='http://127.0.0.1:'+server.address().port+'/';
  for(const {width,height,name} of [{width:1440,height:900,name:'desktop'},{width:375,height:812,name:'mobile'}]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url,{waitUntil:'domcontentloaded'});
   for(const mode of ['light','dark']){
    await page.evaluate(mode=>document.documentElement.setAttribute('data-theme',mode),mode);
    await lyrics(page,name);
    await voice(page,name);
    await tagger(page,name);
    await mastering(page,name);
    await musicAI(page,name);
   }
   if(name==='mobile'){
    await lyrics(page,'mobile');
    const overflow=await page.locator('.pulse-lyrics').evaluate(el=>{
     const rect=el.getBoundingClientRect();
     return {left:rect.left,right:rect.right,viewport:innerWidth};
    });
    assert.ok(overflow.left>=-4&&overflow.right<=overflow.viewport+4,'Lyrics mobile overflow: '+JSON.stringify(overflow));
    await page.locator('.pulse-lyrics').screenshot({path:'test-results/pulse-colors-lyrics-mobile.png'});
   }
   assert.ok(!errors.some(e=>/lyrics|musicgpt|music.tag|CSS|stylesheet/i.test(e)),
    'Browser runtime errors: '+errors.join('; '));
   await page.close();
   console.log('PASS:',name,'contrast >= 4.5, canonical red surface, Lyrics / Voice / Tagger / local Mastering / Music AI V2 in light and dark.');
  }
 }finally{await browser?.close();await new Promise(ok=>server.close(ok));}
}
main().catch(error=>{console.error('FAIL: visual color QA:',error);process.exitCode=1;});
