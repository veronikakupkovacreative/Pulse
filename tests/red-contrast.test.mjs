import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../source/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function luminance(hex){
  const values=(hex.match(/[0-9a-f]{2}/gi)||[]).map(n=>parseInt(n,16)/255);
  const [r,g,b]=values.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*r+0.7152*g+0.0722*b;
}
function ratio(first,second){const a=luminance(first),b=luminance(second);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}
test('dark text meets WCAG AA normal-size contrast on Pulse red',()=>{assert.ok(ratio('#191919','#ff2b20')>=4.5);});
test('the red toolkit never fades heading or disabled-action text',()=>{
  assert.match(css,/\.tool-settings \.tool-view h3 span\s*\{\s*opacity:1;\s*color:#191919;/);
  assert.match(css,/\.tool-settings :is\(\.quick-actions button,\.tool-action-dark\):disabled\s*\{\s*opacity:1;/);
  assert.match(css,/\.tool-settings \.tool-fields output\b|\.tool-settings :is\([\s\S]*?\.tool-fields output/);
  assert.ok(html.includes('Red surface contrast pass'),'compiled HTML must reflect source CSS');
});
