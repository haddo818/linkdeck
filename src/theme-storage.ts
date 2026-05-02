const THEME_KEY = 'linkdeck-theme';

export type StoredTheme = 'dark' | 'light';

export function initThemeFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(THEME_KEY) as StoredTheme | null;
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (stored === 'light') {
      document.documentElement.classList.remove('dark');
    }
  } catch {
    /* private mode / quota */
  }
}

export function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    return false;
  }
}

export function persistDarkMode(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
  try {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  } catch {
    /* ignore */
  }
}
