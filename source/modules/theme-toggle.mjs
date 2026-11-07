/**
 * PULSE Studio light/dark appearance.
 * Only affects UI. Audio buffers, DSP state and history are not touched.
 */
export const THEME_STORAGE_KEY = 'pulse-theme';

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

export function readSavedTheme(storage = globalThis.localStorage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

export function applyTheme(mode, {
  root = globalThis.document?.documentElement,
  button = globalThis.document?.getElementById('pulse-theme-toggle'),
  meta = globalThis.document?.querySelector('meta[name="theme-color"]'),
  storage = globalThis.localStorage,
  persist = true
} = {}) {
  const theme = normalizeTheme(mode);
  if (root) {
    root.setAttribute('data-theme', theme);
    if (root.style) root.style.colorScheme = theme;
  }
  const action = theme === 'dark' ? 'light' : 'dark';
  if (button) {
    button.setAttribute('aria-label', 'Switch to ' + action + ' mode');
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('title', 'Switch to ' + action + ' mode');
  }
  meta?.setAttribute('content', theme === 'dark' ? '#121314' : '#f5f4f0');
  if (persist) {
    try { storage?.setItem(THEME_STORAGE_KEY, theme); } catch {
      // Private browsing and disabled storage must not break the toggle.
    }
  }
  return theme;
}

export function initializeThemeToggle({
  root = globalThis.document?.documentElement,
  button = globalThis.document?.getElementById('pulse-theme-toggle'),
  meta = globalThis.document?.querySelector('meta[name="theme-color"]'),
  storage = globalThis.localStorage
} = {}) {
  if (!root || !button) return () => {};
  applyTheme(readSavedTheme(storage), {root, button, meta, storage, persist: false});
  const toggle = () => {
    const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, {root, button, meta, storage});
  };
  button.addEventListener('click', toggle);
  return () => button.removeEventListener('click', toggle);
}
