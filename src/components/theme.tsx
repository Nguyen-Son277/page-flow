'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'pageflow-theme';

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function storedTheme(): Theme | null {
  try { const value = window.localStorage.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : null; }
  catch { return null; }
}
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
/** Sets the theme before first paint so the page never flashes the wrong background. */
export function ThemeScript() {
  const code = `(function(){try{var k='${THEME_KEY}';var s=null;try{s=localStorage.getItem(k)}catch(e){}var t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const initial = storedTheme() ?? systemTheme();
    applyTheme(initial); setTheme(initial); setReady(true);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    // Follow the operating system again while the user has not chosen manually.
    const onSystemChange = () => { if (!storedTheme()) { const next = systemTheme(); applyTheme(next); setTheme(next); } };
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY) { const next = storedTheme() ?? systemTheme(); applyTheme(next); setTheme(next); } };
    media?.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => { media?.removeEventListener('change', onSystemChange); window.removeEventListener('storage', onStorage); };
  }, []);
  const toggle = useCallback(() => {
    setTheme(current => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      // If storage is blocked the theme still changes for this session.
      try { window.localStorage.setItem(THEME_KEY, next); } catch {}
      return next;
    });
  }, []);
  const dark = theme === 'dark';
  const label = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return <button type="button" className={`icon-button theme-toggle ${className}`.trim()} onClick={toggle} title={label} aria-label={label} aria-pressed={ready && dark} style={ready ? undefined : { visibility: 'hidden' }}>
    {dark ? <Sun size={17} /> : <Moon size={17} />}
  </button>;
}
