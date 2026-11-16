import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  EncryptedEnvelope,
  KeyboardShortcut,
  NoteContent,
  NoteIndexEntry,
  PluginDefinition,
  QueryDefinition,
  SnapshotRecord,
  VaultHeader,
  WalEntry,
} from '../types/vault';
import { decryptPayload, encryptPayload } from './crypto';

interface FolioVaultDB extends DBSchema {
  vaultMeta: {
    key: string;
    value: VaultHeader;
  };
  noteIndex: {
    key: string;
    value: { id: string; iv: string; ciphertext: string };
  };
  notes: {
    key: string;
    value: EncryptedEnvelope;
  };
  wal: {
    key: string;
    value: WalEntry;
    indexes: { 'by-note': string };
  };
  snapshots: {
    key: string;
    value: SnapshotRecord;
    indexes: { 'by-note': string };
  };
  queries: {
    key: string;
    value: { id: string; iv: string; ciphertext: string };
  };
  plugins: {
    key: string;
    value: PluginDefinition;
  };
  shortcuts: {
    key: string;
    value: KeyboardShortcut;
  };
}

const DB_NAME = 'foliovault-db';
const DB_VERSION = 1;
const MAX_LRU_BODIES = 18; // Keeps RAM footprint minimal even on large vaults

let dbPromise: Promise<IDBPDatabase<FolioVaultDB>> | null = null;

// Bounded LRU memory cache for decrypted note contents (cleared on lock)
const decryptedBodyCache = new Map<string, NoteContent>();

export function clearMemoryCache(): void {
  decryptedBodyCache.clear();
}

export function getCachedNoteBody(noteId: string): NoteContent | undefined {
  const existing = decryptedBodyCache.get(noteId);
  if (existing) {
    // Refresh LRU order
    decryptedBodyCache.delete(noteId);
    decryptedBodyCache.set(noteId, existing);
  }
  return existing;
}

export function setCachedNoteBody(note: NoteContent): void {
  if (decryptedBodyCache.has(note.id)) {
    decryptedBodyCache.delete(note.id);
  } else if (decryptedBodyCache.size >= MAX_LRU_BODIES) {
    const oldestKey = decryptedBodyCache.keys().next().value;
    if (oldestKey) {
      decryptedBodyCache.delete(oldestKey);
    }
  }
  decryptedBodyCache.set(note.id, note);
}

export function removeCachedNoteBody(noteId: string): void {
  decryptedBodyCache.delete(noteId);
}

async function getDB(): Promise<IDBPDatabase<FolioVaultDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FolioVaultDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('vaultMeta')) {
          db.createObjectStore('vaultMeta', { keyPath: 'vaultId' });
        }
        if (!db.objectStoreNames.contains('noteIndex')) {
          db.createObjectStore('noteIndex', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('wal')) {
          const walStore = db.createObjectStore('wal', { keyPath: 'walId' });
          walStore.createIndex('by-note', 'noteId');
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', { keyPath: 'snapshotId' });
          snapStore.createIndex('by-note', 'noteId');
        }
        if (!db.objectStoreNames.contains('queries')) {
          db.createObjectStore('queries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('plugins')) {
          db.createObjectStore('plugins', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('shortcuts')) {
          db.createObjectStore('shortcuts', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getVaultHeader(): Promise<VaultHeader | undefined> {
  const db = await getDB();
  const all = await db.getAll('vaultMeta');
  return all[0];
}

export async function saveVaultHeader(header: VaultHeader): Promise<void> {
  const db = await getDB();
  await db.put('vaultMeta', header);
}

export async function saveEncryptedIndex(
  key: CryptoKey,
  entries: NoteIndexEntry[]
): Promise<void> {
  const db = await getDB();
  const { iv, ciphertext } = await encryptPayload(key, entries);
  await db.put('noteIndex', { id: 'primary-index', iv, ciphertext });
}

export async function loadEncryptedIndex(key: CryptoKey): Promise<NoteIndexEntry[]> {
  const db = await getDB();
  const record = await db.get('noteIndex', 'primary-index');
  if (!record) return [];
  return decryptPayload<NoteIndexEntry[]>(key, record.iv, record.ciphertext);
}

export async function saveEncryptedNote(
  key: CryptoKey,
  note: NoteContent,
  deleted = false
): Promise<EncryptedEnvelope> {
  const db = await getDB();
  const { iv, ciphertext } = await encryptPayload(key, note);
  const envelope: EncryptedEnvelope = {
    id: note.id,
    iv,
    ciphertext,
    updatedAt: note.updatedAt,
    revision: note.revision,
    contentHash: note.contentHash,
    deleted,
  };
  await db.put('notes', envelope);
  if (deleted) {
    removeCachedNoteBody(note.id);
  } else {
    setCachedNoteBody(note);
  }
  return envelope;
}

export async function putRawEnvelope(envelope: EncryptedEnvelope): Promise<void> {
  const db = await getDB();
  await db.put('notes', envelope);
  removeCachedNoteBody(envelope.id);
}

export async function getRawEnvelope(noteId: string): Promise<EncryptedEnvelope | undefined> {
  const db = await getDB();
  return db.get('notes', noteId);
}

export async function getAllRawEnvelopes(): Promise<EncryptedEnvelope[]> {
  const db = await getDB();
  return db.getAll('notes');
}

export async function loadDecryptedNote(
  key: CryptoKey,
  noteId: string
): Promise<NoteContent | null> {
  const cached = getCachedNoteBody(noteId);
  if (cached) return cached;

  const db = await getDB();
  const env = await db.get('notes', noteId);
  if (!env || env.deleted) return null;
  const note = await decryptPayload<NoteContent>(key, env.iv, env.ciphertext);
  setCachedNoteBody(note);
  return note;
}

// Write-Ahead Log (WAL) for crash recovery
export async function appendWalEntry(key: CryptoKey, note: NoteContent): Promise<void> {
  const db = await getDB();
  const { iv, ciphertext } = await encryptPayload(key, note);
  const walEntry: WalEntry = {
    walId: `wal-${note.id}`,
    noteId: note.id,
    timestamp: Date.now(),
    iv,
    ciphertext,
  };
  await db.put('wal', walEntry);
}

export async function clearWalEntry(noteId: string): Promise<void> {
  const db = await getDB();
  await db.delete('wal', `wal-${noteId}`);
}

export async function loadPendingWalEntries(
  key: CryptoKey
): Promise<{ walEntry: WalEntry; note: NoteContent }[]> {
  const db = await getDB();
  const entries = await db.getAll('wal');
  const recovered: { walEntry: WalEntry; note: NoteContent }[] = [];
  for (const walEntry of entries) {
    try {
      const note = await decryptPayload<NoteContent>(key, walEntry.iv, walEntry.ciphertext);
      recovered.push({ walEntry, note });
    } catch {
      // Skip corrupted or foreign-key WAL entry
    }
  }
  return recovered;
}

// Point-in-time Version Snapshots
export async function createSnapshot(
  key: CryptoKey,
  note: NoteContent,
  reason: SnapshotRecord['reason']
): Promise<SnapshotRecord> {
  const db = await getDB();
  const { iv, ciphertext } = await encryptPayload(key, note);
  const snapshot: SnapshotRecord = {
    snapshotId: `snap-${note.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    noteId: note.id,
    timestamp: Date.now(),
    reason,
    iv,
    ciphertext,
  };
  await db.put('snapshots', snapshot);

  // Retain up to 20 most recent snapshots per note to keep storage lean
  const noteSnapshots = await db.getAllFromIndex('snapshots', 'by-note', note.id);
  if (noteSnapshots.length > 20) {
    noteSnapshots.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = noteSnapshots.slice(0, noteSnapshots.length - 20);
    for (const old of toRemove) {
      await db.delete('snapshots', old.snapshotId);
    }
  }
  return snapshot;
}

export async function listNoteSnapshots(
  key: CryptoKey,
  noteId: string
): Promise<{ snapshot: SnapshotRecord; content: NoteContent }[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('snapshots', 'by-note', noteId);
  records.sort((a, b) => b.timestamp - a.timestamp);
  const results: { snapshot: SnapshotRecord; content: NoteContent }[] = [];
  for (const snapshot of records) {
    try {
      const content = await decryptPayload<NoteContent>(key, snapshot.iv, snapshot.ciphertext);
      results.push({ snapshot, content });
    } catch {
      // ignore
    }
  }
  return results;
}

// Saved Queries (encrypted)
export async function saveEncryptedQuery(key: CryptoKey, query: QueryDefinition): Promise<void> {
  const db = await getDB();
  const { iv, ciphertext } = await encryptPayload(key, query);
  await db.put('queries', { id: query.id, iv, ciphertext });
}

export async function deleteEncryptedQuery(queryId: string): Promise<void> {
  const db = await getDB();
  await db.delete('queries', queryId);
}

export async function loadAllQueries(key: CryptoKey): Promise<QueryDefinition[]> {
  const db = await getDB();
  const rows = await db.getAll('queries');
  const queries: QueryDefinition[] = [];
  for (const row of rows) {
    try {
      const q = await decryptPayload<QueryDefinition>(key, row.iv, row.ciphertext);
      queries.push(q);
    } catch {
      // ignore
    }
  }
  return queries.sort((a, b) => a.createdAt - b.createdAt);
}

// Plugins & Shortcuts
export async function savePlugins(plugins: PluginDefinition[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('plugins', 'readwrite');
  await tx.store.clear();
  for (const p of plugins) {
    await tx.store.put(p);
  }
  await tx.done;
}

export async function loadPlugins(): Promise<PluginDefinition[]> {
  const db = await getDB();
  return db.getAll('plugins');
}

export async function saveShortcuts(shortcuts: KeyboardShortcut[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('shortcuts', 'readwrite');
  await tx.store.clear();
  for (const s of shortcuts) {
    await tx.store.put(s);
  }
  await tx.done;
}

export async function loadShortcuts(): Promise<KeyboardShortcut[]> {
  const db = await getDB();
  return db.getAll('shortcuts');
}

export async function exportEncryptedBackup(): Promise<{
  version: number;
  exportedAt: number;
  header: VaultHeader;
  notes: EncryptedEnvelope[];
  queries: { id: string; iv: string; ciphertext: string }[];
  plugins: PluginDefinition[];
}> {
  const db = await getDB();
  const headers = await db.getAll('vaultMeta');
  if (!headers[0]) {
    throw new Error('No vault initialized');
  }
  const notes = await db.getAll('notes');
  const queries = await db.getAll('queries');
  const plugins = await db.getAll('plugins');
  return {
    version: 1,
    exportedAt: Date.now(),
    header: headers[0],
    notes,
    queries,
    plugins,
  };
}

export async function restoreEncryptedBackup(bundle: {
  header: VaultHeader;
  notes: EncryptedEnvelope[];
  queries?: { id: string; iv: string; ciphertext: string }[];
  plugins?: PluginDefinition[];
}): Promise<void> {
  const db = await getDB();
  clearMemoryCache();
  await db.clear('vaultMeta');
  await db.clear('notes');
  await db.clear('noteIndex');
  await db.clear('wal');
  await db.clear('queries');
  await db.put('vaultMeta', bundle.header);
  for (const note of bundle.notes) {
    await db.put('notes', note);
  }
  if (bundle.queries) {
    for (const q of bundle.queries) {
      await db.put('queries', q);
    }
  }
  if (bundle.plugins && bundle.plugins.length > 0) {
    await savePlugins(bundle.plugins);
  }
}

export async function wipeLocalDatabase(): Promise<void> {
  const db = await getDB();
  clearMemoryCache();
  await Promise.all([
    db.clear('vaultMeta'),
    db.clear('noteIndex'),
    db.clear('notes'),
    db.clear('wal'),
    db.clear('snapshots'),
    db.clear('queries'),
    db.clear('plugins'),
    db.clear('shortcuts'),
  ]);
}
