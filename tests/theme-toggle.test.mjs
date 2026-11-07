import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {THEME_STORAGE_KEY,normalizeTheme,readSavedTheme,applyTheme,initializeThemeToggle} from '../source/modules/theme-toggle.mjs';

const read = path => readFileSync(new URL('../source/' + path, import.meta.url), 'utf8');

function fixture(saved = null, failStorage = false) {
  const attrs = new Map();
  const root = {
    style: {},
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name) ?? null; }
  };
  const buttonAttrs = new Map();
  let onClick = null;
  const button = {
    setAttribute(name, value) { buttonAttrs.set(name, String(value)); },
    getAttribute(name) { return buttonAttrs.get(name); },
    addEventListener(name, fn) { assert.equal(name, 'click'); onClick = fn; },
    removeEventListener(name, fn) { assert.equal(name, 'click'); if (onClick === fn) onClick = null; },
    click() { onClick?.(); },
    get connected() { return Boolean(onClick); }
  };
  let themeColor = null;
  const meta = { setAttribute(name, value) { assert.equal(name, 'content'); themeColor = value; }, get content() {return themeColor;} };
  const store = new Map(saved === null ? [] : [[THEME_STORAGE_KEY, saved]]);
  const storage = failStorage ? {
    getItem() { throw Error('Storage blocked'); },
    setItem() { throw Error('Storage blocked'); }
  } : {
    getItem(k) {return store.get(k) ?? null; },
    setItem(k, v) {store.set(k, v); }
  };
  return {root, button, meta, storage, store};
}

test('theme preference remains explicitly light by default', () => {
  assert.equal(normalizeTheme(undefined), 'light');
  assert.equal(normalizeTheme('auto'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(THEME_STORAGE_KEY, 'pulse-theme');
  assert.equal(readSavedTheme(fixture().storage), 'light');
});

test('saved dark mode restores at initialization without rewriting storage', () => {
  const f = fixture('dark');
  const unsubscribe = initializeThemeToggle(f);
  assert.equal(f.root.getAttribute('data-theme'), 'dark');
  assert.equal(f.root.style.colorScheme, 'dark');
  assert.equal(f.button.getAttribute('aria-label'), 'Switch to light mode');
  assert.equal(f.button.getAttribute('aria-pressed'), 'true');
  assert.equal(f.meta.content, '#121314');
  assert.equal(f.store.get(THEME_STORAGE_KEY), 'dark');
  assert.equal(f.button.connected, true);
  unsubscribe();
  assert.equal(f.button.connected, false);
});

test('one top-level toggle switches dark/light, updates ARIA and persists choice', () => {
  const f = fixture();
  const unsubscribe = initializeThemeToggle(f);
  assert.equal(f.root.getAttribute('data-theme'), 'light');
  assert.equal(f.button.getAttribute('aria-label'), 'Switch to dark mode');
  f.button.click();
  assert.equal(f.root.getAttribute('data-theme'), 'dark');
  assert.equal(f.meta.content, '#121314');
  assert.equal(f.store.get(THEME_STORAGE_KEY), 'dark');
  assert.equal(f.button.getAttribute('aria-pressed'), 'true');
  f.button.click();
  assert.equal(f.root.getAttribute('data-theme'), 'light');
  assert.equal(f.meta.content, '#f5f4f0');
  assert.equal(f.store.get(THEME_STORAGE_KEY), 'light');
  assert.equal(f.button.getAttribute('aria-pressed'), 'false');
  unsubscribe();
  f.button.click();
  assert.equal(f.store.get(THEME_STORAGE_KEY), 'light');
});

test('disabled storage does not prevent appearance changes', () => {
  const f = fixture(null, true);
  assert.equal(readSavedTheme(f.storage), 'light');
  assert.doesNotThrow(() => applyTheme('dark', f));
  assert.equal(f.root.getAttribute('data-theme'), 'dark');
  const unsubscribe = initializeThemeToggle(f);
  f.button.click();
  assert.equal(f.root.getAttribute('data-theme'), 'dark');
  unsubscribe();
});

test('theme control is a single icon-only button in the header and bootstraps before CSS', () => {
  const html = read('index.html');
  assert.equal((html.match(/id="pulse-theme-toggle"/g) || []).length, 1);
  const brand = html.indexOf('class="brand"');
  const toggle = html.indexOf('id="pulse-theme-toggle"');
  const nav = html.indexOf('class="header-nav"');
  assert.ok(brand >= 0 && toggle > brand && nav > toggle);
  assert.match(html, /type="button" aria-label="Switch to dark mode" aria-pressed="false"/);
  assert.match(html, /class="pulse-theme-moon"/);
  assert.match(html, /class="pulse-theme-sun"/);
  assert.ok(html.indexOf("localStorage.getItem('pulse-theme')") < html.indexOf('href="/style.css"'));
  assert.ok(html.indexOf('href="/modules/theme.css"') > html.indexOf('href="/style.css"'));
  assert.ok(html.indexOf('href="/modules/theme.css"') < html.indexOf('src="/app.mjs"'));
  const app = read('app.mjs');
  assert.match(app, /import \{initializeThemeToggle\} from '\.\/modules\/theme-toggle\.mjs'/);
  assert.match(app, /initializeThemeToggle\(\)/);
});

test('dark mode applies to editorial surfaces while audio panels retain red and black', () => {
  const css = read('modules/theme.css');
  assert.match(css, /html\[data-theme="dark"\] body\{background:#121314;color:#f5f4f0\}/);
  assert.match(css, /html\[data-theme="dark"\] \.tool-settings,/);
  assert.match(css, /background:#ff2b20;color:#191919/);
  assert.match(css, /html\[data-theme="dark"\] \.pulse-benefits/);
  assert.match(css, /html\[data-theme="dark"\] \.pulse-bitrate-guide/);
  assert.match(css, /html\[data-theme="dark"\] \.tap-tempo-dialog/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /border-radius:0/);
  assert.doesNotMatch(css, /filter:\s*invert/);
});
