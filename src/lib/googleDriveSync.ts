import type {
  ConflictPair,
  EncryptedEnvelope,
  NoteContent,
  NoteIndexEntry,
  VaultHeader,
} from '../types/vault';
import { decryptPayload } from './crypto';
import { getAllRawEnvelopes, putRawEnvelope } from './db';

const DRIVE_FOLDER_NAME = 'FolioVault Encrypted Vault';
const MANIFEST_FILENAME = 'foliovault-manifest.json';
const HEADER_FILENAME = 'foliovault-vault-header.json';

interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface RemoteManifest {
  vaultId: string;
  updatedAt: number;
  entries: Record<
    string,
    {
      id: string;
      revision: number;
      contentHash: string;
      updatedAt: number;
      deleted: boolean;
      driveFileId: string;
    }
  >;
}

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Google Drive API error (${res.status}): ${msg}`);
  }
  return res;
}

export async function ensureDriveVaultFolder(
  token: string,
  knownFolderId?: string
): Promise<string> {
  if (knownFolderId) {
    try {
      const check = await fetch(
        `https://www.googleapis.com/drive/v3/files/${knownFolderId}?fields=id,trashed`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (check.ok) {
        const data = (await check.json()) as { id: string; trashed?: boolean };
        if (data.id && !data.trashed) return data.id;
      }
    } catch {
      // Fall through to search/create
    }
  }

  const query = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    token
  );
  const searchJson = (await searchRes.json()) as { files?: DriveFileMeta[] };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0].id;
  }

  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const created = (await createRes.json()) as DriveFileMeta;
  return created.id;
}

async function findFileInFolder(
  token: string,
  folderId: string,
  fileName: string
): Promise<DriveFileMeta | null> {
  const query = encodeURIComponent(
    `name='${fileName}' and '${folderId}' in parents and trashed=false`
  );
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`,
    token
  );
  const json = (await res.json()) as { files?: DriveFileMeta[] };
  return json.files?.[0] ?? null;
}

async function uploadJsonFileToDrive(
  token: string,
  folderId: string,
  fileName: string,
  payload: unknown,
  existingFileId?: string
): Promise<string> {
  const metadata = existingFileId
    ? { name: fileName }
    : { name: fileName, parents: [folderId] };

  const boundary = `foliovault_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await driveFetch(url, token, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const result = (await res.json()) as DriveFileMeta;
  return result.id;
}

async function downloadJsonFileFromDrive<T>(token: string, fileId: string): Promise<T> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    token
  );
  return (await res.json()) as T;
}

export async function deleteRemoteDriveFile(token: string, fileId: string): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, token, {
    method: 'DELETE',
  });
}

export interface DriveSyncOutcome {
  driveFolderId: string;
  uploadedCount: number;
  downloadedCount: number;
  conflicts: ConflictPair[];
  updatedIndexEntries: NoteIndexEntry[];
}

export async function synchronizeWithGoogleDrive(
  token: string,
  cryptoKey: CryptoKey,
  header: VaultHeader,
  localIndex: NoteIndexEntry[]
): Promise<DriveSyncOutcome> {
  const folderId = await ensureDriveVaultFolder(token, header.driveFolderId);

  const manifestMeta = await findFileInFolder(token, folderId, MANIFEST_FILENAME);
  let manifest: RemoteManifest = {
    vaultId: header.vaultId,
    updatedAt: Date.now(),
    entries: {},
  };

  if (manifestMeta) {
    try {
      manifest = await downloadJsonFileFromDrive<RemoteManifest>(token, manifestMeta.id);
    } catch {
      // Initialize fresh manifest if corrupted
    }
  }

  const localEnvelopes = await getAllRawEnvelopes();
  const envelopeMap = new Map(localEnvelopes.map((e) => [e.id, e]));
  const indexMap = new Map(localIndex.map((e) => [e.id, { ...e }]));

  let uploadedCount = 0;
  let downloadedCount = 0;
  const conflicts: ConflictPair[] = [];

  // 1. Inspect local items against remote manifest
  for (const localEntry of localIndex) {
    const remoteEntry = manifest.entries[localEntry.id];
    const envelope = envelopeMap.get(localEntry.id);

    if (!remoteEntry) {
      // New local note -> upload encrypted envelope
      if (envelope && !localEntry.deleted) {
        const fileId = await uploadJsonFileToDrive(
          token,
          folderId,
          `note-${localEntry.id}.enc.json`,
          envelope
        );
        manifest.entries[localEntry.id] = {
          id: localEntry.id,
          revision: localEntry.revision,
          contentHash: localEntry.contentHash,
          updatedAt: localEntry.updatedAt,
          deleted: localEntry.deleted,
          driveFileId: fileId,
        };
        indexMap.set(localEntry.id, { ...localEntry, dirty: false });
        uploadedCount++;
      }
      continue;
    }

    const hashesMatch = localEntry.contentHash === remoteEntry.contentHash;
    if (hashesMatch && localEntry.deleted === remoteEntry.deleted) {
      indexMap.set(localEntry.id, { ...localEntry, dirty: false });
      continue;
    }

    if (localEntry.dirty && remoteEntry.revision > localEntry.revision) {
      // Both diverged offline -> fetch remote encrypted envelope and decrypt locally for side-by-side merge
      try {
        const remoteEnv = await downloadJsonFileFromDrive<EncryptedEnvelope>(
          token,
          remoteEntry.driveFileId
        );
        const remoteNote = await decryptPayload<NoteContent>(
          cryptoKey,
          remoteEnv.iv,
          remoteEnv.ciphertext
        );
        if (envelope) {
          const localNote = await decryptPayload<NoteContent>(
            cryptoKey,
            envelope.iv,
            envelope.ciphertext
          );
          conflicts.push({
            noteId: localEntry.id,
            title: localEntry.title,
            localContent: localNote,
            remoteContent: remoteNote,
            remoteFileId: remoteEntry.driveFileId,
          });
        }
      } catch {
        // Unable to decrypt remote (e.g. different passphrase)
      }
      continue;
    }

    if (localEntry.dirty || localEntry.revision > remoteEntry.revision) {
      // Push local encrypted update
      if (envelope) {
        const fileId = await uploadJsonFileToDrive(
          token,
          folderId,
          `note-${localEntry.id}.enc.json`,
          envelope,
          remoteEntry.driveFileId
        );
        manifest.entries[localEntry.id] = {
          id: localEntry.id,
          revision: localEntry.revision,
          contentHash: localEntry.contentHash,
          updatedAt: localEntry.updatedAt,
          deleted: localEntry.deleted,
          driveFileId: fileId,
        };
        indexMap.set(localEntry.id, { ...localEntry, dirty: false });
        uploadedCount++;
      }
    } else if (remoteEntry.revision > localEntry.revision) {
      // Pull newer remote encrypted envelope
      try {
        const remoteEnv = await downloadJsonFileFromDrive<EncryptedEnvelope>(
          token,
          remoteEntry.driveFileId
        );
        await putRawEnvelope(remoteEnv);
        const decrypted = await decryptPayload<NoteContent>(
          cryptoKey,
          remoteEnv.iv,
          remoteEnv.ciphertext
        );
        const outbound = extractLinksQuick(decrypted.body);
        indexMap.set(localEntry.id, {
          id: decrypted.id,
          title: decrypted.title,
          folderPath: decrypted.folderPath,
          tags: decrypted.tags,
          metadata: decrypted.metadata,
          outboundLinks: outbound,
          updatedAt: decrypted.updatedAt,
          createdAt: decrypted.createdAt,
          revision: decrypted.revision,
          contentHash: decrypted.contentHash,
          dirty: false,
          deleted: remoteEntry.deleted,
        });
        downloadedCount++;
      } catch {
        // Ignore foreign encrypted envelope
      }
    }
  }

  // 2. Discover remote-only notes created on other devices
  for (const [noteId, remoteEntry] of Object.entries(manifest.entries)) {
    if (indexMap.has(noteId) || remoteEntry.deleted) continue;
    try {
      const remoteEnv = await downloadJsonFileFromDrive<EncryptedEnvelope>(
        token,
        remoteEntry.driveFileId
      );
      await putRawEnvelope(remoteEnv);
      const decrypted = await decryptPayload<NoteContent>(
        cryptoKey,
        remoteEnv.iv,
        remoteEnv.ciphertext
      );
      indexMap.set(noteId, {
        id: decrypted.id,
        title: decrypted.title,
        folderPath: decrypted.folderPath,
        tags: decrypted.tags,
        metadata: decrypted.metadata,
        outboundLinks: extractLinksQuick(decrypted.body),
        updatedAt: decrypted.updatedAt,
        createdAt: decrypted.createdAt,
        revision: decrypted.revision,
        contentHash: decrypted.contentHash,
        dirty: false,
        deleted: false,
      });
      downloadedCount++;
    } catch {
      // Ignore
    }
  }

  // 3. Persist updated manifest & header metadata
  if (uploadedCount > 0 || !manifestMeta) {
    manifest.updatedAt = Date.now();
    await uploadJsonFileToDrive(
      token,
      folderId,
      MANIFEST_FILENAME,
      manifest,
      manifestMeta?.id
    );
  }

  const headerMeta = await findFileInFolder(token, folderId, HEADER_FILENAME);
  if (!headerMeta || uploadedCount > 0) {
    await uploadJsonFileToDrive(
      token,
      folderId,
      HEADER_FILENAME,
      { ...header, driveFolderId: folderId },
      headerMeta?.id
    );
  }

  return {
    driveFolderId: folderId,
    uploadedCount,
    downloadedCount,
    conflicts,
    updatedIndexEntries: Array.from(indexMap.values()),
  };
}

export async function pushResolvedNoteToDrive(
  token: string,
  header: VaultHeader,
  envelope: EncryptedEnvelope,
  remoteFileId?: string
): Promise<void> {
  const folderId = await ensureDriveVaultFolder(token, header.driveFolderId);
  const manifestMeta = await findFileInFolder(token, folderId, MANIFEST_FILENAME);
  let manifest: RemoteManifest = {
    vaultId: header.vaultId,
    updatedAt: Date.now(),
    entries: {},
  };
  if (manifestMeta) {
    try {
      manifest = await downloadJsonFileFromDrive<RemoteManifest>(token, manifestMeta.id);
    } catch {
      // ignore
    }
  }

  const fileId = await uploadJsonFileToDrive(
    token,
    folderId,
    `note-${envelope.id}.enc.json`,
    envelope,
    remoteFileId ?? manifest.entries[envelope.id]?.driveFileId
  );

  manifest.entries[envelope.id] = {
    id: envelope.id,
    revision: envelope.revision,
    contentHash: envelope.contentHash,
    updatedAt: envelope.updatedAt,
    deleted: envelope.deleted,
    driveFileId: fileId,
  };
  manifest.updatedAt = Date.now();
  await uploadJsonFileToDrive(token, folderId, MANIFEST_FILENAME, manifest, manifestMeta?.id);
}

export async function bootstrapVaultFromGoogleDrive(token: string): Promise<{
  header: VaultHeader;
  downloadedEnvelopes: number;
} | null> {
  const folderId = await ensureDriveVaultFolder(token);
  const headerMeta = await findFileInFolder(token, folderId, HEADER_FILENAME);
  if (!headerMeta) return null;

  const remoteHeader = await downloadJsonFileFromDrive<VaultHeader>(token, headerMeta.id);
  const manifestMeta = await findFileInFolder(token, folderId, MANIFEST_FILENAME);
  let downloadedEnvelopes = 0;

  if (manifestMeta) {
    try {
      const manifest = await downloadJsonFileFromDrive<RemoteManifest>(token, manifestMeta.id);
      for (const entry of Object.values(manifest.entries)) {
        if (entry.deleted) continue;
        const env = await downloadJsonFileFromDrive<EncryptedEnvelope>(token, entry.driveFileId);
        await putRawEnvelope(env);
        downloadedEnvelopes++;
      }
    } catch {
      // Proceed with header even if manifest is empty
    }
  }

  return {
    header: { ...remoteHeader, driveFolderId: folderId },
    downloadedEnvelopes,
  };
}

function extractLinksQuick(markdown: string): string[] {
  const links = new Set<string>();
  const rx = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(markdown)) !== null) {
    if (m[1].trim()) links.add(m[1].trim());
  }
  return Array.from(links);
}
