export type MetadataFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface MetadataField {
  key: string;
  type: MetadataFieldType;
  value: string | number | boolean;
  options?: string[];
}

export interface NoteIndexEntry {
  id: string;
  title: string;
  folderPath: string;
  tags: string[];
  metadata: Record<string, MetadataField>;
  outboundLinks: string[];
  updatedAt: number;
  createdAt: number;
  revision: number;
  contentHash: string;
  dirty: boolean;
  deleted: boolean;
}

export interface NoteContent {
  id: string;
  title: string;
  folderPath: string;
  tags: string[];
  metadata: Record<string, MetadataField>;
  body: string;
  updatedAt: number;
  createdAt: number;
  revision: number;
  contentHash: string;
}

export interface EncryptedEnvelope {
  id: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
  revision: number;
  contentHash: string;
  deleted: boolean;
}

export interface VaultHeader {
  vaultId: string;
  salt: string;
  kdfIterations: number;
  keyCheckIv: string;
  keyCheckCiphertext: string;
  activeThemeId: string;
  customCss: string;
  autoSync: boolean;
  driveFolderId?: string;
  lastSyncedAt?: number;
  createdAt: number;
}

export interface WalEntry {
  walId: string;
  noteId: string;
  timestamp: number;
  iv: string;
  ciphertext: string;
}

export interface SnapshotRecord {
  snapshotId: string;
  noteId: string;
  timestamp: number;
  reason: 'auto' | 'manual' | 'wal-recovery' | 'pre-merge';
  iv: string;
  ciphertext: string;
}

export type QueryOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'is_empty';

export interface QueryCondition {
  id: string;
  field: string; // 'title' | 'body' | 'folderPath' | 'tag' | custom metadata key
  operator: QueryOperator;
  value: string;
}

export interface QueryAggregation {
  field: string;
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max';
}

export interface QueryDefinition {
  id: string;
  name: string;
  folderScope: string;
  tagFilter: string;
  conditions: QueryCondition[];
  sortBy: string;
  sortDir: 'asc' | 'desc';
  aggregations: QueryAggregation[];
  createdAt: number;
}

export type PluginHookType =
  | 'callout-blocks'
  | 'smart-typography'
  | 'kanban-board'
  | 'citation-footnotes'
  | 'reading-stats'
  | 'custom-regex'
  | 'custom-script';

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  builtIn: boolean;
  hookType: PluginHookType;
  pattern?: string;
  replacement?: string;
  slashTrigger?: string;
  slashTemplate?: string;
  scriptBody?: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  isDark: boolean;
  description: string;
  cssVariables: Record<string, string>;
}

export interface KeyboardShortcut {
  id: string;
  label: string;
  keys: string; // e.g. 'mod+k', 'mod+n', 'mod+g'
  action:
    | 'command-palette'
    | 'new-note'
    | 'toggle-sidebar'
    | 'toggle-graph'
    | 'toggle-query'
    | 'cycle-view-mode'
    | 'create-snapshot'
    | 'sync-now'
    | 'open-settings'
    | 'lock-vault';
}

export interface ConflictPair {
  noteId: string;
  title: string;
  localContent: NoteContent;
  remoteContent: NoteContent;
  remoteFileId?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict' | 'error';

export type WorkspaceStage = 'editor' | 'graph' | 'query';
export type EditorViewMode = 'split' | 'edit' | 'preview';
