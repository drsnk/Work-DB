import type { NoteContent, QueryDefinition } from '../types/vault';
import { sha256Hex } from './crypto';

export async function createStarterNotes(): Promise<NoteContent[]> {
  const now = Date.now();
  const day = 86_400_000;

  const rawNotes: Omit<NoteContent, 'contentHash' | 'revision'>[] = [
    {
      id: 'note-vault-architecture',
      title: 'Zero-Knowledge Vault Architecture',
      folderPath: 'Research/Cryptography',
      tags: ['crypto/aes', 'architecture', 'security'],
      createdAt: now - 5 * day,
      updatedAt: now - day,
      metadata: {
        status: { key: 'status', type: 'select', value: 'Verified', options: ['Draft', 'Review', 'Verified'] },
        cipher: { key: 'cipher', type: 'text', value: 'AES-256-GCM' },
        iterations: { key: 'iterations', type: 'number', value: 250000 },
        audited: { key: 'audited', type: 'boolean', value: true },
        reviewDate: { key: 'reviewDate', type: 'date', value: '2026-11-15' },
      },
      body: `# Zero-Knowledge Vault Architecture

FolioVault encrypts every document and metadata index client-side prior to IndexedDB persistence or [[Google Drive Sync Protocol]] upload.

> [!IMPORTANT]
> Your master passphrase never leaves memory. Key derivation runs locally using WebCrypto PBKDF2-SHA256 before any storage write occurs.

## Cryptographic Specification

The authenticated ciphertext envelope follows:

$$C, T = \\text{AES-256-GCM}_{K}(IV, P)$$

Where key $K = \\text{PBKDF2}(\\text{passphrase}, \\text{salt}, 250{,}000)$ and $IV \\in \\{0,1\\}^{96}$ is freshly sampled per document save.

## Related Specifications

- [[Crash-Safe WAL & Snapshots]]
- [[Q4 Hardware & Security Budget]]
- [[Tablet Touch Ergonomics]]
`,
    },
    {
      id: 'note-drive-sync',
      title: 'Google Drive Sync Protocol',
      folderPath: 'Research/Cryptography',
      tags: ['sync/drive', 'offline-first', 'architecture'],
      createdAt: now - 4 * day,
      updatedAt: now - 2 * day,
      metadata: {
        status: { key: 'status', type: 'select', value: 'Active', options: ['Draft', 'Active', 'Archived'] },
        scope: { key: 'scope', type: 'text', value: 'drive.file' },
        conflictMode: { key: 'conflictMode', type: 'text', value: 'Interactive Side-by-Side Merge' },
        priority: { key: 'priority', type: 'number', value: 1 },
      },
      body: `# Google Drive Sync Protocol

Offline edits queue locally in IndexedDB and reconcile automatically once connectivity returns. See [[Zero-Knowledge Vault Architecture]] for the envelope format.

## Reconciliation Matrix

| State | Local Dirty | Remote Revision | Resolution |
| --- | --- | --- | --- |
| Clean Sync | No | Newer | Download & decrypt |
| Local Push | Yes | Unchanged | Upload encrypted envelope |
| Diverged | Yes | Newer | Open Side-by-Side Merge Modal |

## Offline Workflow

\`\`\`kanban
## Queued Offline
- Draft field notes on iPad
- Update Q4 formula table

## Syncing
- Verify SHA-256 content hashes

## Reconciled
- Encrypted manifest updated
\`\`\`
`,
    },
    {
      id: 'note-q4-budget',
      title: 'Q4 Hardware & Security Budget',
      folderPath: 'Projects/Operations',
      tags: ['finance/q4', 'planning', 'security'],
      createdAt: now - 3 * day,
      updatedAt: now - 3600_000,
      metadata: {
        status: { key: 'status', type: 'select', value: 'Approved', options: ['Draft', 'Review', 'Approved'] },
        owner: { key: 'owner', type: 'text', value: 'Infrastructure' },
        budgetCap: { key: 'budgetCap', type: 'number', value: 6500 },
        quarter: { key: 'quarter', type: 'text', value: '2026-Q4' },
        approved: { key: 'approved', type: 'boolean', value: true },
      },
      body: `# Q4 Hardware & Security Budget

Live spreadsheet formulas calculate totals directly inside Markdown tables. Cross-reference [[Zero-Knowledge Vault Architecture]] for HSM & tablet test requirements.

## Line Item Allocation

| Item | Units | Unit Cost | Total | Status |
| --- | --- | --- | --- | --- |
| YubiKey 5C NFC | 12 | 55 | =B2*C2 | =IF(D2>500,"Audit","Standard") |
| iPad Air Test Unit | 2 | 599 | =B3*C3 | =IF(D3>500,"Audit","Standard") |
| Android Tablet Unit | 2 | 420 | =B4*C4 | =IF(D4>500,"Audit","Standard") |
| Cold Backup NVMe Drives | 4 | 185 | =B5*C5 | =IF(D5>500,"Audit","Standard") |
| **Aggregate Total** | =SUM(B2:B5) | =AVG(C2:C5) | =SUM(D2:D5) | =COUNT(D2:D5) |

> [!TIP]
> Hover any highlighted formula cell in Preview mode to inspect its underlying expression (\`=SUM\`, \`=AVG\`, \`=IF\`).
`,
    },
    {
      id: 'note-wal-snapshots',
      title: 'Crash-Safe WAL & Snapshots',
      folderPath: 'Research/Reliability',
      tags: ['reliability/wal', 'architecture'],
      createdAt: now - 2 * day,
      updatedAt: now - 7200_000,
      metadata: {
        status: { key: 'status', type: 'select', value: 'Verified', options: ['Draft', 'Verified'] },
        retentionLimit: { key: 'retentionLimit', type: 'number', value: 20 },
        autoRecover: { key: 'autoRecover', type: 'boolean', value: true },
      },
      body: `# Crash-Safe WAL & Snapshots

To eliminate data loss during unexpected browser crashes or battery depletion, every edit writes an encrypted Write-Ahead Log (WAL) record before committing to the vault store.

## Recovery Guarantees

1. **Continuous WAL Checkpoints**: Uncommitted drafts recover automatically when unlocking the vault.
2. **Rolling Point-in-Time Snapshots**: Restore any prior revision from the **Recovery** tab in the right inspector.
3. **Encrypted Archive Backups**: Export a full \`.fvault\` bundle anytime via Settings.

Linked from [[Zero-Knowledge Vault Architecture]].
`,
    },
    {
      id: 'note-tablet-ergonomics',
      title: 'Tablet Touch Ergonomics',
      folderPath: 'Projects/Design',
      tags: ['ui/tablet', 'pwa', 'design'],
      createdAt: now - day,
      updatedAt: now - 1800_000,
      metadata: {
        status: { key: 'status', type: 'select', value: 'Active', options: ['Draft', 'Active', 'Complete'] },
        targetDevices: { key: 'targetDevices', type: 'text', value: 'iPadOS & Android Tablets' },
        minTouchPx: { key: 'minTouchPx', type: 'number', value: 44 },
        pwaReady: { key: 'pwaReady', type: 'boolean', value: true },
      },
      body: `# Tablet Touch Ergonomics

FolioVault installs as an offline-capable Progressive Web App across iPadOS Safari, Android tablets, and desktop workstations.

## Responsive Design Rules

- Minimum \`44x44px\` interactive touch targets for all formatting, navigation, and graph controls.
- Slide-over navigation and inspector drawers preserve horizontal editing canvas on tablets.
- Touch formatting bar pins bold, link, table, math, and checklist actions within thumb reach.

See also [[Google Drive Sync Protocol]].
`,
    },
  ];

  const seeded: NoteContent[] = [];
  for (const n of rawNotes) {
    const hash = await sha256Hex(`${n.title}:${n.folderPath}:${n.body}`);
    seeded.push({
      ...n,
      revision: 1,
      contentHash: hash,
    });
  }
  return seeded;
}

export function createStarterQueries(): QueryDefinition[] {
  return [
    {
      id: 'query-security-docs',
      name: 'Security & Architecture Audit',
      folderScope: 'ALL',
      tagFilter: 'security',
      conditions: [],
      sortBy: 'updatedAt',
      sortDir: 'desc',
      aggregations: [{ field: 'budgetCap', fn: 'sum' }],
      createdAt: Date.now() - 86_400_000,
    },
    {
      id: 'query-research-crypto',
      name: 'Cryptography Research Specs',
      folderScope: 'Research',
      tagFilter: '',
      conditions: [],
      sortBy: 'title',
      sortDir: 'asc',
      aggregations: [{ field: 'iterations', fn: 'max' }],
      createdAt: Date.now(),
    },
  ];
}
