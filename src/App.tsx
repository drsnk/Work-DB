import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Cloud,
  CloudOff,
  Command,
  Database,
  FileText,
  GitMerge,
  Lock,
  Menu,
  Network,
  PanelRight,
  RefreshCw,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  ConflictPair,
  EditorViewMode,
  KeyboardShortcut,
  MetadataField,
  NoteContent,
  NoteIndexEntry,
  PluginDefinition,
  QueryDefinition,
  SnapshotRecord,
  SyncStatus,
  VaultHeader,
  WorkspaceStage,
} from './types/vault';
import {
  createKeyCheck,
  deriveAesKey,
  generateSalt,
  sha256Hex,
  verifyKeyCheck,
} from './lib/crypto';
import {
  appendWalEntry,
  clearMemoryCache,
  clearWalEntry,
  createSnapshot,
  deleteEncryptedQuery,
  exportEncryptedBackup,
  getAllRawEnvelopes,
  getRawEnvelope,
  getVaultHeader,
  listNoteSnapshots,
  loadAllQueries,
  loadDecryptedNote,
  loadEncryptedIndex,
  loadPendingWalEntries,
  loadPlugins,
  loadShortcuts,
  restoreEncryptedBackup,
  saveEncryptedIndex,
  saveEncryptedNote,
  saveEncryptedQuery,
  savePlugins,
  saveShortcuts,
  saveVaultHeader,
  wipeLocalDatabase,
} from './lib/db';
import { extractInlineTags, extractWikiLinks } from './lib/markdown';
import { DEFAULT_PLUGINS, DEFAULT_SHORTCUTS, matchShortcutEvent } from './lib/plugins';
import { applyVaultTheme } from './lib/themes';
import { createStarterNotes, createStarterQueries } from './lib/seedVault';
import {
  exportNotesToLocalDirectory,
  importMarkdownFilesFromDirectory,
  pickLocalSyncDirectory,
  type DirectoryHandleLike,
} from './lib/localFs';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
} from './lib/firebaseAuth';
import { pushResolvedNoteToDrive, synchronizeWithGoogleDrive } from './lib/googleDriveSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { VaultLockScreen } from './components/VaultLockScreen';
import { Sidebar } from './components/Sidebar';
import { EditorWorkspace } from './components/EditorWorkspace';
import { InspectorPanel } from './components/InspectorPanel';
import { GraphView } from './components/GraphView';
import { QueryBuilderView } from './components/QueryBuilderView';
import { ConflictMergeModal } from './components/ConflictMergeModal';
import { SettingsStudioModal } from './components/SettingsStudioModal';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PWAInstallButton } from './components/PWAInstallButton';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => void;
}

export default function App() {
  const isOnline = useOnlineStatus();

  // Vault Security & Header State
  const [vaultHeader, setVaultHeader] = useState<VaultHeader | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Low-RAM Index & Active Note State
  const [noteIndex, setNoteIndex] = useState<NoteIndexEntry[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteContent | null>(null);
  const [snapshots, setSnapshots] = useState<{ snapshot: SnapshotRecord; content: NoteContent }[]>(
    []
  );
  const [walActive, setWalActive] = useState(false);

  // Navigation & Workspace State
  const [stage, setStage] = useState<WorkspaceStage>('editor');
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('ALL');
  const [selectedTag, setSelectedTag] = useState('');
  const [showLeftDrawer, setShowLeftDrawer] = useState(false);
  const [showRightDrawer, setShowRightDrawer] = useState(false);
  const [desktopRightOpen, setDesktopRightOpen] = useState(true);

  // Queries, Plugins, Shortcuts
  const [queries, setQueries] = useState<QueryDefinition[]>([]);
  const [activeQuery, setActiveQuery] = useState<QueryDefinition | null>(null);
  const [plugins, setPlugins] = useState<PluginDefinition[]>(DEFAULT_PLUGINS);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);

  // Modals & Notifications
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    destructive: false,
    onConfirm: () => {},
  });

  // Google Drive Sync & Conflicts
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  const [activeConflict, setActiveConflict] = useState<ConflictPair | null>(null);

  // Desktop Local Folder Handle
  const [localDirHandle, setLocalDirHandle] = useState<DirectoryHandleLike | null>(null);

  const saveTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const lastAutoSnapshotRef = useRef<number>(0);

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3400);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  // Boot: Check existing vault header, theme, plugins, shortcuts, Firebase Auth
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [hdr, storedPlugins, storedShortcuts] = await Promise.all([
          getVaultHeader(),
          loadPlugins(),
          loadShortcuts(),
        ]);
        if (!mounted) return;
        if (hdr) {
          setVaultHeader(hdr);
          applyVaultTheme(hdr.activeThemeId || 'editorial-paper', hdr.customCss || '');
        } else {
          applyVaultTheme('editorial-paper', '');
        }
        if (storedPlugins.length > 0) setPlugins(storedPlugins);
        else await savePlugins(DEFAULT_PLUGINS);

        if (storedShortcuts.length > 0) setShortcuts(storedShortcuts);
        else await saveShortcuts(DEFAULT_SHORTCUTS);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    })();

    const unsubAuth = initAuth(
      (user) => {
        setGoogleUser(user);
        setHasAccessToken(Boolean(getAccessToken()));
      },
      () => {
        setGoogleUser(null);
        setHasAccessToken(false);
      }
    );

    return () => {
      mounted = false;
      unsubAuth();
    };
  }, []);

  // Load decrypted note lazily when activeNoteId changes
  useEffect(() => {
    if (!cryptoKey || !activeNoteId) {
      setActiveNote(null);
      setSnapshots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const note = await loadDecryptedNote(cryptoKey, activeNoteId);
      const snaps = await listNoteSnapshots(cryptoKey, activeNoteId);
      if (!cancelled) {
        setActiveNote(note);
        setSnapshots(snaps);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cryptoKey, activeNoteId]);

  const toIndexEntry = (note: NoteContent, dirty: boolean, deleted = false): NoteIndexEntry => {
    const outbound = extractWikiLinks(note.body);
    const inlineTags = extractInlineTags(note.body);
    const mergedTags = Array.from(new Set([...note.tags, ...inlineTags]));
    return {
      id: note.id,
      title: note.title,
      folderPath: note.folderPath,
      tags: mergedTags,
      metadata: note.metadata,
      outboundLinks: outbound,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      revision: note.revision,
      contentHash: note.contentHash,
      dirty,
      deleted,
    };
  };

  // Create new encrypted vault
  const handleCreateVault = async (passphrase: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const salt = generateSalt();
      const key = await deriveAesKey(passphrase, salt);
      const keyCheck = await createKeyCheck(key);
      const header: VaultHeader = {
        vaultId: `vault-${crypto.randomUUID()}`,
        salt,
        kdfIterations: 250_000,
        keyCheckIv: keyCheck.iv,
        keyCheckCiphertext: keyCheck.ciphertext,
        activeThemeId: 'editorial-paper',
        customCss: '',
        autoSync: true,
        createdAt: Date.now(),
      };
      await saveVaultHeader(header);

      const starterNotes = await createStarterNotes();
      const indexList: NoteIndexEntry[] = [];
      for (const n of starterNotes) {
        await saveEncryptedNote(key, n, false);
        await createSnapshot(key, n, 'auto');
        indexList.push(toIndexEntry(n, true, false));
      }
      await saveEncryptedIndex(key, indexList);

      const starterQueries = createStarterQueries();
      for (const q of starterQueries) {
        await saveEncryptedQuery(key, q);
      }

      setVaultHeader(header);
      setCryptoKey(key);
      setNoteIndex(indexList);
      setQueries(starterQueries);
      setActiveNoteId(indexList[0]?.id ?? null);
      applyVaultTheme(header.activeThemeId, header.customCss);
      notify('Encrypted AES-256-GCM vault initialized.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to initialize vault.');
    } finally {
      setAuthBusy(false);
    }
  };

  // Unlock existing vault & run WAL crash-recovery check
  const handleUnlockVault = async (passphrase: string) => {
    if (!vaultHeader) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const key = await deriveAesKey(passphrase, vaultHeader.salt, vaultHeader.kdfIterations);
      const ok = await verifyKeyCheck(
        key,
        vaultHeader.keyCheckIv,
        vaultHeader.keyCheckCiphertext
      );
      if (!ok) {
        setAuthError('Incorrect master passphrase.');
        return;
      }

      let indexList = await loadEncryptedIndex(key);
      const loadedQueries = await loadAllQueries(key);

      // Crash-Recovery WAL replay
      const pendingWal = await loadPendingWalEntries(key);
      if (pendingWal.length > 0) {
        const indexMap = new Map(indexList.map((e) => [e.id, e]));
        for (const { note } of pendingWal) {
          await saveEncryptedNote(key, note, false);
          await createSnapshot(key, note, 'wal-recovery');
          await clearWalEntry(note.id);
          indexMap.set(note.id, toIndexEntry(note, true, false));
        }
        indexList = Array.from(indexMap.values());
        await saveEncryptedIndex(key, indexList);
        notify(`Recovered ${pendingWal.length} uncommitted edit(s) from crash-safe WAL.`);
      }

      setCryptoKey(key);
      setNoteIndex(indexList);
      setQueries(loadedQueries);
      const firstActive = indexList.find((n) => !n.deleted);
      setActiveNoteId(firstActive?.id ?? null);
      applyVaultTheme(vaultHeader.activeThemeId || 'editorial-paper', vaultHeader.customCss || '');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to unlock vault.');
    } finally {
      setAuthBusy(false);
    }
  };

  // Lock vault and clear sensitive session RAM
  const handleLockVault = useCallback(() => {
    clearMemoryCache();
    setCryptoKey(null);
    setActiveNote(null);
    setNoteIndex([]);
    setSnapshots([]);
    setQueries([]);
    setShowSettings(false);
    setShowPalette(false);
  }, []);

  // Google Drive Sync execution
  const runDriveSync = useCallback(
    async (silent = false) => {
      if (!cryptoKey || !vaultHeader) return;
      if (!navigator.onLine) {
        setSyncStatus('offline');
        if (!silent) notify('Offline mode — changes queued locally for Google Drive sync.');
        return;
      }
      const token = getAccessToken();
      if (!token) {
        if (!silent) setShowSettings(true);
        return;
      }

      setSyncStatus('syncing');
      try {
        const outcome = await synchronizeWithGoogleDrive(token, cryptoKey, vaultHeader, noteIndex);
        if (outcome.driveFolderId !== vaultHeader.driveFolderId) {
          const updatedHeader: VaultHeader = {
            ...vaultHeader,
            driveFolderId: outcome.driveFolderId,
            lastSyncedAt: Date.now(),
          };
          await saveVaultHeader(updatedHeader);
          setVaultHeader(updatedHeader);
        } else {
          const updatedHeader: VaultHeader = {
            ...vaultHeader,
            lastSyncedAt: Date.now(),
          };
          await saveVaultHeader(updatedHeader);
          setVaultHeader(updatedHeader);
        }

        await saveEncryptedIndex(cryptoKey, outcome.updatedIndexEntries);
        setNoteIndex(outcome.updatedIndexEntries);

        if (outcome.conflicts.length > 0) {
          setConflicts(outcome.conflicts);
          setActiveConflict(outcome.conflicts[0]);
          setSyncStatus('conflict');
          notify(`${outcome.conflicts.length} sync conflict(s) require side-by-side merge.`);
        } else {
          setSyncStatus('idle');
          if (!silent || outcome.uploadedCount > 0 || outcome.downloadedCount > 0) {
            notify(
              `Synced with Google Drive (${outcome.uploadedCount} pushed, ${outcome.downloadedCount} pulled).`
            );
          }
        }
      } catch (err) {
        setSyncStatus('error');
        if (!silent) {
          notify(err instanceof Error ? err.message : 'Google Drive sync failed.');
        }
      }
    },
    [cryptoKey, vaultHeader, noteIndex, notify]
  );

  // Automatic sync when coming back online
  useEffect(() => {
    if (isOnline && cryptoKey && vaultHeader?.autoSync && getAccessToken()) {
      void runDriveSync(true);
    } else if (!isOnline) {
      setSyncStatus('offline');
    }
  }, [isOnline, cryptoKey, vaultHeader?.autoSync, runDriveSync]);

  // Persist active note edit with Crash-Safe WAL + Debounced Encryption & Auto-Sync
  const commitActiveNoteUpdate = useCallback(
    async (updated: NoteContent) => {
      if (!cryptoKey) return;
      setActiveNote(updated);
      setWalActive(true);

      // Immediate WAL checkpoint
      await appendWalEntry(cryptoKey, updated);

      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        const hash = await sha256Hex(`${updated.title}:${updated.folderPath}:${updated.body}`);
        const inlineTags = extractInlineTags(updated.body);
        const mergedTags = Array.from(new Set([...updated.tags, ...inlineTags]));

        const finalized: NoteContent = {
          ...updated,
          tags: mergedTags,
          contentHash: hash,
        };
        await saveEncryptedNote(cryptoKey, finalized, false);
        await clearWalEntry(finalized.id);
        setWalActive(false);

        // Rolling automatic snapshot every 45s of continuous editing
        if (Date.now() - lastAutoSnapshotRef.current > 45_000) {
          await createSnapshot(cryptoKey, finalized, 'auto');
          lastAutoSnapshotRef.current = Date.now();
          const snaps = await listNoteSnapshots(cryptoKey, finalized.id);
          setSnapshots(snaps);
        }

        const newEntry = toIndexEntry(finalized, true, false);
        setNoteIndex((prev) => {
          const next = prev.some((n) => n.id === finalized.id)
            ? prev.map((n) => (n.id === finalized.id ? newEntry : n))
            : [newEntry, ...prev];
          void saveEncryptedIndex(cryptoKey, next);
          return next;
        });

        // Schedule automatic Google Drive sync if connected & online
        if (vaultHeader?.autoSync && getAccessToken() && navigator.onLine) {
          if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
          syncTimerRef.current = window.setTimeout(() => {
            void runDriveSync(true);
          }, 1800);
        }
      }, 320);
    },
    [cryptoKey, vaultHeader?.autoSync, runDriveSync]
  );

  const handleCreateNote = useCallback(
    async (folderPath = 'Inbox', initialTitle?: string, initialBody?: string, initialTags?: string[]) => {
      if (!cryptoKey) return;
      const now = Date.now();
      const title = initialTitle || `Untitled Note ${noteIndex.filter((n) => !n.deleted).length + 1}`;
      const body = initialBody ?? `# ${title}\n\n`;
      const hash = await sha256Hex(`${title}:${folderPath}:${body}`);
      const created: NoteContent = {
        id: `note-${crypto.randomUUID()}`,
        title,
        folderPath,
        tags: initialTags ?? [],
        metadata: {
          status: { key: 'status', type: 'select', value: 'Draft', options: ['Draft', 'Active', 'Verified'] },
        },
        body,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        contentHash: hash,
      };
      await saveEncryptedNote(cryptoKey, created, false);
      const entry = toIndexEntry(created, true, false);
      const nextIndex = [entry, ...noteIndex];
      await saveEncryptedIndex(cryptoKey, nextIndex);
      setNoteIndex(nextIndex);
      setActiveNoteId(created.id);
      setActiveNote(created);
      setStage('editor');
      setShowLeftDrawer(false);
    },
    [cryptoKey, noteIndex]
  );

  // Mandatory explicit confirmation before deleting a note (locally and in Drive sync)
  const requestDeleteNote = (noteId: string) => {
    const target = noteIndex.find((n) => n.id === noteId);
    if (!target || !cryptoKey) return;
    setConfirmState({
      open: true,
      title: 'Delete Document',
      message: `Are you sure you want to delete "${target.title}"? If Google Drive sync is active, this deletion will also propagate to your encrypted Drive backup.`,
      confirmLabel: 'Delete Document',
      destructive: true,
      onConfirm: async () => {
        setConfirmState((s) => ({ ...s, open: false }));
        const loaded = await loadDecryptedNote(cryptoKey, noteId);
        if (loaded) {
          await saveEncryptedNote(
            cryptoKey,
            { ...loaded, updatedAt: Date.now(), revision: loaded.revision + 1 },
            true
          );
        }
        const nextIndex = noteIndex.map((n) =>
          n.id === noteId
            ? { ...n, deleted: true, dirty: true, revision: n.revision + 1, updatedAt: Date.now() }
            : n
        );
        await saveEncryptedIndex(cryptoKey, nextIndex);
        setNoteIndex(nextIndex);
        if (activeNoteId === noteId) {
          const fallback = nextIndex.find((n) => !n.deleted);
          setActiveNoteId(fallback?.id ?? null);
        }
        notify(`Deleted "${target.title}".`);
      },
    });
  };

  const handleOpenWikiLink = async (linkTitle: string) => {
    const match = noteIndex.find(
      (n) => !n.deleted && n.title.toLowerCase() === linkTitle.toLowerCase()
    );
    if (match) {
      setActiveNoteId(match.id);
      setStage('editor');
    } else {
      await handleCreateNote('Inbox', linkTitle, `# ${linkTitle}\n\n`);
      notify(`Created linked document "${linkTitle}".`);
    }
  };

  const handleLinkUnlinkedMention = async (sourceNoteId: string, targetTitle: string) => {
    if (!cryptoKey) return;
    const source = await loadDecryptedNote(cryptoKey, sourceNoteId);
    if (!source) return;
    const updated: NoteContent = {
      ...source,
      body: `${source.body.trimEnd()}\n\nSee also [[${targetTitle}]].\n`,
      updatedAt: Date.now(),
      revision: source.revision + 1,
    };
    const hash = await sha256Hex(`${updated.title}:${updated.folderPath}:${updated.body}`);
    updated.contentHash = hash;
    await saveEncryptedNote(cryptoKey, updated, false);
    const nextIndex = noteIndex.map((n) =>
      n.id === sourceNoteId ? toIndexEntry(updated, true, false) : n
    );
    await saveEncryptedIndex(cryptoKey, nextIndex);
    setNoteIndex(nextIndex);
    notify(`Linked [[${targetTitle}]] from "${source.title}".`);
  };

  const handleCreateManualSnapshot = useCallback(async () => {
    if (!cryptoKey || !activeNote) return;
    await createSnapshot(cryptoKey, activeNote, 'manual');
    const snaps = await listNoteSnapshots(cryptoKey, activeNote.id);
    setSnapshots(snaps);
    notify('Recovery snapshot saved.');
  }, [cryptoKey, activeNote, notify]);

  const handleRestoreSnapshot = async (snapContent: NoteContent) => {
    if (!cryptoKey || !activeNote) return;
    await createSnapshot(cryptoKey, activeNote, 'pre-merge');
    const restored: NoteContent = {
      ...snapContent,
      updatedAt: Date.now(),
      revision: activeNote.revision + 1,
    };
    await commitActiveNoteUpdate(restored);
    notify('Document restored from snapshot checkpoint.');
  };

  // Resolve Sync Conflict with explicit confirmation before mutating Google Drive
  const handleResolveConflict = (
    conflict: ConflictPair,
    chosen: NoteContent,
    strategy: 'local' | 'remote' | 'merged'
  ) => {
    if (!cryptoKey || !vaultHeader) return;

    const executeResolution = async () => {
      await createSnapshot(cryptoKey, conflict.localContent, 'pre-merge');
      const nextRev = Math.max(conflict.localContent.revision, conflict.remoteContent.revision) + 1;
      const hash = await sha256Hex(`${chosen.title}:${chosen.folderPath}:${chosen.body}`);
      const finalized: NoteContent = {
        ...chosen,
        revision: nextRev,
        updatedAt: Date.now(),
        contentHash: hash,
      };
      const envelope = await saveEncryptedNote(cryptoKey, finalized, false);
      const nextIndex = noteIndex.map((n) =>
        n.id === finalized.id ? toIndexEntry(finalized, false, false) : n
      );
      await saveEncryptedIndex(cryptoKey, nextIndex);
      setNoteIndex(nextIndex);
      if (activeNoteId === finalized.id) setActiveNote(finalized);

      const token = getAccessToken();
      if (token && strategy !== 'remote') {
        await pushResolvedNoteToDrive(token, vaultHeader, envelope, conflict.remoteFileId);
      }

      const remaining = conflicts.filter((c) => c.noteId !== conflict.noteId);
      setConflicts(remaining);
      setActiveConflict(remaining[0] ?? null);
      if (remaining.length === 0) setSyncStatus('idle');
      notify(`Conflict resolved for "${finalized.title}".`);
    };

    if (strategy === 'local' || strategy === 'merged') {
      setConfirmState({
        open: true,
        title: 'Overwrite Google Drive File?',
        message: `This will overwrite the encrypted remote copy of "${conflict.title}" on Google Drive with your ${strategy} version.`,
        confirmLabel: 'Overwrite Remote',
        destructive: false,
        onConfirm: () => {
          setConfirmState((s) => ({ ...s, open: false }));
          void executeResolution();
        },
      });
    } else {
      void executeResolution();
    }
  };

  // Global Native Keyboard Shortcuts Engine
  useEffect(() => {
    if (!cryptoKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      for (const sc of shortcuts) {
        if (matchShortcutEvent(e, sc.keys)) {
          e.preventDefault();
          if (sc.action === 'command-palette') setShowPalette((v) => !v);
          else if (sc.action === 'new-note') void handleCreateNote();
          else if (sc.action === 'toggle-sidebar') setDesktopRightOpen((v) => !v);
          else if (sc.action === 'toggle-graph')
            setStage((s) => (s === 'graph' ? 'editor' : 'graph'));
          else if (sc.action === 'toggle-query')
            setStage((s) => (s === 'query' ? 'editor' : 'query'));
          else if (sc.action === 'cycle-view-mode')
            setViewMode((m) => (m === 'split' ? 'edit' : m === 'edit' ? 'preview' : 'split'));
          else if (sc.action === 'create-snapshot') void handleCreateManualSnapshot();
          else if (sc.action === 'sync-now') void runDriveSync(false);
          else if (sc.action === 'open-settings') setShowSettings(true);
          else if (sc.action === 'lock-vault') handleLockVault();
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cryptoKey,
    shortcuts,
    handleCreateNote,
    handleCreateManualSnapshot,
    runDriveSync,
    handleLockVault,
  ]);

  // Theme update handler
  const handleUpdateTheme = async (themeId: string, customCss: string) => {
    applyVaultTheme(themeId, customCss);
    if (vaultHeader) {
      const updated = { ...vaultHeader, activeThemeId: themeId, customCss };
      await saveVaultHeader(updated);
      setVaultHeader(updated);
    }
  };

  // Encrypted .fvault Backup Export & Import
  const handleExportEncryptedBackup = async () => {
    const bundle = await exportEncryptedBackup();
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foliovault-backup-${new Date().toISOString().slice(0, 10)}.fvault`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Exported encrypted .fvault archive.');
  };

  const handleImportEncryptedBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.header || !Array.isArray(parsed.notes)) {
        throw new Error('Invalid .fvault backup file');
      }
      await restoreEncryptedBackup(parsed);
      setVaultHeader(parsed.header);
      handleLockVault();
      notify('Backup restored. Enter your master passphrase to unlock.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to restore backup.');
    }
  };

  // Change Master Passphrase (re-encrypts all records cleanly)
  const handleChangePassphrase = async (currentPass: string, newPass: string): Promise<boolean> => {
    if (!vaultHeader) return false;
    const currKey = await deriveAesKey(currentPass, vaultHeader.salt, vaultHeader.kdfIterations);
    const valid = await verifyKeyCheck(
      currKey,
      vaultHeader.keyCheckIv,
      vaultHeader.keyCheckCiphertext
    );
    if (!valid) return false;

    const newSalt = generateSalt();
    const newKey = await deriveAesKey(newPass, newSalt);
    const newCheck = await createKeyCheck(newKey);

    const envelopes = await getAllRawEnvelopes();
    for (const env of envelopes) {
      const dec = await loadDecryptedNote(currKey, env.id);
      if (dec) {
        await saveEncryptedNote(newKey, dec, env.deleted);
      } else {
        const raw = await getRawEnvelope(env.id);
        if (raw && !raw.deleted) {
          const loaded = await loadDecryptedNote(currKey, raw.id);
          if (loaded) await saveEncryptedNote(newKey, loaded, false);
        }
      }
    }
    await saveEncryptedIndex(newKey, noteIndex);
    for (const q of queries) {
      await saveEncryptedQuery(newKey, q);
    }

    const updatedHeader: VaultHeader = {
      ...vaultHeader,
      salt: newSalt,
      keyCheckIv: newCheck.iv,
      keyCheckCiphertext: newCheck.ciphertext,
    };
    await saveVaultHeader(updatedHeader);
    setVaultHeader(updatedHeader);
    setCryptoKey(newKey);
    return true;
  };

  // Desktop Local Folder Sync Handlers
  const handleLinkLocalFolder = async () => {
    const handle = await pickLocalSyncDirectory();
    if (handle) {
      setLocalDirHandle(handle);
      notify(`Linked desktop folder "${handle.name}".`);
    }
  };

  const handleExportLocalFolder = async () => {
    if (!localDirHandle || !cryptoKey) return;
    const activeEntries = noteIndex.filter((n) => !n.deleted);
    const loaded: NoteContent[] = [];
    for (const e of activeEntries) {
      const full = await loadDecryptedNote(cryptoKey, e.id);
      if (full) loaded.push(full);
    }
    const count = await exportNotesToLocalDirectory(localDirHandle, loaded);
    notify(`Wrote ${count} Markdown (.md) files with YAML frontmatter to "${localDirHandle.name}".`);
  };

  const handleImportLocalFolder = async () => {
    if (!localDirHandle || !cryptoKey) return;
    const imported = await importMarkdownFilesFromDirectory(localDirHandle);
    if (imported.length === 0) {
      notify('No .md files found in selected folder.');
      return;
    }
    const nextMap = new Map(noteIndex.map((n) => [n.id, n]));
    for (const note of imported) {
      await saveEncryptedNote(cryptoKey, note, false);
      nextMap.set(note.id, toIndexEntry(note, true, false));
    }
    const nextIndex = Array.from(nextMap.values());
    await saveEncryptedIndex(cryptoKey, nextIndex);
    setNoteIndex(nextIndex);
    notify(`Imported ${imported.length} local Markdown files into encrypted vault.`);
  };

  if (isInitializing) {
    return (
      <div
        className="h-screen flex items-center justify-center text-sm"
        style={{ backgroundColor: 'var(--fv-canvas)', color: 'var(--fv-muted)' }}
      >
        Initializing encrypted vault...
      </div>
    );
  }

  if (!cryptoKey) {
    return (
      <VaultLockScreen
        existingHeader={vaultHeader}
        isBusy={authBusy}
        errorMessage={authError}
        onUnlock={handleUnlockVault}
        onCreateVault={handleCreateVault}
        onImportBackup={handleImportEncryptedBackup}
      />
    );
  }

  const dirtyCount = noteIndex.filter((n) => !n.deleted && n.dirty).length;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--fv-canvas)', color: 'var(--fv-ink)' }}
    >
      {/* Top Bar Contract: 3 clean zones (Brand | Single-line Stage Links | Primary Actions) */}
      <header
        className="no-print h-14 px-3 sm:px-5 border-b flex items-center justify-between gap-4 shrink-0"
        style={{
          backgroundColor: 'var(--fv-surface)',
          borderColor: 'var(--fv-border)',
        }}
      >
        {/* Zone 1: Brand + Mobile Menu */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowLeftDrawer(true)}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:opacity-75 cursor-pointer"
            aria-label="Open folder navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap shrink-0">
            FolioVault
          </span>
        </div>

        {/* Zone 2: Clean Single-Line Nav Tabs (Desktop & Tablet) */}
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
          {(
            [
              { id: 'editor', label: 'Documents' },
              { id: 'graph', label: 'Graph' },
              { id: 'query', label: 'Queries' },
            ] as const
          ).map((navItem) => {
            const active = stage === navItem.id;
            return (
              <button
                key={navItem.id}
                type="button"
                onClick={() => setStage(navItem.id)}
                className="py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer"
                style={{
                  borderColor: active ? 'var(--fv-accent)' : 'transparent',
                  color: active ? 'var(--fv-ink)' : 'var(--fv-muted)',
                }}
              >
                {navItem.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="py-1 whitespace-nowrap shrink-0 border-b-2 border-transparent hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--fv-muted)' }}
          >
            Studio
          </button>
        </nav>

        {/* Zone 3: Primary Action & Utility Triggers */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />

          <button
            type="button"
            onClick={() => setShowPalette(true)}
            className="hidden md:inline-flex items-center gap-1.5 min-h-[38px] px-2.5 rounded-lg border text-xs whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              borderColor: 'var(--fv-border)',
              color: 'var(--fv-muted)',
              backgroundColor: 'var(--fv-canvas)',
            }}
            title="Command Palette (Cmd/Ctrl+K)"
          >
            <Command className="w-3.5 h-3.5" />
            <span className="font-mono">⌘K</span>
          </button>

          {conflicts.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveConflict(conflicts[0])}
              className="min-h-[38px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: 'var(--fv-warning)',
                color: '#ffffff',
              }}
            >
              <GitMerge className="w-3.5 h-3.5" />
              Resolve ({conflicts.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => (hasAccessToken ? runDriveSync(false) : setShowSettings(true))}
            className="min-h-[40px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--fv-accent)',
              color: 'var(--fv-accent-ink)',
            }}
          >
            {!isOnline ? (
              <CloudOff className="w-3.5 h-3.5" />
            ) : syncStatus === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5" />
            )}
            <span>
              {!isOnline
                ? `Offline (${dirtyCount})`
                : hasAccessToken
                ? syncStatus === 'syncing'
                  ? 'Syncing...'
                  : dirtyCount > 0
                  ? `Sync (${dirtyCount})`
                  : 'Synced'
                : 'Connect Drive'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDesktopRightOpen((v) => !v)}
            className="hidden lg:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--fv-border)' }}
            title="Toggle Inspector Panel"
            aria-label="Toggle Inspector Panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleLockVault}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--fv-border)' }}
            title="Lock Encrypted Vault"
            aria-label="Lock Encrypted Vault"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main 3-Pane Responsive Workbench */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Desktop Left Sidebar */}
        <div className="hidden lg:block w-64 shrink-0 h-full no-print">
          <Sidebar
            notes={noteIndex}
            queries={queries}
            activeNoteId={activeNoteId}
            searchQuery={searchQuery}
            selectedFolder={selectedFolder}
            selectedTag={selectedTag}
            onSearchChange={setSearchQuery}
            onSelectFolder={setSelectedFolder}
            onSelectTag={setSelectedTag}
            onSelectNote={(id) => {
              setActiveNoteId(id);
              setStage('editor');
            }}
            onCreateNote={(folder) => void handleCreateNote(folder)}
            onDeleteNote={requestDeleteNote}
            onRunSavedQuery={(q) => {
              setActiveQuery(q);
              setStage('query');
            }}
          />
        </div>

        {/* Mobile/Tablet Left Slide-Over Drawer */}
        {showLeftDrawer && (
          <div className="fixed inset-0 z-50 lg:hidden flex no-print">
            <div className="w-72 max-w-[85vw] h-full shadow-2xl relative">
              <button
                type="button"
                onClick={() => setShowLeftDrawer(false)}
                className="absolute right-2 top-2 z-10 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg"
                aria-label="Close navigation drawer"
              >
                <X className="w-4 h-4" />
              </button>
              <Sidebar
                notes={noteIndex}
                queries={queries}
                activeNoteId={activeNoteId}
                searchQuery={searchQuery}
                selectedFolder={selectedFolder}
                selectedTag={selectedTag}
                onSearchChange={setSearchQuery}
                onSelectFolder={setSelectedFolder}
                onSelectTag={setSelectedTag}
                onSelectNote={(id) => {
                  setActiveNoteId(id);
                  setStage('editor');
                  setShowLeftDrawer(false);
                }}
                onCreateNote={(folder) => void handleCreateNote(folder)}
                onDeleteNote={requestDeleteNote}
                onRunSavedQuery={(q) => {
                  setActiveQuery(q);
                  setStage('query');
                  setShowLeftDrawer(false);
                }}
              />
            </div>
            <div className="flex-1 bg-black/45" onClick={() => setShowLeftDrawer(false)} />
          </div>
        )}

        {/* Central Active Stage */}
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          {stage === 'editor' && (
            <EditorWorkspace
              note={activeNote}
              allNotes={noteIndex}
              plugins={plugins}
              themeId={vaultHeader?.activeThemeId ?? 'editorial-paper'}
              customCss={vaultHeader?.customCss ?? ''}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              onChangeTitle={(title) => {
                if (!activeNote) return;
                void commitActiveNoteUpdate({
                  ...activeNote,
                  title,
                  updatedAt: Date.now(),
                  revision: activeNote.revision + 1,
                });
              }}
              onChangeBody={(body) => {
                if (!activeNote) return;
                void commitActiveNoteUpdate({
                  ...activeNote,
                  body,
                  updatedAt: Date.now(),
                  revision: activeNote.revision + 1,
                });
              }}
              onOpenWikiLink={(title) => void handleOpenWikiLink(title)}
              onCreateNote={() => void handleCreateNote()}
            />
          )}

          {stage === 'graph' && (
            <GraphView
              notes={noteIndex}
              activeNoteId={activeNoteId}
              onSelectNote={(id) => {
                setActiveNoteId(id);
                setStage('editor');
              }}
            />
          )}

          {stage === 'query' && (
            <QueryBuilderView
              notes={noteIndex}
              savedQueries={queries}
              initialQuery={activeQuery}
              loadNoteBody={(id) =>
                cryptoKey ? loadDecryptedNote(cryptoKey, id) : Promise.resolve(null)
              }
              onSaveQuery={async (q) => {
                if (!cryptoKey) return;
                await saveEncryptedQuery(cryptoKey, q);
                setQueries((prev) =>
                  prev.some((x) => x.id === q.id)
                    ? prev.map((x) => (x.id === q.id ? q : x))
                    : [...prev, q]
                );
                notify(`Saved query "${q.name}".`);
              }}
              onDeleteQuery={async (id) => {
                await deleteEncryptedQuery(id);
                setQueries((prev) => prev.filter((q) => q.id !== id));
              }}
              onCompileReportNote={async (report) => {
                await handleCreateNote(
                  report.folderPath,
                  report.title,
                  report.body,
                  report.tags
                );
                notify(`Compiled new report note "${report.title}".`);
              }}
              onOpenNote={(id) => {
                setActiveNoteId(id);
                setStage('editor');
              }}
            />
          )}
        </main>

        {/* Desktop Right Inspector Rail */}
        {desktopRightOpen && stage === 'editor' && (
          <div className="hidden lg:block w-72 shrink-0 h-full no-print">
            <InspectorPanel
              activeNote={activeNote}
              allNotes={noteIndex}
              snapshots={snapshots}
              walActive={walActive}
              onUpdateMetadata={(metadata: Record<string, MetadataField>) => {
                if (!activeNote) return;
                void commitActiveNoteUpdate({
                  ...activeNote,
                  metadata,
                  updatedAt: Date.now(),
                  revision: activeNote.revision + 1,
                });
              }}
              onUpdateFolderAndTags={(folderPath, tags) => {
                if (!activeNote) return;
                void commitActiveNoteUpdate({
                  ...activeNote,
                  folderPath,
                  tags,
                  updatedAt: Date.now(),
                  revision: activeNote.revision + 1,
                });
              }}
              onOpenNoteById={(id) => setActiveNoteId(id)}
              onLinkMention={(srcId, targetTitle) => void handleLinkUnlinkedMention(srcId, targetTitle)}
              onCreateSnapshot={() => void handleCreateManualSnapshot()}
              onRestoreSnapshot={(content) => void handleRestoreSnapshot(content)}
            />
          </div>
        )}

        {/* Mobile/Tablet Right Inspector Slide-Over Drawer */}
        {showRightDrawer && (
          <div className="fixed inset-0 z-50 lg:hidden flex justify-end no-print">
            <div className="flex-1 bg-black/45" onClick={() => setShowRightDrawer(false)} />
            <div className="w-80 max-w-[88vw] h-full shadow-2xl relative">
              <button
                type="button"
                onClick={() => setShowRightDrawer(false)}
                className="absolute right-2 top-2 z-10 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg"
                aria-label="Close inspector drawer"
              >
                <X className="w-4 h-4" />
              </button>
              <InspectorPanel
                activeNote={activeNote}
                allNotes={noteIndex}
                snapshots={snapshots}
                walActive={walActive}
                onUpdateMetadata={(metadata) => {
                  if (!activeNote) return;
                  void commitActiveNoteUpdate({
                    ...activeNote,
                    metadata,
                    updatedAt: Date.now(),
                    revision: activeNote.revision + 1,
                  });
                }}
                onUpdateFolderAndTags={(folderPath, tags) => {
                  if (!activeNote) return;
                  void commitActiveNoteUpdate({
                    ...activeNote,
                    folderPath,
                    tags,
                    updatedAt: Date.now(),
                    revision: activeNote.revision + 1,
                  });
                }}
                onOpenNoteById={(id) => {
                  setActiveNoteId(id);
                  setShowRightDrawer(false);
                }}
                onLinkMention={(srcId, targetTitle) =>
                  void handleLinkUnlinkedMention(srcId, targetTitle)
                }
                onCreateSnapshot={() => void handleCreateManualSnapshot()}
                onRestoreSnapshot={(content) => void handleRestoreSnapshot(content)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Compact Mobile/Tablet Bottom Thumb Navigation Bar (<= 56px to stay well under 15% cap) */}
      <nav
        className="sm:hidden no-print border-t grid grid-cols-5 items-center h-14 pb-safe shrink-0"
        style={{
          backgroundColor: 'var(--fv-surface)',
          borderColor: 'var(--fv-border)',
        }}
      >
        {(
          [
            { id: 'editor', label: 'Notes', icon: FileText, onClick: () => setStage('editor') },
            { id: 'graph', label: 'Graph', icon: Network, onClick: () => setStage('graph') },
            { id: 'query', label: 'Query', icon: Database, onClick: () => setStage('query') },
            {
              id: 'inspect',
              label: 'Props',
              icon: PanelRight,
              onClick: () => setShowRightDrawer(true),
            },
            {
              id: 'studio',
              label: 'Studio',
              icon: Settings,
              onClick: () => setShowSettings(true),
            },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const isActive = stage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium cursor-pointer"
              style={{ color: isActive ? 'var(--fv-accent)' : 'var(--fv-muted)' }}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Non-intrusive Offline Indicator */}
      {!isOnline && (
        <div
          className="no-print fixed bottom-16 sm:bottom-4 left-4 z-40 rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 shadow-lg"
          style={{
            backgroundColor: 'var(--fv-surface)',
            borderColor: 'var(--fv-warning)',
            color: 'var(--fv-warning)',
          }}
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Offline Mode — Encrypted local vault active</span>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div
          className="no-print fixed bottom-16 sm:bottom-4 right-4 z-50 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-lg max-w-sm"
          style={{
            backgroundColor: 'var(--fv-surface)',
            borderColor: 'var(--fv-border)',
            color: 'var(--fv-ink)',
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Modals */}
      <CommandPalette
        open={showPalette}
        notes={noteIndex}
        onClose={() => setShowPalette(false)}
        onSelectNote={(id) => {
          setActiveNoteId(id);
          setStage('editor');
        }}
        onAction={(act) => {
          if (act === 'new-note') void handleCreateNote();
          else if (act === 'open-graph') setStage('graph');
          else if (act === 'open-query') setStage('query');
          else if (act === 'open-settings') setShowSettings(true);
          else if (act === 'sync-now') void runDriveSync(false);
          else if (act === 'lock-vault') handleLockVault();
        }}
      />

      <ConflictMergeModal
        conflict={activeConflict}
        onResolve={handleResolveConflict}
        onClose={() => setActiveConflict(null)}
      />

      <SettingsStudioModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        activeThemeId={vaultHeader?.activeThemeId ?? 'editorial-paper'}
        customCss={vaultHeader?.customCss ?? ''}
        onUpdateTheme={(themeId, css) => void handleUpdateTheme(themeId, css)}
        plugins={plugins}
        onSavePlugins={(next) => {
          setPlugins(next);
          void savePlugins(next);
        }}
        shortcuts={shortcuts}
        onSaveShortcuts={(next) => {
          setShortcuts(next);
          void saveShortcuts(next);
        }}
        googleUser={googleUser}
        hasAccessToken={hasAccessToken}
        autoSync={vaultHeader?.autoSync ?? true}
        localFolderName={localDirHandle?.name ?? null}
        lastSyncedAt={vaultHeader?.lastSyncedAt}
        onGoogleSignIn={async () => {
          const { user } = await googleSignIn();
          setGoogleUser(user);
          setHasAccessToken(true);
          notify(`Connected Google Drive as ${user.email}.`);
          void runDriveSync(false);
        }}
        onGoogleSignOut={async () => {
          await logoutGoogle();
          clearAccessToken();
          setGoogleUser(null);
          setHasAccessToken(false);
          notify('Disconnected Google Drive.');
        }}
        onToggleAutoSync={async (enabled) => {
          if (!vaultHeader) return;
          const updated = { ...vaultHeader, autoSync: enabled };
          await saveVaultHeader(updated);
          setVaultHeader(updated);
        }}
        onSyncNow={() => runDriveSync(false)}
        onLinkLocalFolder={handleLinkLocalFolder}
        onExportLocalFolder={handleExportLocalFolder}
        onImportLocalFolder={handleImportLocalFolder}
        onExportEncryptedBackup={handleExportEncryptedBackup}
        onImportEncryptedBackup={handleImportEncryptedBackup}
        onChangePassphrase={handleChangePassphrase}
        onRequestWipeVault={() =>
          setConfirmState({
            open: true,
            title: 'Wipe Local Encrypted Vault?',
            message:
              'This permanently deletes all local IndexedDB notes, snapshots, and encryption keys from this browser. Google Drive backups are not deleted.',
            confirmLabel: 'Wipe Local Vault',
            destructive: true,
            onConfirm: async () => {
              setConfirmState((s) => ({ ...s, open: false }));
              await wipeLocalDatabase();
              setVaultHeader(null);
              handleLockVault();
              notify('Local browser vault wiped.');
            },
          })
        }
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
