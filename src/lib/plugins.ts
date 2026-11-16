import type { KeyboardShortcut, NoteContent, PluginDefinition } from '../types/vault';

export const DEFAULT_PLUGINS: PluginDefinition[] = [
  {
    id: 'plugin-callout-blocks',
    name: 'Editorial Callout Blocks',
    description: 'Transforms > [!NOTE], > [!TIP], > [!WARNING], and > [!IMPORTANT] quotes into structured callout cards.',
    enabled: true,
    builtIn: true,
    hookType: 'callout-blocks',
    slashTrigger: '/callout',
    slashTemplate: '> [!NOTE]\n> Key insight or reference note.\n',
  },
  {
    id: 'plugin-kanban-board',
    name: 'Markdown Kanban Boards',
    description: 'Renders ```kanban fenced blocks as multi-column visual task boards in Preview and HTML export.',
    enabled: true,
    builtIn: true,
    hookType: 'kanban-board',
    slashTrigger: '/kanban',
    slashTemplate: '```kanban\n## Backlog\n- Audit encryption key rotation\n\n## In Progress\n- Test offline tablet sync\n\n## Done\n- Setup AES-256-GCM vault\n```\n',
  },
  {
    id: 'plugin-smart-typography',
    name: 'Smart Typography',
    description: 'Converts --, ---, and -> outside code blocks into crisp typographic dashes and arrows.',
    enabled: true,
    builtIn: true,
    hookType: 'smart-typography',
  },
  {
    id: 'plugin-citation-footnotes',
    name: 'Citation & Footnote Enhancer',
    description: 'Formats inline [^key] citations and appends clean numbered reference anchors.',
    enabled: true,
    builtIn: true,
    hookType: 'citation-footnotes',
    slashTrigger: '/cite',
    slashTemplate: '[^ref1]\n\n[^ref1]: Author (2026). Title of reference.\n',
  },
  {
    id: 'plugin-reading-stats',
    name: 'Document Readability Metrics',
    description: 'Calculates word count, estimated reading duration, and link density in the editor footer.',
    enabled: true,
    builtIn: true,
    hookType: 'reading-stats',
  },
];

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'sc-palette', label: 'Command Palette', keys: 'mod+k', action: 'command-palette' },
  { id: 'sc-new-note', label: 'New Document', keys: 'mod+n', action: 'new-note' },
  { id: 'sc-sidebar', label: 'Toggle Navigation Rail', keys: 'mod+\\', action: 'toggle-sidebar' },
  { id: 'sc-graph', label: 'Toggle Knowledge Graph', keys: 'mod+g', action: 'toggle-graph' },
  { id: 'sc-query', label: 'Open Query & Report Builder', keys: 'mod+shift+q', action: 'toggle-query' },
  { id: 'sc-view', label: 'Cycle Edit / Split / Preview', keys: 'mod+e', action: 'cycle-view-mode' },
  { id: 'sc-snapshot', label: 'Create Recovery Snapshot', keys: 'mod+s', action: 'create-snapshot' },
  { id: 'sc-sync', label: 'Sync with Google Drive', keys: 'mod+shift+s', action: 'sync-now' },
  { id: 'sc-settings', label: 'Open Themes, Plugins & Sync', keys: 'mod+,', action: 'open-settings' },
  { id: 'sc-lock', label: 'Lock Encrypted Vault', keys: 'mod+shift+l', action: 'lock-vault' },
];

export function applyPreParsePlugins(
  markdown: string,
  note: NoteContent | null,
  plugins: PluginDefinition[]
): string {
  let output = markdown;

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;

    if (plugin.hookType === 'smart-typography') {
      // Only transform outside fenced code blocks
      const segments = output.split(/(```[\s\S]*?```|`[^`]*`)/g);
      output = segments
        .map((seg, idx) => {
          if (idx % 2 === 1) return seg;
          return seg
            .replace(/---/g, '—')
            .replace(/--/g, '–')
            .replace(/->/g, '→')
            .replace(/<-/g, '←');
        })
        .join('');
    } else if (plugin.hookType === 'custom-regex' && plugin.pattern) {
      try {
        const rx = new RegExp(plugin.pattern, 'gm');
        output = output.replace(rx, plugin.replacement ?? '');
      } catch {
        // Ignore invalid user regex
      }
    } else if (plugin.hookType === 'custom-script' && plugin.scriptBody) {
      try {
        const fn = new Function('markdown', 'metadata', plugin.scriptBody) as (
          md: string,
          meta: Record<string, unknown>
        ) => unknown;
        const result = fn(output, note?.metadata ?? {});
        if (typeof result === 'string') {
          output = result;
        }
      } catch {
        // Ignore user script error safely
      }
    }
  }

  return output;
}

export function matchShortcutEvent(e: KeyboardEvent, shortcutKeys: string): boolean {
  const parts = shortcutKeys.toLowerCase().split('+');
  const wantMod = parts.includes('mod');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');
  const key = parts[parts.length - 1];

  const hasMod = e.metaKey || e.ctrlKey;
  if (wantMod !== hasMod) return false;
  if (wantShift !== e.shiftKey) return false;
  if (wantAlt !== e.altKey) return false;

  return e.key.toLowerCase() === key;
}

export function formatShortcutLabel(keys: string): string {
  const isMac = typeof navigator !== 'undefined' && /mac|ipad|iphone/i.test(navigator.platform);
  return keys
    .split('+')
    .map((part) => {
      if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (part === 'shift') return isMac ? '⇧' : 'Shift';
      if (part === 'alt') return isMac ? '⌥' : 'Alt';
      return part.toUpperCase();
    })
    .join(isMac ? '' : '+');
}
