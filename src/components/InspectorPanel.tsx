import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Clock,
  History,
  Link2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import type {
  MetadataField,
  MetadataFieldType,
  NoteContent,
  NoteIndexEntry,
  SnapshotRecord,
} from '../types/vault';

interface InspectorPanelProps {
  activeNote: NoteContent | null;
  allNotes: NoteIndexEntry[];
  snapshots: { snapshot: SnapshotRecord; content: NoteContent }[];
  walActive: boolean;
  onUpdateMetadata: (metadata: Record<string, MetadataField>) => void;
  onUpdateFolderAndTags: (folderPath: string, tags: string[]) => void;
  onOpenNoteById: (noteId: string) => void;
  onLinkMention: (sourceNoteId: string, targetTitle: string) => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (content: NoteContent) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  activeNote,
  allNotes,
  snapshots,
  walActive,
  onUpdateMetadata,
  onUpdateFolderAndTags,
  onOpenNoteById,
  onLinkMention,
  onCreateSnapshot,
  onRestoreSnapshot,
}) => {
  const [tab, setTab] = useState<'properties' | 'links' | 'recovery'>('properties');
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<MetadataFieldType>('text');
  const [newTagInput, setNewTagInput] = useState('');

  const activeEntry = useMemo(
    () => allNotes.find((n) => n.id === activeNote?.id) ?? null,
    [allNotes, activeNote?.id]
  );

  const backlinks = useMemo(() => {
    if (!activeNote) return [];
    const targetLower = activeNote.title.toLowerCase();
    return allNotes.filter(
      (n) =>
        !n.deleted &&
        n.id !== activeNote.id &&
        n.outboundLinks.some((l) => l.toLowerCase() === targetLower)
    );
  }, [allNotes, activeNote]);

  const outboundTargets = useMemo(() => {
    if (!activeEntry) return [];
    return activeEntry.outboundLinks.map((linkTitle) => {
      const target = allNotes.find(
        (n) => !n.deleted && n.title.toLowerCase() === linkTitle.toLowerCase()
      );
      return { linkTitle, target };
    });
  }, [allNotes, activeEntry]);

  const unlinkedMentions = useMemo(() => {
    if (!activeNote) return [];
    const lowerTitle = activeNote.title.toLowerCase();
    return allNotes.filter((n) => {
      if (n.deleted || n.id === activeNote.id) return false;
      const alreadyLinked = n.outboundLinks.some((l) => l.toLowerCase() === lowerTitle);
      if (alreadyLinked) return false;
      // Check metadata or title similarity for quick discovery
      return n.title.toLowerCase().includes(lowerTitle.split(' ')[0] ?? '');
    });
  }, [allNotes, activeNote]);

  if (!activeNote) {
    return (
      <aside
        className="h-full border-l p-4 flex items-center justify-center text-xs"
        style={{
          backgroundColor: 'var(--fv-subtle)',
          borderColor: 'var(--fv-border)',
          color: 'var(--fv-muted)',
        }}
      >
        Select a document to inspect metadata, backlinks, and recovery snapshots.
      </aside>
    );
  }

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    const key = newKey.trim();
    if (!key) return;
    const defaultVal: string | number | boolean =
      newType === 'number'
        ? 0
        : newType === 'boolean'
        ? false
        : newType === 'date'
        ? new Date().toISOString().slice(0, 10)
        : '';
    onUpdateMetadata({
      ...activeNote.metadata,
      [key]: { key, type: newType, value: defaultVal },
    });
    setNewKey('');
  };

  const handleFieldValueChange = (key: string, value: string | number | boolean) => {
    const existing = activeNote.metadata[key];
    if (!existing) return;
    onUpdateMetadata({
      ...activeNote.metadata,
      [key]: { ...existing, value },
    });
  };

  const handleRemoveField = (key: string) => {
    const copy = { ...activeNote.metadata };
    delete copy[key];
    onUpdateMetadata(copy);
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTagInput.trim().replace(/^#/, '');
    if (!cleaned || activeNote.tags.includes(cleaned)) return;
    onUpdateFolderAndTags(activeNote.folderPath, [...activeNote.tags, cleaned]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    onUpdateFolderAndTags(
      activeNote.folderPath,
      activeNote.tags.filter((t) => t !== tag)
    );
  };

  return (
    <aside
      className="h-full flex flex-col border-l"
      style={{
        backgroundColor: 'var(--fv-subtle)',
        borderColor: 'var(--fv-border)',
        color: 'var(--fv-ink)',
      }}
    >
      {/* Inspector Tabs */}
      <div
        className="grid grid-cols-3 border-b p-1 gap-1"
        style={{ borderColor: 'var(--fv-border)' }}
      >
        {(
          [
            { id: 'properties', label: 'Properties', icon: Sliders },
            { id: 'links', label: `Links (${backlinks.length})`, icon: Link2 },
            { id: 'recovery', label: 'Recovery', icon: History },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="min-h-[40px] px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: active ? 'var(--fv-surface)' : 'transparent',
                color: active ? 'var(--fv-ink)' : 'var(--fv-muted)',
              }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
        {tab === 'properties' && (
          <>
            {/* Folder Path */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--fv-muted)' }}>
                Folder Path
              </label>
              <input
                type="text"
                value={activeNote.folderPath}
                onChange={(e) => onUpdateFolderAndTags(e.target.value, activeNote.tags)}
                placeholder="e.g. Research/Cryptography"
                className="w-full min-h-[40px] rounded-lg border px-2.5 text-xs font-mono outline-none"
                style={{
                  backgroundColor: 'var(--fv-surface)',
                  borderColor: 'var(--fv-border)',
                  color: 'var(--fv-ink)',
                }}
              />
            </div>

            {/* Hierarchical Tags (Zero-pill unboxed text list) */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--fv-muted)' }}>
                Tags (supports nested/paths)
              </label>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-2 text-xs font-mono">
                {activeNote.tags.length === 0 && (
                  <span style={{ color: 'var(--fv-muted)' }}>No tags assigned</span>
                )}
                {activeNote.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1">
                    <span style={{ color: 'var(--fv-accent)' }}>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:opacity-70 cursor-pointer"
                      style={{ color: 'var(--fv-muted)' }}
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag} className="flex gap-1.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="Add #folder/tag"
                  className="flex-1 min-h-[38px] rounded-lg border px-2.5 text-xs font-mono outline-none"
                  style={{
                    backgroundColor: 'var(--fv-surface)',
                    borderColor: 'var(--fv-border)',
                    color: 'var(--fv-ink)',
                  }}
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-3 rounded-lg border text-xs font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'var(--fv-surface)',
                    borderColor: 'var(--fv-border)',
                  }}
                >
                  Add
                </button>
              </form>
            </div>

            {/* Custom Metadata Fields */}
            <div className="pt-3 border-t" style={{ borderColor: 'var(--fv-border)' }}>
              <h4 className="text-xs font-semibold mb-2.5" style={{ color: 'var(--fv-muted)' }}>
                Custom Metadata Fields
              </h4>
              <div className="space-y-2.5">
                {Object.values(activeNote.metadata).length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                    Add structured fields below to query and aggregate this note across the database.
                  </p>
                )}
                {Object.values(activeNote.metadata).map((field) => (
                  <div
                    key={field.key}
                    className="rounded-lg border p-2.5 space-y-1.5"
                    style={{
                      backgroundColor: 'var(--fv-surface)',
                      borderColor: 'var(--fv-border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-medium truncate">
                        {field.key}{' '}
                        <span className="text-[11px]" style={{ color: 'var(--fv-muted)' }}>
                          ({field.type})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(field.key)}
                        className="p-1 rounded hover:opacity-70 cursor-pointer"
                        style={{ color: 'var(--fv-muted)' }}
                        aria-label={`Delete field ${field.key}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {field.type === 'boolean' ? (
                      <label className="flex items-center gap-2 text-xs cursor-pointer min-h-[32px]">
                        <input
                          type="checkbox"
                          checked={Boolean(field.value)}
                          onChange={(e) => handleFieldValueChange(field.key, e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span>{field.value ? 'True' : 'False'}</span>
                      </label>
                    ) : field.type === 'number' ? (
                      <input
                        type="number"
                        value={Number(field.value)}
                        onChange={(e) =>
                          handleFieldValueChange(field.key, parseFloat(e.target.value) || 0)
                        }
                        className="w-full min-h-[36px] rounded border px-2 text-xs font-mono tabular-nums outline-none"
                        style={{
                          backgroundColor: 'var(--fv-canvas)',
                          borderColor: 'var(--fv-border)',
                        }}
                      />
                    ) : field.type === 'date' ? (
                      <input
                        type="date"
                        value={String(field.value)}
                        onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                        className="w-full min-h-[36px] rounded border px-2 text-xs font-mono tabular-nums outline-none"
                        style={{
                          backgroundColor: 'var(--fv-canvas)',
                          borderColor: 'var(--fv-border)',
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(field.value)}
                        onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                        className="w-full min-h-[36px] rounded border px-2 text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--fv-canvas)',
                          borderColor: 'var(--fv-border)',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddField} className="mt-3 space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Field name (e.g. cost)"
                    className="flex-1 min-h-[38px] rounded-lg border px-2.5 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--fv-surface)',
                      borderColor: 'var(--fv-border)',
                    }}
                  />
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as MetadataFieldType)}
                    className="min-h-[38px] rounded-lg border px-2 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--fv-surface)',
                      borderColor: 'var(--fv-border)',
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Bool</option>
                    <option value="select">Select</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[40px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--fv-surface)',
                    borderColor: 'var(--fv-border)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Metadata Field
                </button>
              </form>
            </div>
          </>
        )}

        {tab === 'links' && (
          <div className="space-y-5">
            <div>
              <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--fv-muted)' }}>
                Incoming Backlinks ({backlinks.length})
              </h4>
              {backlinks.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                  No other documents reference [[{activeNote.title}]] yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {backlinks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpenNoteById(b.id)}
                      className="w-full text-left rounded-lg border p-2.5 hover:opacity-90 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--fv-surface)',
                        borderColor: 'var(--fv-border)',
                      }}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between gap-2">
                        <span className="truncate">{b.title}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fv-accent)' }} />
                      </div>
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--fv-muted)' }}>
                        {b.folderPath}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t" style={{ borderColor: 'var(--fv-border)' }}>
              <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--fv-muted)' }}>
                Outbound Links ({outboundTargets.length})
              </h4>
              {outboundTargets.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                  Use [[Document Title]] in your Markdown to connect knowledge nodes.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {outboundTargets.map(({ linkTitle, target }) => (
                    <div
                      key={linkTitle}
                      className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                      style={{
                        backgroundColor: 'var(--fv-surface)',
                        borderColor: 'var(--fv-border)',
                      }}
                    >
                      <span className="truncate font-medium">[[{linkTitle}]]</span>
                      {target ? (
                        <button
                          type="button"
                          onClick={() => onOpenNoteById(target.id)}
                          className="text-[11px] font-medium underline cursor-pointer shrink-0"
                          style={{ color: 'var(--fv-accent)' }}
                        >
                          Open
                        </button>
                      ) : (
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--fv-warning)' }}>
                          Uncreated
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {unlinkedMentions.length > 0 && (
              <div className="pt-3 border-t" style={{ borderColor: 'var(--fv-border)' }}>
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--fv-muted)' }}>
                  Related Unlinked Notes
                </h4>
                <div className="space-y-1.5">
                  {unlinkedMentions.slice(0, 4).map((u) => (
                    <div
                      key={u.id}
                      className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                      style={{
                        backgroundColor: 'var(--fv-surface)',
                        borderColor: 'var(--fv-border)',
                      }}
                    >
                      <span className="truncate">{u.title}</span>
                      <button
                        type="button"
                        onClick={() => onLinkMention(u.id, activeNote.title)}
                        className="text-[11px] font-medium underline cursor-pointer shrink-0"
                        style={{ color: 'var(--fv-accent)' }}
                      >
                        Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'recovery' && (
          <div className="space-y-4">
            <div
              className="rounded-lg border p-3 space-y-1.5"
              style={{
                backgroundColor: 'var(--fv-surface)',
                borderColor: 'var(--fv-border)',
              }}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" style={{ color: 'var(--fv-success)' }} />
                Crash-Safe WAL Active
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--fv-muted)' }}>
                {walActive
                  ? 'Encrypted Write-Ahead Log checkpointing active edits.'
                  : 'All edits committed & encrypted in local IndexedDB vault.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onCreateSnapshot}
              className="w-full min-h-[42px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--fv-surface)',
                borderColor: 'var(--fv-border)',
              }}
            >
              <Clock className="w-3.5 h-3.5" />
              Create Snapshot Checkpoint
            </button>

            <div>
              <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--fv-muted)' }}>
                Version History ({snapshots.length})
              </h4>
              {snapshots.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                  Snapshots are automatically recorded during edits and sync merges.
                </p>
              ) : (
                <div className="space-y-2">
                  {snapshots.map(({ snapshot, content }) => (
                    <div
                      key={snapshot.snapshotId}
                      className="rounded-lg border p-2.5 text-xs space-y-1.5"
                      style={{
                        backgroundColor: 'var(--fv-surface)',
                        borderColor: 'var(--fv-border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono tabular-nums text-[11px]">
                          {new Date(snapshot.timestamp).toLocaleString()}
                        </span>
                        <span className="text-[11px] capitalize" style={{ color: 'var(--fv-muted)' }}>
                          {snapshot.reason}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--fv-muted)' }}>
                          {content.body.length} chars · rev {content.revision}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRestoreSnapshot(content)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium underline cursor-pointer"
                          style={{ color: 'var(--fv-accent)' }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
