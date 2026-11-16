import React, { useMemo, useRef, useState } from 'react';
import {
  Bold,
  CheckSquare,
  Code,
  Columns2,
  Download,
  Edit3,
  Eye,
  FileText,
  Heading2,
  Italic,
  Link2,
  Printer,
  Sigma,
  Table2,
  X,
} from 'lucide-react';
import type {
  EditorViewMode,
  NoteContent,
  NoteIndexEntry,
  PluginDefinition,
} from '../types/vault';
import { renderMarkdownToHtml } from '../lib/markdown';
import { exportNoteAsHtml, exportNoteAsMarkdown, exportNoteAsPdf } from '../lib/export';

interface EditorWorkspaceProps {
  note: NoteContent | null;
  allNotes: NoteIndexEntry[];
  plugins: PluginDefinition[];
  themeId: string;
  customCss: string;
  viewMode: EditorViewMode;
  onChangeViewMode: (mode: EditorViewMode) => void;
  onChangeTitle: (title: string) => void;
  onChangeBody: (body: string) => void;
  onOpenWikiLink: (title: string) => void;
  onCreateNote: () => void;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  note,
  allNotes,
  plugins,
  themeId,
  customCss,
  viewMode,
  onChangeViewMode,
  onChangeTitle,
  onChangeBody,
  onOpenWikiLink,
  onCreateNote,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Interactive Table & Formula Builder state
  const [tableGrid, setTableGrid] = useState<string[][]>([
    ['Item', 'Qty', 'Price', 'Total'],
    ['License', '3', '120', '=B2*C2'],
    ['Hardware', '2', '450', '=B3*C3'],
    ['Total', '=SUM(B2:B3)', '', '=SUM(D2:D3)'],
  ]);

  const renderedHtml = useMemo(() => {
    if (!note) return '';
    return renderMarkdownToHtml(note.body, note, plugins);
  }, [note, plugins]);

  const readingStatsEnabled = plugins.some((p) => p.hookType === 'reading-stats' && p.enabled);

  const stats = useMemo(() => {
    if (!note) return { words: 0, readMin: 0 };
    const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
    const readMin = Math.max(1, Math.ceil(words / 220));
    return { words, readMin };
  }, [note]);

  const wikiCandidates = useMemo(() => {
    if (wikiQuery === null) return [];
    const q = wikiQuery.toLowerCase();
    return allNotes
      .filter((n) => !n.deleted && n.id !== note?.id && n.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [wikiQuery, allNotes, note?.id]);

  const slashItems = useMemo(() => {
    const base = [
      { trigger: '/table', label: 'Formula Table', snippet: null as string | null, action: 'table' },
      {
        trigger: '/math',
        label: 'LaTeX Math Block',
        snippet: '$$\nE = mc^2\n$$\n',
        action: 'insert',
      },
      {
        trigger: '/task',
        label: 'Checklist Item',
        snippet: '- [ ] Action item\n',
        action: 'insert',
      },
      {
        trigger: '/code',
        label: 'Code Block',
        snippet: '```typescript\n// code here\n```\n',
        action: 'insert',
      },
    ];

    for (const p of plugins) {
      if (p.enabled && p.slashTrigger && p.slashTemplate) {
        base.push({
          trigger: p.slashTrigger,
          label: p.name,
          snippet: p.slashTemplate,
          action: 'insert',
        });
      }
    }

    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return base.filter(
      (item) => item.trigger.includes(q) || item.label.toLowerCase().includes(q)
    );
  }, [plugins, slashQuery]);

  if (!note) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center p-8 text-center"
        style={{ backgroundColor: 'var(--fv-canvas)' }}
      >
        <FileText className="w-10 h-10 mb-3" style={{ color: 'var(--fv-muted)' }} />
        <h2 className="font-display text-xl font-semibold mb-1.5">No Document Selected</h2>
        <p className="text-sm max-w-sm mb-5" style={{ color: 'var(--fv-muted)' }}>
          Choose a note from the hierarchical folder rail or create a new encrypted Markdown record.
        </p>
        <button
          type="button"
          onClick={onCreateNote}
          className="min-h-[44px] px-5 rounded-lg text-sm font-medium cursor-pointer"
          style={{
            backgroundColor: 'var(--fv-accent)',
            color: 'var(--fv-accent-ink)',
          }}
        >
          Create New Document
        </button>
      </div>
    );
  }

  const insertAroundSelection = (before: string, after = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = note.body.slice(start, end);
    const updated =
      note.body.slice(0, start) + before + selected + after + note.body.slice(end);
    onChangeBody(updated);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleTextareaChange = (val: string) => {
    onChangeBody(val);
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const textBefore = val.slice(0, cursor);

    // Detect [[wiki-link trigger
    const wikiMatch = /\[\[([^\]\n]*)$/.exec(textBefore);
    if (wikiMatch) {
      setWikiQuery(wikiMatch[1]);
      setSlashQuery(null);
      return;
    }
    setWikiQuery(null);

    // Detect /slash command at start of line or after whitespace
    const slashMatch = /(?:^|\s)(\/[a-zA-Z]*)$/.exec(textBefore);
    if (slashMatch) {
      setSlashQuery(slashMatch[1]);
    } else {
      setSlashQuery(null);
    }
  };

  const completeWikiLink = (targetTitle: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = note.body.slice(0, cursor);
    const replacedBefore = before.replace(/\[\[([^\]\n]*)$/, `[[${targetTitle}]]`);
    const after = note.body.slice(cursor);
    onChangeBody(replacedBefore + after);
    setWikiQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(replacedBefore.length, replacedBefore.length);
    });
  };

  const completeSlashCommand = (item: (typeof slashItems)[number]) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = note.body.slice(0, cursor);
    const cleanedBefore = before.replace(/\/[a-zA-Z]*$/, '');
    const after = note.body.slice(cursor);

    if (item.action === 'table') {
      onChangeBody(cleanedBefore + after);
      setSlashQuery(null);
      setShowTableModal(true);
      return;
    }

    const snippet = item.snippet ?? '';
    onChangeBody(cleanedBefore + snippet + after);
    setSlashQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = cleanedBefore.length + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setWikiQuery(null);
      setSlashQuery(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertAroundSelection('**', '**');
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertAroundSelection('*', '*');
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      // Allow global Cmd+K unless text is selected
      const el = textareaRef.current;
      if (el && el.selectionStart !== el.selectionEnd) {
        e.preventDefault();
        insertAroundSelection('[', '](https://)');
      }
    }
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const linkEl = target.closest('a[data-wikilink]') as HTMLElement | null;
    if (linkEl) {
      e.preventDefault();
      const linkTitle = linkEl.getAttribute('data-wikilink');
      if (linkTitle) onOpenWikiLink(linkTitle);
    }
  };

  const insertTableFromBuilder = () => {
    const headers = tableGrid[0] ?? [];
    const sep = headers.map(() => '---');
    const rows = tableGrid.slice(1);
    const lines = [
      `| ${headers.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`),
      '',
    ];
    insertAroundSelection('\n' + lines.join('\n'));
    setShowTableModal(false);
  };

  return (
    <div
      className="h-full flex flex-col relative"
      style={{ backgroundColor: 'var(--fv-surface)', color: 'var(--fv-ink)' }}
    >
      {/* Document Toolbar (no-print) */}
      <div
        className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b"
        style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
      >
        {/* View Mode Segmented Switch */}
        <div
          className="inline-flex items-center p-0.5 rounded-lg border"
          style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-subtle)' }}
        >
          {(
            [
              { id: 'edit', label: 'Edit', icon: Edit3 },
              { id: 'split', label: 'Split', icon: Columns2 },
              { id: 'preview', label: 'Preview', icon: Eye },
            ] as const
          ).map((mode) => {
            const Icon = mode.icon;
            const active = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onChangeViewMode(mode.id)}
                className={`min-h-[36px] px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  mode.id === 'split' ? 'hidden md:inline-flex' : ''
                }`}
                style={{
                  backgroundColor: active ? 'var(--fv-surface)' : 'transparent',
                  color: active ? 'var(--fv-ink)' : 'var(--fv-muted)',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Touch-friendly Markdown Formatting Ribbon */}
        {viewMode !== 'preview' && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            {[
              { icon: Heading2, label: 'Heading', onClick: () => insertAroundSelection('## ') },
              { icon: Bold, label: 'Bold', onClick: () => insertAroundSelection('**', '**') },
              { icon: Italic, label: 'Italic', onClick: () => insertAroundSelection('*', '*') },
              { icon: Code, label: 'Code', onClick: () => insertAroundSelection('`', '`') },
              { icon: Link2, label: 'Wiki-Link', onClick: () => insertAroundSelection('[[', ']]') },
              {
                icon: CheckSquare,
                label: 'Checklist',
                onClick: () => insertAroundSelection('- [ ] '),
              },
              {
                icon: Sigma,
                label: 'LaTeX Math',
                onClick: () => insertAroundSelection('$$\n', '\n$$'),
              },
              {
                icon: Table2,
                label: 'Formula Table',
                onClick: () => setShowTableModal(true),
              },
            ].map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.label}
                  type="button"
                  onClick={btn.onClick}
                  title={btn.label}
                  aria-label={btn.label}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-md hover:opacity-75 cursor-pointer shrink-0"
                  style={{ color: 'var(--fv-ink)' }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}

        {/* Export Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowExportMenu((v) => !v)}
            className="min-h-[38px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            style={{
              borderColor: 'var(--fv-border)',
              backgroundColor: 'var(--fv-surface)',
              color: 'var(--fv-ink)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          {showExportMenu && (
            <div
              className="absolute right-0 mt-1.5 w-48 rounded-lg border py-1 shadow-lg z-30"
              style={{
                backgroundColor: 'var(--fv-surface)',
                borderColor: 'var(--fv-border)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  exportNoteAsMarkdown(note);
                  setShowExportMenu(false);
                }}
                className="w-full px-3.5 py-2.5 text-left text-xs hover:opacity-75 flex items-center justify-between cursor-pointer"
              >
                <span>Markdown (.md)</span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--fv-muted)' }}>
                  YAML
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  exportNoteAsHtml(note, plugins, themeId, customCss);
                  setShowExportMenu(false);
                }}
                className="w-full px-3.5 py-2.5 text-left text-xs hover:opacity-75 flex items-center justify-between cursor-pointer"
              >
                <span>Standalone HTML</span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--fv-muted)' }}>
                  .html
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExportMenu(false);
                  onChangeViewMode('preview');
                  setTimeout(() => exportNoteAsPdf(), 120);
                }}
                className="w-full px-3.5 py-2.5 text-left text-xs hover:opacity-75 flex items-center justify-between cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--fv-muted)' }}>
                  .pdf
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document Title & Unboxed Zero-Pill Metadata Header */}
      <div className="px-5 sm:px-8 pt-5 pb-3 border-b no-print" style={{ borderColor: 'var(--fv-border)' }}>
        <input
          type="text"
          value={note.title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Document Title"
          className="w-full font-display text-2xl sm:text-3xl font-semibold tracking-tight bg-transparent outline-none"
          style={{ color: 'var(--fv-ink)' }}
        />
        <div
          className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs tabular-nums"
          style={{ color: 'var(--fv-muted)' }}
        >
          <span>{note.folderPath}</span>
          <span aria-hidden="true">·</span>
          <span>Rev {note.revision}</span>
          <span aria-hidden="true">·</span>
          <span>Updated {new Date(note.updatedAt).toLocaleTimeString()}</span>
          {readingStatsEnabled && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {stats.words} words ({stats.readMin} min read)
              </span>
            </>
          )}
          {note.tags.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono" style={{ color: 'var(--fv-accent)' }}>
                {note.tags.map((t) => `#${t}`).join('  ')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Editor / Preview Split Canvas */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {viewMode !== 'preview' && (
          <div
            className={`h-full relative flex flex-col ${
              viewMode === 'split' ? 'w-1/2 border-r' : 'w-full'
            }`}
            style={{ borderColor: 'var(--fv-border)' }}
          >
            <textarea
              ref={textareaRef}
              value={note.body}
              onChange={(e) => handleTextareaChange(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="Write Markdown, [[wiki-links]], #tags, $LaTeX$, or type / for commands..."
              spellCheck
              className="flex-1 w-full resize-none bg-transparent p-5 sm:p-8 font-mono text-sm leading-relaxed outline-none"
              style={{ color: 'var(--fv-ink)' }}
            />

            {/* Wiki-Link Autocomplete Popover */}
            {wikiQuery !== null && wikiCandidates.length > 0 && (
              <div
                className="absolute left-6 bottom-6 z-30 w-72 rounded-lg border shadow-xl py-1"
                style={{
                  backgroundColor: 'var(--fv-surface)',
                  borderColor: 'var(--fv-border)',
                }}
              >
                <div
                  className="px-3 py-1.5 text-[11px] font-semibold border-b"
                  style={{ color: 'var(--fv-muted)', borderColor: 'var(--fv-border)' }}
                >
                  Link Document
                </div>
                {wikiCandidates.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => completeWikiLink(cand.title)}
                    className="w-full px-3 py-2 text-left text-xs hover:opacity-80 flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium truncate">{cand.title}</span>
                    <span className="text-[11px] ml-2 shrink-0" style={{ color: 'var(--fv-muted)' }}>
                      {cand.folderPath}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Slash Command Autocomplete Popover */}
            {slashQuery !== null && slashItems.length > 0 && (
              <div
                className="absolute left-6 bottom-6 z-30 w-72 rounded-lg border shadow-xl py-1"
                style={{
                  backgroundColor: 'var(--fv-surface)',
                  borderColor: 'var(--fv-border)',
                }}
              >
                <div
                  className="px-3 py-1.5 text-[11px] font-semibold border-b"
                  style={{ color: 'var(--fv-muted)', borderColor: 'var(--fv-border)' }}
                >
                  Insert Block or Plugin Command
                </div>
                {slashItems.map((item) => (
                  <button
                    key={item.trigger}
                    type="button"
                    onClick={() => completeSlashCommand(item)}
                    className="w-full px-3 py-2 text-left text-xs hover:opacity-80 flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="font-mono text-[11px]" style={{ color: 'var(--fv-accent)' }}>
                      {item.trigger}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode !== 'edit' && (
          <div
            onClick={handlePreviewClick}
            className={`fv-print-area h-full overflow-y-auto p-5 sm:p-8 ${
              viewMode === 'split' ? 'w-1/2' : 'w-full'
            }`}
          >
            <div
              className="fv-prose mx-auto"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        )}
      </div>

      {/* Interactive Table & Formula Builder Modal */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-2xl rounded-xl border p-6 shadow-xl"
            style={{
              backgroundColor: 'var(--fv-surface)',
              borderColor: 'var(--fv-border)',
              color: 'var(--fv-ink)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  Interactive Formula Table Builder
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--fv-muted)' }}>
                  Supports spreadsheet formulas: =SUM(B2:B4), =AVG(...), =MIN(...), =MAX(...), =COUNT(...), =IF(...)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="p-2 rounded-lg hover:opacity-75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto border rounded-lg mb-4" style={{ borderColor: 'var(--fv-border)' }}>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr style={{ backgroundColor: 'var(--fv-subtle)' }}>
                    <th className="p-2 border-b text-left w-10" style={{ borderColor: 'var(--fv-border)' }}>
                      #
                    </th>
                    {(tableGrid[0] ?? []).map((_, cIdx) => (
                      <th
                        key={cIdx}
                        className="p-2 border-b border-l text-center"
                        style={{ borderColor: 'var(--fv-border)', color: 'var(--fv-muted)' }}
                      >
                        {String.fromCharCode(65 + cIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableGrid.map((row, rIdx) => (
                    <tr key={rIdx}>
                      <td
                        className="p-2 border-b text-center font-semibold"
                        style={{
                          borderColor: 'var(--fv-border)',
                          backgroundColor: 'var(--fv-subtle)',
                          color: 'var(--fv-muted)',
                        }}
                      >
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="p-1 border-b border-l"
                          style={{ borderColor: 'var(--fv-border)' }}
                        >
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => {
                              const next = tableGrid.map((r) => [...r]);
                              next[rIdx][cIdx] = e.target.value;
                              setTableGrid(next);
                            }}
                            className="w-full min-h-[34px] px-2 bg-transparent outline-none"
                            style={{
                              color: cell.startsWith('=') ? 'var(--fv-accent)' : 'var(--fv-ink)',
                              fontWeight: rIdx === 0 ? 600 : 400,
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTableGrid((g) => [...g, new Array(g[0]?.length || 4).fill('')])
                  }
                  className="min-h-[40px] px-3 rounded-lg border text-xs font-medium cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  + Add Row
                </button>
                <button
                  type="button"
                  onClick={() => setTableGrid((g) => g.map((r) => [...r, '']))}
                  className="min-h-[40px] px-3 rounded-lg border text-xs font-medium cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  + Add Column
                </button>
              </div>
              <button
                type="button"
                onClick={insertTableFromBuilder}
                className="min-h-[42px] px-4 rounded-lg text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--fv-accent)',
                  color: 'var(--fv-accent-ink)',
                }}
              >
                Insert Markdown Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
