export type Theme = 'dark' | 'light';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // Keep meta theme-color roughly aligned
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (meta) {
    meta.content = theme === 'light' ? '#f7f7f7' : '#000000';
  }
}

