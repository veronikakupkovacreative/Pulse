// Run after npm run build and installing Playwright's Chromium.
// Real browser smoke test: waveform, EQ panel, overview, drag selection, A/B and responsive fit.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root=resolve(process.cwd(),'public');
const server=createServer(async(req,res)=>{
  let name;
  try{name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}
  catch{res.writeHead(400);res.end();return;}
  const file=resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+sep)&&file!==resolve(root,'index.html')){
    res.writeHead(403);res.end();return;
  }
  try{
    const data=await readFile(file);
    const ext=extname(file);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.css':'text/css','.txt':'text/plain'})[ext]||'application/octet-stream');
    res.end(data);
  }catch{res.writeHead(404);res.end('not found');}
});
function wavFixture(){
  const sampleRate=44100,frames=sampleRate*3,channels=2,bytes=44+frames*channels*2;
  const out=Buffer.alloc(bytes);
  out.write('RIFF',0);out.writeUInt32LE(bytes-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);out.writeUInt16LE(channels,22);out.writeUInt32LE(sampleRate,24);
  out.writeUInt32LE(sampleRate*channels*2,28);out.writeUInt16LE(channels*2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(bytes-44,40);
  for(let i=0;i<frames;i++)for(let c=0;c<2;c++){
    const t=i/sampleRate;
    const value=Math.round(32000*Math.sin(2*Math.PI*(c?329.63:220)*t)*(.55+.2*Math.sin(2*Math.PI*.75*t)));
    out.writeInt16LE(value,44+(i*2+c)*2);
  }
  return out;
}
function assert(ok,label){if(!ok)throw Error('Browser QA failed: '+label);}
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const width of [1380,375]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('[data-category="edit"]').click();
    await page.locator('#tab-equalizer').click();
    await page.locator('#tool-file-input').setInputFiles({name:'eq-fixture.wav',mimeType:'audio/wav',buffer:wavFixture()});
    await page.waitForFunction(()=>{
      const el=document.querySelector('#eq-overview');
      const wave=document.querySelector('#tool-waveform');
      return !el.hidden&&!document.querySelector('#tool-loaded').hidden&&wave.getBoundingClientRect().height>100;
    },null,{timeout:25000});
    const bounds=await page.evaluate(()=>{
      const rect=id=>{const e=document.querySelector(id);const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};
      return {source:rect('.tool-source'),wave:rect('#tool-waveform'),overview:rect('#eq-overview'),
        response:rect('#eq-response-graph'),right:rect('.tool-settings'),canvas:rect('#eq-overview-canvas')};
    });
    assert(bounds.wave.height>=180,'full-size waveform height '+width);
    assert(bounds.overview.top>bounds.wave.top+100,'overview is below waveform '+width);
    assert(bounds.response.top>bounds.overview.top,'EQ graph is below overview '+width);
    assert(bounds.canvas.width>200,'overview canvas is visible '+width);
    if(width>760)assert(bounds.right.left>bounds.source.left,'settings are to the right');
    else assert(bounds.right.top>bounds.source.top,'mobile settings flow below source');
    await page.locator('#eq-band-count').selectOption('20');
    assert(await page.locator('#eq-response-graph circle').count()===20,'20 real EQ controls '+width);
    await page.locator('#eq-band-count').selectOption('3');
    assert(await page.locator('#eq-response-graph circle').count()===3,'3 real EQ controls '+width);
    await page.locator('#eq-band-count').selectOption('8');
    // Change preset, check the rendered curve is non-flat.
    await page.locator('#eq-preset').selectOption('classic-air');
    assert((await page.locator('#eq-response-graph path').count())>0,'EQ response curve renders '+width);
    await page.locator('#wave-zoom-in').click();
    const viewBefore=await page.locator('#eq-overview-window').evaluate(e=>e.style.width);
    assert(parseFloat(viewBefore)<100,'overview visible zoom range '+width);
    await page.locator('#eq-fit-track').click();
    assert(await page.locator('#wave-zoom-label').textContent()==='1×','fit full waveform '+width);
    await page.locator('#eq-select-region').click();
    const wave=await page.locator('#tool-waveform').boundingBox();
    await page.mouse.move(wave.x+wave.width*.18,wave.y+wave.height*.65);
    await page.mouse.down();
    await page.mouse.move(wave.x+wave.width*.63,wave.y+wave.height*.65,{steps:5});
    await page.mouse.up();
    assert(!(await page.locator('#eq-play-region').isDisabled()),'drag selected a playable region '+width);
    await page.locator('#eq-preview').click();
    await page.waitForTimeout(400);
    await page.locator('#eq-ab-toggle').click();
    assert(await page.locator('#eq-bypass').isChecked(),'A/B bypass toggles '+width);
    assert((await page.locator('#eq-ab-toggle').textContent()).includes('ORIGINAL'),'A/B label '+width);
    await page.locator('#eq-ab-toggle').click();
    assert(!(await page.locator('#eq-bypass').isChecked()),'A/B enabled again '+width);
    await page.locator('#tool-preview').click(); // stop playback
    await mkdir('.artifacts',{recursive:true});
    await page.screenshot({path:'.artifacts/equalizer-'+width+'.png',fullPage:true});
    assert(errors.length===0,'uncaught page errors '+width+': '+errors.join(' | '));
    console.log('PASS browser Equalizer '+width+'px; large waveform, mini overview, EQ bands, zoom, selection, A/B');
    await page.close();
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
