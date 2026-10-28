"""Offline UI browser smoke test: mock helper fetch, real bundled UI."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
VIDEO='https://www.youtube.com/watch?v=dQw4w9WgXcQ'
MOCK_JS=r'''() => {
  window.__downloads = [];
  window.fetch = async (url, opts) => {
    if (url.endsWith('/api/youtube/health')) return {ok:true,json:async()=>({ready:true,missing:[]})};
    if (url.endsWith('/api/youtube/info')) return {ok:true,json:async()=>({source:{title:'Pulse integration test',codec:'opus',bitrate:160,sampleRate:48000,container:'WEBM',duration:230}})};
    if (url.endsWith('/api/youtube/download')) return {ok:true,json:async()=>({id:'test-token',filename:'test.wav',bytes:3456789})};
    throw new Error('Unexpected request: '+url);
  };
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (this.id === 'yt-save-link') {window.__downloads.push({href:this.getAttribute('href'),name:this.download});return;}
    return original.call(this);
  };
}'''

async def open_ui(browser,viewport):
  page=await browser.new_page(viewport=viewport,accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  await page.goto('about:blank')
  await page.evaluate(MOCK_JS)
  await page.set_content((ROOT/'index.html').read_text(),wait_until='domcontentloaded')
  return page,errors

async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    page,errors=await open_ui(browser,{'width':1440,'height':1000})
    assert await page.locator('#open-youtube').is_visible()
    await page.locator('#open-youtube').click()
    assert not await page.locator('#panel-youtube').is_hidden()
    assert await page.locator('#youtube-source').is_visible()
    await page.locator('#yt-url').fill(VIDEO)
    await page.wait_for_function("document.querySelector('#yt-title').textContent === 'Pulse integration test'",timeout=10000)
    assert await page.locator('#yt-codec').inner_text() == 'OPUS'
    assert not await page.locator('#yt-download').is_disabled()
    await page.screenshot(path=str(ROOT/'preview-youtube-desktop.png'),full_page=True)
    await page.locator('#yt-download').click()
    await page.wait_for_function('window.__downloads.length===1',timeout=8000)
    assert (await page.evaluate('window.__downloads'))[0]['href']=='http://127.0.0.1:8000/api/youtube/file/test-token'
    print('UI download link:',await page.evaluate('window.__downloads'))
    await page.locator('#yt-format').select_option('native')
    await page.locator('#yt-download').click()
    await page.wait_for_function('window.__downloads.length===2')
    mobile,mobile_errors=await open_ui(browser,{'width':390,'height':844})
    await mobile.locator('#open-youtube').click()
    await mobile.screenshot(path=str(ROOT/'preview-youtube-mobile.png'),full_page=True)
    dims=await mobile.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    print('Mobile widths:',dims)
    assert dims['scroll'] <= dims['width'], f'Horizontal overflow {dims}'
    print('Browser JS errors:', errors+mobile_errors)
    assert not errors+mobile_errors
    await browser.close()

if __name__=='__main__':
  asyncio.run(main())
