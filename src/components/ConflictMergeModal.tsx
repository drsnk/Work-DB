import React, { useMemo, useState } from 'react';
import { GitMerge, X } from 'lucide-react';
import type { ConflictPair, NoteContent } from '../types/vault';

interface ConflictMergeModalProps {
  conflict: ConflictPair | null;
  onResolve: (
    conflict: ConflictPair,
    chosen: NoteContent,
    strategy: 'local' | 'remote' | 'merged'
  ) => void;
  onClose: () => void;
}

export const ConflictMergeModal: React.FC<ConflictMergeModalProps> = ({
  conflict,
  onResolve,
  onClose,
}) => {
  const [mode, setMode] = useState<'side-by-side' | 'custom'>('side-by-side');
  const [mergedTitle, setMergedTitle] = useState(conflict?.localContent.title ?? '');
  const [mergedBody, setMergedBody] = useState(
    conflict
      ? `${conflict.localContent.body}\n\n---\n<!-- Merged from Remote Rev ${conflict.remoteContent.revision} -->\n${conflict.remoteContent.body}`
      : ''
  );

  const lineDiff = useMemo(() => {
    if (!conflict) return [];
    const localLines = conflict.localContent.body.split('\n');
    const remoteLines = conflict.remoteContent.body.split('\n');
    const maxLen = Math.max(localLines.length, remoteLines.length);
    const rows: { num: number; local: string; remote: string; differs: boolean }[] = [];
    for (let i = 0; i < maxLen; i++) {
      const l = localLines[i] ?? '';
      const r = remoteLines[i] ?? '';
      rows.push({ num: i + 1, local: l, remote: r, differs: l !== r });
    }
    return rows;
  }, [conflict]);

  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--fv-surface)',
          borderColor: 'var(--fv-border)',
          color: 'var(--fv-ink)',
        }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-4"
          style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
        >
          <div className="flex items-center gap-2.5">
            <GitMerge className="w-5 h-5" style={{ color: 'var(--fv-warning)' }} />
            <div>
              <h3 className="font-display text-lg font-semibold">
                Resolve Sync Conflict: {conflict.title}
              </h3>
              <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                Offline edits diverged from Google Drive. Compare revisions and select how to reconcile.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'side-by-side' ? 'custom' : 'side-by-side')}
              className="min-h-[38px] px-3 rounded-lg border text-xs font-medium cursor-pointer"
              style={{ borderColor: 'var(--fv-border)' }}
            >
              {mode === 'side-by-side' ? 'Edit Custom Merge' : 'Back to Side-by-Side'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:opacity-75 cursor-pointer"
              aria-label="Close merge dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'side-by-side' ? (
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--fv-border)' }}>
              <div
                className="grid grid-cols-2 border-b text-xs font-semibold"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-subtle)' }}
              >
                <div className="p-3 border-r" style={{ borderColor: 'var(--fv-border)' }}>
                  Local Device (Rev {conflict.localContent.revision} ·{' '}
                  {new Date(conflict.localContent.updatedAt).toLocaleString()})
                </div>
                <div className="p-3">
                  Google Drive Remote (Rev {conflict.remoteContent.revision} ·{' '}
                  {new Date(conflict.remoteContent.updatedAt).toLocaleString()})
                </div>
              </div>

              <div className="font-mono text-xs divide-y" style={{ borderColor: 'var(--fv-border)' }}>
                {lineDiff.map((row) => (
                  <div
                    key={row.num}
                    className="grid grid-cols-2"
                    style={{
                      backgroundColor: row.differs ? 'var(--fv-accent-soft)' : 'transparent',
                    }}
                  >
                    <div
                      className="px-3 py-1.5 border-r whitespace-pre-wrap break-words"
                      style={{ borderColor: 'var(--fv-border)' }}
                    >
                      <span className="inline-block w-7 opacity-45 select-none">{row.num}</span>
                      {row.local}
                    </div>
                    <div className="px-3 py-1.5 whitespace-pre-wrap break-words">
                      <span className="inline-block w-7 opacity-45 select-none">{row.num}</span>
                      {row.remote}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Merged Title</label>
                <input
                  type="text"
                  value={mergedTitle}
                  onChange={(e) => setMergedTitle(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border px-3 text-sm"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Merged Markdown Content</label>
                <textarea
                  value={mergedBody}
                  onChange={(e) => setMergedBody(e.target.value)}
                  rows={14}
                  className="w-full rounded-lg border p-3 font-mono text-xs leading-relaxed"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                />
              </div>
            </div>
          )}
        </div>

        <div
          className="px-6 py-4 border-t flex flex-wrap items-center justify-end gap-2.5"
          style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
        >
          <button
            type="button"
            onClick={() => onResolve(conflict, conflict.remoteContent, 'remote')}
            className="min-h-[42px] px-4 rounded-lg border text-xs font-medium cursor-pointer"
            style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
          >
            Accept Google Drive Remote
          </button>
          <button
            type="button"
            onClick={() => onResolve(conflict, conflict.localContent, 'local')}
            className="min-h-[42px] px-4 rounded-lg border text-xs font-medium cursor-pointer"
            style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
          >
            Keep Local &amp; Push
          </button>
          <button
            type="button"
            onClick={() =>
              onResolve(
                conflict,
                {
                  ...conflict.localContent,
                  title: mergedTitle || conflict.localContent.title,
                  body: mergedBody,
                  updatedAt: Date.now(),
                },
                'merged'
              )
            }
            className="min-h-[42px] px-4 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: 'var(--fv-accent)',
              color: 'var(--fv-accent-ink)',
            }}
          >
            Save Merged Version
          </button>
        </div>
      </div>
    </div>
  );
};
