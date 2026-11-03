import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../source/'+p,import.meta.url),'utf8');
const categories=['analyze','edit','export','ai','visuals'];
test('header menu is restored to the original simple category links',()=>{
 const html=read('index.html'),start=html.indexOf('<nav aria-label="Main navigation"'),end=html.indexOf('</nav>',start);
 assert.ok(start>=0&&end>start);
 const nav=html.slice(start,end);
 for(const category of categories)assert.match(nav,new RegExp('data-category-link="'+category+'"'));
 assert.match(nav,/class="nav-bpm">BPM/);
 assert.doesNotMatch(nav,/nav-dropdown|aria-haspopup|aria-expanded|⌄/);
});
test('active category is marked by the original small red dot, not a dropdown control',()=>{
 const css=read('style.css'),app=read('app.mjs');
 assert.match(css,/\.header-nav a\.is-active::before\{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var\(--red\)/);
 assert.match(app,/link\.classList\.toggle\('is-active',selected\)/);
 assert.match(app,/link\.dataset\.categoryLink/);
 assert.doesNotMatch(app,/nav-dropdown|updateDropdownSelection|renderDropdownMenus/);
});
test('category navigation still switches the registered tools and hides unconfigured tools',()=>{
 const app=read('app.mjs');
 assert.match(app,/document\.querySelectorAll\('\[data-category-link\]'\)/);
 assert.match(app,/activateCategory\(link\.dataset\.categoryLink\)/);
 assert.match(app,/function validModules\(category\)/);
});
