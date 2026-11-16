import type { NoteContent } from '../types/vault';
import { sha256Hex } from './crypto';
import { parseYamlMarkdown, serializeToYamlMarkdown } from './markdown';

export interface DirectoryHandleLike {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  values(): AsyncIterableIterator<DirectoryHandleLike | FileHandleLike>;
  kind: 'directory';
}

export interface FileHandleLike {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export function isLocalFolderSyncSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function sanitizeFilename(title: string): string {
  return title.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Untitled';
}

async function ensureNestedFolder(
  root: DirectoryHandleLike,
  folderPath: string
): Promise<DirectoryHandleLike> {
  const segments = folderPath.split('/').map((s) => s.trim()).filter(Boolean);
  let current = root;
  for (const seg of segments) {
    current = await current.getDirectoryHandle(seg, { create: true });
  }
  return current;
}

export async function pickLocalSyncDirectory(): Promise<DirectoryHandleLike | null> {
  if (!isLocalFolderSyncSupported()) return null;
  const picker = (window as unknown as { showDirectoryPicker: (opts?: unknown) => Promise<DirectoryHandleLike> })
    .showDirectoryPicker;
  try {
    return await picker({ mode: 'readwrite' });
  } catch {
    return null;
  }
}

export async function exportNotesToLocalDirectory(
  dirHandle: DirectoryHandleLike,
  notes: NoteContent[]
): Promise<number> {
  let written = 0;
  for (const note of notes) {
    const folder = await ensureNestedFolder(dirHandle, note.folderPath || 'Inbox');
    const fileName = `${sanitizeFilename(note.title)}.md`;
    const fileHandle = await folder.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(serializeToYamlMarkdown(note));
    await writable.close();
    written++;
  }
  return written;
}

export async function importMarkdownFilesFromDirectory(
  dirHandle: DirectoryHandleLike,
  prefixPath = ''
): Promise<NoteContent[]> {
  const imported: NoteContent[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const subPath = prefixPath ? `${prefixPath}/${entry.name}` : entry.name;
      const subNotes = await importMarkdownFilesFromDirectory(entry, subPath);
      imported.push(...subNotes);
    } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      const file = await entry.getFile();
      const raw = await file.text();
      const fallbackTitle = entry.name.replace(/\.md$/i, '');
      const parsed = parseYamlMarkdown(raw, fallbackTitle);
      const effectiveFolder = prefixPath || parsed.folderPath || 'Imported';
      const now = file.lastModified || Date.now();
      const hash = await sha256Hex(`${parsed.title}:${effectiveFolder}:${parsed.body}`);
      imported.push({
        id: `local-${crypto.randomUUID()}`,
        title: parsed.title,
        folderPath: effectiveFolder,
        tags: parsed.tags,
        metadata: parsed.metadata,
        body: parsed.body,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        contentHash: hash,
      });
    }
  }
  return imported;
}
