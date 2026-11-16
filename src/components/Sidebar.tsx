import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Hash,
  Search,
  Trash2,
} from 'lucide-react';
import type { NoteIndexEntry, QueryDefinition } from '../types/vault';

interface SidebarProps {
  notes: NoteIndexEntry[];
  queries: QueryDefinition[];
  activeNoteId: string | null;
  searchQuery: string;
  selectedFolder: string;
  selectedTag: string;
  onSearchChange: (q: string) => void;
  onSelectFolder: (folder: string) => void;
  onSelectTag: (tag: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (folderPath?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onRunSavedQuery: (query: QueryDefinition) => void;
}

interface FolderNode {
  name: string;
  fullPath: string;
  children: Map<string, FolderNode>;
  count: number;
}

function buildFolderTree(notes: NoteIndexEntry[]): FolderNode {
  const root: FolderNode = { name: 'All Documents', fullPath: 'ALL', children: new Map(), count: 0 };
  for (const n of notes) {
    if (n.deleted) continue;
    root.count++;
    const parts = (n.folderPath || 'Inbox').split('/').map((s) => s.trim()).filter(Boolean);
    let curr = root;
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}/${part}` : part;
      if (!curr.children.has(part)) {
        curr.children.set(part, {
          name: part,
          fullPath: accum,
          children: new Map(),
          count: 0,
        });
      }
      curr = curr.children.get(part)!;
      curr.count++;
    }
  }
  return root;
}

interface TagNode {
  segment: string;
  fullTag: string;
  children: Map<string, TagNode>;
  count: number;
}

function buildTagTree(notes: NoteIndexEntry[]): TagNode {
  const root: TagNode = { segment: '', fullTag: '', children: new Map(), count: 0 };
  for (const n of notes) {
    if (n.deleted) continue;
    for (const tag of n.tags) {
      const parts = tag.split('/').map((s) => s.trim()).filter(Boolean);
      let curr = root;
      let accum = '';
      for (const p of parts) {
        accum = accum ? `${accum}/${p}` : p;
        if (!curr.children.has(p)) {
          curr.children.set(p, { segment: p, fullTag: accum, children: new Map(), count: 0 });
        }
        curr = curr.children.get(p)!;
        curr.count++;
      }
    }
  }
  return root;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  queries,
  activeNoteId,
  searchQuery,
  selectedFolder,
  selectedTag,
  onSearchChange,
  onSelectFolder,
  onSelectTag,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onRunSavedQuery,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    Research: true,
    Projects: true,
  });
  const [sectionOpen, setSectionOpen] = useState({
    folders: true,
    tags: true,
    queries: true,
  });

  const activeNotes = useMemo(() => notes.filter((n) => !n.deleted), [notes]);
  const folderTree = useMemo(() => buildFolderTree(activeNotes), [activeNotes]);
  const tagTree = useMemo(() => buildTagTree(activeNotes), [activeNotes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeNotes
      .filter((n) => {
        if (selectedFolder !== 'ALL' && !n.folderPath.startsWith(selectedFolder)) return false;
        if (
          selectedTag &&
          !n.tags.some((t) => t === selectedTag || t.startsWith(`${selectedTag}/`))
        ) {
          return false;
        }
        if (q) {
          const inTitle = n.title.toLowerCase().includes(q);
          const inTags = n.tags.some((t) => t.toLowerCase().includes(q));
          const inFolder = n.folderPath.toLowerCase().includes(q);
          const inMeta = Object.values(n.metadata).some((m) =>
            String(m.value).toLowerCase().includes(q)
          );
          return inTitle || inTags || inFolder || inMeta;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeNotes, selectedFolder, selectedTag, searchQuery]);

  const toggleFolderExpand = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderFolderNode = (node: FolderNode, depth = 0): React.ReactNode => {
    const hasChildren = node.children.size > 0;
    const isExpanded = !!expandedFolders[node.fullPath];
    const isSelected = selectedFolder === node.fullPath;

    return (
      <div key={node.fullPath}>
        <div
          className="flex items-center justify-between gap-1 rounded-md pr-2 min-h-[38px] text-xs transition-colors"
          style={{
            paddingLeft: `${8 + depth * 14}px`,
            backgroundColor: isSelected ? 'var(--fv-accent-soft)' : 'transparent',
            color: isSelected ? 'var(--fv-accent)' : 'var(--fv-ink)',
          }}
        >
          <button
            type="button"
            onClick={() => onSelectFolder(node.fullPath)}
            className="flex items-center gap-1.5 flex-1 min-w-0 py-1.5 text-left cursor-pointer"
          >
            {hasChildren ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolderExpand(node.fullPath);
                }}
                className="p-0.5 rounded hover:opacity-70"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )}
              </span>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {isSelected || isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate font-medium">{node.name}</span>
          </button>
          <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--fv-muted)' }}>
            {node.count}
          </span>
        </div>
        {hasChildren &&
          isExpanded &&
          Array.from(node.children.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => renderFolderNode(child, depth + 1))}
      </div>
    );
  };

  const renderTagNode = (node: TagNode, depth = 0): React.ReactNode => {
    const isSelected = selectedTag === node.fullTag;
    return (
      <div key={node.fullTag}>
        <button
          type="button"
          onClick={() => onSelectTag(isSelected ? '' : node.fullTag)}
          className="w-full flex items-center justify-between gap-2 rounded-md pr-2 min-h-[34px] text-xs text-left cursor-pointer transition-colors"
          style={{
            paddingLeft: `${10 + depth * 12}px`,
            backgroundColor: isSelected ? 'var(--fv-accent-soft)' : 'transparent',
            color: isSelected ? 'var(--fv-accent)' : 'var(--fv-muted)',
          }}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Hash className="w-3 h-3 shrink-0" />
            <span className="truncate font-mono">{node.segment}</span>
          </span>
          <span className="text-[11px] tabular-nums shrink-0">{node.count}</span>
        </button>
        {Array.from(node.children.values())
          .sort((a, b) => a.segment.localeCompare(b.segment))
          .map((child) => renderTagNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside
      className="h-full flex flex-col border-r select-none"
      style={{
        backgroundColor: 'var(--fv-subtle)',
        borderColor: 'var(--fv-border)',
        color: 'var(--fv-ink)',
      }}
    >
      {/* Search + New Note */}
      <div className="p-3 border-b space-y-2.5" style={{ borderColor: 'var(--fv-border)' }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--fv-muted)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter title, #tag, metadata..."
              className="w-full min-h-[40px] rounded-lg border pl-8 pr-2.5 text-xs outline-none"
              style={{
                backgroundColor: 'var(--fv-surface)',
                borderColor: 'var(--fv-border)',
                color: 'var(--fv-ink)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => onCreateNote(selectedFolder === 'ALL' ? 'Inbox' : selectedFolder)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--fv-accent)',
              color: 'var(--fv-accent-ink)',
            }}
            title="New document"
            aria-label="Create new document"
          >
            <FilePlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Hierarchy & Documents */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Hierarchical Folders */}
        <div>
          <button
            type="button"
            onClick={() => setSectionOpen((s) => ({ ...s, folders: !s.folders }))}
            className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--fv-muted)' }}
          >
            <span>Folders</span>
            {sectionOpen.folders ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          {sectionOpen.folders && (
            <div className="mt-1 space-y-0.5">
              <button
                type="button"
                onClick={() => onSelectFolder('ALL')}
                className="w-full flex items-center justify-between gap-2 px-2.5 min-h-[38px] rounded-md text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: selectedFolder === 'ALL' ? 'var(--fv-accent-soft)' : 'transparent',
                  color: selectedFolder === 'ALL' ? 'var(--fv-accent)' : 'var(--fv-ink)',
                }}
              >
                <span className="truncate">All Documents</span>
                <span className="tabular-nums text-[11px]" style={{ color: 'var(--fv-muted)' }}>
                  {activeNotes.length}
                </span>
              </button>
              {Array.from(folderTree.children.values())
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((node) => renderFolderNode(node, 0))}
            </div>
          )}
        </div>

        {/* Hierarchical Tags */}
        <div>
          <button
            type="button"
            onClick={() => setSectionOpen((s) => ({ ...s, tags: !s.tags }))}
            className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--fv-muted)' }}
          >
            <span>Hierarchical Tags</span>
            {sectionOpen.tags ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          {sectionOpen.tags && (
            <div className="mt-1 space-y-0.5">
              {tagTree.children.size === 0 ? (
                <p className="px-2.5 py-1 text-xs" style={{ color: 'var(--fv-muted)' }}>
                  No tags indexed yet
                </p>
              ) : (
                Array.from(tagTree.children.values())
                  .sort((a, b) => a.segment.localeCompare(b.segment))
                  .map((node) => renderTagNode(node, 0))
              )}
            </div>
          )}
        </div>

        {/* Saved Queries */}
        <div>
          <button
            type="button"
            onClick={() => setSectionOpen((s) => ({ ...s, queries: !s.queries }))}
            className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--fv-muted)' }}
          >
            <span>Saved Queries</span>
            {sectionOpen.queries ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          {sectionOpen.queries && (
            <div className="mt-1 space-y-0.5">
              {queries.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onRunSavedQuery(q)}
                  className="w-full flex items-center gap-2 px-2.5 min-h-[36px] rounded-md text-xs text-left hover:opacity-80 cursor-pointer"
                  style={{ color: 'var(--fv-ink)' }}
                >
                  <Database className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--fv-accent)' }} />
                  <span className="truncate">{q.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--fv-border)' }}>
          <div className="flex items-center justify-between px-2 pb-1.5 text-xs font-semibold" style={{ color: 'var(--fv-muted)' }}>
            <span>
              Documents ({filteredNotes.length})
            </span>
            {(selectedFolder !== 'ALL' || selectedTag) && (
              <button
                type="button"
                onClick={() => {
                  onSelectFolder('ALL');
                  onSelectTag('');
                }}
                className="underline text-[11px] cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>

          {filteredNotes.length === 0 ? (
            <div className="px-2.5 py-4 text-xs" style={{ color: 'var(--fv-muted)' }}>
              No documents match the active filter.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredNotes.map((note) => {
                const isActive = note.id === activeNoteId;
                return (
                  <div
                    key={note.id}
                    className="group flex items-start justify-between gap-1.5 rounded-lg px-2.5 py-2 transition-colors border"
                    style={{
                      backgroundColor: isActive ? 'var(--fv-surface)' : 'transparent',
                      borderColor: isActive ? 'var(--fv-border)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNote(note.id)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <FileText
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: isActive ? 'var(--fv-accent)' : 'var(--fv-muted)' }}
                        />
                        <span className="text-xs font-semibold truncate">{note.title}</span>
                      </div>
                      <div
                        className="mt-1 flex items-center gap-1.5 text-[11px] truncate tabular-nums"
                        style={{ color: 'var(--fv-muted)' }}
                      >
                        <span>{note.folderPath}</span>
                        {note.dirty && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span style={{ color: 'var(--fv-warning)' }}>Unsynced</span>
                          </>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--fv-muted)' }}
                      title="Delete document"
                      aria-label={`Delete ${note.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
