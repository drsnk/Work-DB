import React, { useMemo, useState } from 'react';
import {
  Database,
  FilePlus,
  FileText,
  Lock,
  Network,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import type { NoteIndexEntry } from '../types/vault';

interface CommandPaletteProps {
  open: boolean;
  notes: NoteIndexEntry[];
  onClose: () => void;
  onSelectNote: (noteId: string) => void;
  onAction: (
    action:
      | 'new-note'
      | 'open-graph'
      | 'open-query'
      | 'open-settings'
      | 'sync-now'
      | 'lock-vault'
  ) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  notes,
  onClose,
  onSelectNote,
  onAction,
}) => {
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions = [
      { id: 'act-new', label: 'Create New Document', icon: FilePlus, run: () => onAction('new-note') },
      { id: 'act-graph', label: 'Open Knowledge Graph Mode', icon: Network, run: () => onAction('open-graph') },
      { id: 'act-query', label: 'Open Query & Report Builder', icon: Database, run: () => onAction('open-query') },
      { id: 'act-sync', label: 'Sync Encrypted Vault with Google Drive', icon: RefreshCw, run: () => onAction('sync-now') },
      { id: 'act-settings', label: 'Open Themes, Plugins & Sync Studio', icon: Settings, run: () => onAction('open-settings') },
      { id: 'act-lock', label: 'Lock Vault & Clear Session Keys', icon: Lock, run: () => onAction('lock-vault') },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));

    const matchedNotes = notes
      .filter(
        (n) =>
          !n.deleted &&
          (!q ||
            n.title.toLowerCase().includes(q) ||
            n.folderPath.toLowerCase().includes(q) ||
            n.tags.some((t) => t.toLowerCase().includes(q)))
      )
      .slice(0, 8);

    return { actions, matchedNotes };
  }, [query, notes, onAction]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-16 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--fv-surface)',
          borderColor: 'var(--fv-border)',
          color: 'var(--fv-ink)',
        }}
      >
        <div
          className="flex items-center gap-2.5 px-4 py-3 border-b"
          style={{ borderColor: 'var(--fv-border)' }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--fv-muted)' }} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Jump to document, #tag, or command..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-mono px-2 py-1 rounded border cursor-pointer"
            style={{ borderColor: 'var(--fv-border)', color: 'var(--fv-muted)' }}
          >
            ESC
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {items.matchedNotes.length > 0 && (
            <div className="mb-2">
              <div className="px-4 py-1 text-[11px] font-semibold" style={{ color: 'var(--fv-muted)' }}>
                Documents
              </div>
              {items.matchedNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onSelectNote(n.id);
                    onClose();
                    setQuery('');
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs flex items-center justify-between hover:opacity-80 cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-medium truncate">
                    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fv-accent)' }} />
                    <span className="truncate">{n.title}</span>
                  </span>
                  <span className="text-[11px] shrink-0 ml-3" style={{ color: 'var(--fv-muted)' }}>
                    {n.folderPath}
                  </span>
                </button>
              ))}
            </div>
          )}

          {items.actions.length > 0 && (
            <div>
              <div className="px-4 py-1 text-[11px] font-semibold" style={{ color: 'var(--fv-muted)' }}>
                Commands
              </div>
              {items.actions.map((act) => {
                const Icon = act.icon;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => {
                      act.run();
                      onClose();
                      setQuery('');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs flex items-center gap-2.5 hover:opacity-80 cursor-pointer"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fv-muted)' }} />
                    <span className="font-medium">{act.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
