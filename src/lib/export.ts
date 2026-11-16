import type { NoteContent, PluginDefinition } from '../types/vault';
import { renderMarkdownToHtml, serializeToYamlMarkdown } from './markdown';
import { THEME_PRESETS } from './themes';

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'document'
  );
}

export function exportNoteAsMarkdown(note: NoteContent): void {
  const md = serializeToYamlMarkdown(note);
  triggerDownload(`${safeSlug(note.title)}.md`, md, 'text/markdown;charset=utf-8');
}

export function exportNoteAsHtml(
  note: NoteContent,
  plugins: PluginDefinition[],
  themeId: string,
  customCss: string
): void {
  const rendered = renderMarkdownToHtml(note.body, note, plugins);
  const preset = THEME_PRESETS.find((t) => t.id === themeId) ?? THEME_PRESETS[0];
  const varsCss = Object.entries(preset.cssVariables)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n  ');

  const metadataItems = Object.values(note.metadata)
    .map((m) => `<span><strong>${m.key}:</strong> ${String(m.value)}</span>`)
    .join(' · ');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${note.title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    :root {
      ${varsCss}
    }
    body {
      margin: 0;
      padding: 3rem 1.5rem;
      background: var(--fv-canvas);
      color: var(--fv-ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.7;
    }
    main {
      max-width: 74ch;
      margin: 0 auto;
      background: var(--fv-surface);
      border: 1px solid var(--fv-border);
      border-radius: 10px;
      padding: 2.5rem;
    }
    .meta {
      font-size: 0.85rem;
      color: var(--fv-muted);
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--fv-border);
    }
    h1, h2, h3 { line-height: 1.25; }
    table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; }
    th, td { border: 1px solid var(--fv-border); padding: 0.5rem 0.75rem; text-align: left; }
    th { background: var(--fv-subtle); }
    pre, code { font-family: ui-monospace, SFMono-Regular, monospace; background: var(--fv-subtle); }
    pre { padding: 1rem; border-radius: 8px; overflow-x: auto; border: 1px solid var(--fv-border); }
    code { padding: 0.1rem 0.3rem; border-radius: 4px; }
    .fv-callout { border: 1px solid var(--fv-border); background: var(--fv-subtle); border-radius: 8px; padding: 0.85rem 1rem; margin: 1rem 0; }
    .fv-callout-title { font-weight: 600; color: var(--fv-accent); font-size: 0.8rem; margin-bottom: 0.25rem; }
    .fv-formula-cell { color: var(--fv-accent); font-weight: 600; font-family: ui-monospace, monospace; }
    ${customCss}
  </style>
</head>
<body>
  <main>
    <div class="meta">
      <div><strong>Folder:</strong> ${note.folderPath} · <strong>Tags:</strong> ${note.tags
    .map((t) => `#${t}`)
    .join(', ') || 'None'}</div>
      ${metadataItems ? `<div style="margin-top:0.35rem;">${metadataItems}</div>` : ''}
    </div>
    <article>${rendered}</article>
  </main>
</body>
</html>`;

  triggerDownload(`${safeSlug(note.title)}.html`, html, 'text/html;charset=utf-8');
}

export function exportNoteAsPdf(): void {
  window.print();
}
