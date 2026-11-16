import type { ThemePreset } from '../types/vault';

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'editorial-paper',
    name: 'Editorial Paper & Ink',
    isDark: false,
    description: 'Archival warm paper canvas with crisp charcoal ink and cobalt accents.',
    cssVariables: {
      '--fv-canvas': '#faf9f6',
      '--fv-surface': '#ffffff',
      '--fv-subtle': '#f3f2ee',
      '--fv-border': '#e4e2dc',
      '--fv-ink': '#18181b',
      '--fv-muted': '#64646d',
      '--fv-accent': '#1d4ed8',
      '--fv-accent-ink': '#ffffff',
      '--fv-accent-soft': '#eff6ff',
      '--fv-success': '#15803d',
      '--fv-warning': '#b45309',
      '--fv-danger': '#b91c1c',
    },
  },
  {
    id: 'obsidian-slate',
    name: 'Obsidian Slate',
    isDark: true,
    description: 'Deep slate night workspace tuned for prolonged evening writing.',
    cssVariables: {
      '--fv-canvas': '#0f1115',
      '--fv-surface': '#171a21',
      '--fv-subtle': '#1e222b',
      '--fv-border': '#2a303c',
      '--fv-ink': '#f4f4f6',
      '--fv-muted': '#9ca3af',
      '--fv-accent': '#60a5fa',
      '--fv-accent-ink': '#0f1115',
      '--fv-accent-soft': 'rgba(59, 130, 246, 0.14)',
      '--fv-success': '#4ade80',
      '--fv-warning': '#fbbf24',
      '--fv-danger': '#f87171',
    },
  },
  {
    id: 'nordic-mist',
    name: 'Nordic Mist',
    isDark: false,
    description: 'Cool mineral daylight surfaces with disciplined teal accents.',
    cssVariables: {
      '--fv-canvas': '#f4f7f9',
      '--fv-surface': '#ffffff',
      '--fv-subtle': '#e9eff4',
      '--fv-border': '#d4dde6',
      '--fv-ink': '#0f172a',
      '--fv-muted': '#475569',
      '--fv-accent': '#0f766e',
      '--fv-accent-ink': '#ffffff',
      '--fv-accent-soft': '#f0fdfa',
      '--fv-success': '#15803d',
      '--fv-warning': '#b45309',
      '--fv-danger': '#b91c1c',
    },
  },
  {
    id: 'terminal-mono',
    name: 'High-Contrast Ink',
    isDark: true,
    description: 'Pure charcoal high-contrast monospace environment.',
    cssVariables: {
      '--fv-canvas': '#09090b',
      '--fv-surface': '#121215',
      '--fv-subtle': '#1b1b20',
      '--fv-border': '#2e2e36',
      '--fv-ink': '#fafafa',
      '--fv-muted': '#a1a1aa',
      '--fv-accent': '#f59e0b',
      '--fv-accent-ink': '#09090b',
      '--fv-accent-soft': 'rgba(245, 158, 11, 0.15)',
      '--fv-success': '#4ade80',
      '--fv-warning': '#fbbf24',
      '--fv-danger': '#f87171',
    },
  },
];

export const DEFAULT_CUSTOM_CSS_TEMPLATE = `/* Custom CSS Theme Override
 * Edit CSS variables or .fv-prose styles below.
 */
:root {
  /* Example: --fv-accent: #7c3aed; */
}
.fv-prose {
  /* Example: line-height: 1.8; */
}`;

export function applyVaultTheme(themeId: string, customCss: string): void {
  const preset = THEME_PRESETS.find((t) => t.id === themeId) ?? THEME_PRESETS[0];
  const root = document.documentElement;

  if (preset.isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  for (const [varName, value] of Object.entries(preset.cssVariables)) {
    root.style.setProperty(varName, value);
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', preset.cssVariables['--fv-canvas']);
  }

  let styleEl = document.getElementById('fv-custom-theme-style') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'fv-custom-theme-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = customCss || '';
}
