import type {
  NoteContent,
  NoteIndexEntry,
  QueryCondition,
  QueryDefinition,
} from '../types/vault';

export interface QueryResultRow {
  note: NoteIndexEntry;
  matchedFields: Record<string, string | number | boolean>;
}

export interface QueryExecutionResult {
  rows: QueryResultRow[];
  aggregations: { label: string; value: string }[];
  columns: string[];
}

function getFieldValue(
  entry: NoteIndexEntry,
  field: string,
  body?: string
): string | number | boolean | undefined {
  if (field === 'title') return entry.title;
  if (field === 'folderPath') return entry.folderPath;
  if (field === 'tags') return entry.tags.join(', ');
  if (field === 'updatedAt') return new Date(entry.updatedAt).toISOString().slice(0, 10);
  if (field === 'body') return body ?? '';
  return entry.metadata[field]?.value;
}

function evaluateCondition(
  entry: NoteIndexEntry,
  cond: QueryCondition,
  body?: string
): boolean {
  if (cond.field === 'tag') {
    const target = cond.value.toLowerCase().replace(/^#/, '');
    if (cond.operator === 'contains' || cond.operator === 'equals') {
      return entry.tags.some(
        (t) => t.toLowerCase() === target || t.toLowerCase().startsWith(`${target}/`)
      );
    }
    if (cond.operator === 'not_equals') {
      return !entry.tags.some((t) => t.toLowerCase() === target);
    }
    if (cond.operator === 'is_empty') {
      return entry.tags.length === 0;
    }
  }

  const rawVal = getFieldValue(entry, cond.field, body);
  if (cond.operator === 'is_empty') {
    return rawVal === undefined || rawVal === '';
  }
  if (rawVal === undefined) return false;

  const strVal = String(rawVal).toLowerCase();
  const targetStr = cond.value.toLowerCase();

  if (cond.operator === 'equals') return strVal === targetStr;
  if (cond.operator === 'not_equals') return strVal !== targetStr;
  if (cond.operator === 'contains') return strVal.includes(targetStr);

  const numVal = Number(rawVal);
  const numTarget = Number(cond.value);
  if (!Number.isNaN(numVal) && !Number.isNaN(numTarget)) {
    if (cond.operator === 'gt') return numVal > numTarget;
    if (cond.operator === 'lt') return numVal < numTarget;
    if (cond.operator === 'gte') return numVal >= numTarget;
    if (cond.operator === 'lte') return numVal <= numTarget;
  } else {
    if (cond.operator === 'gt') return strVal > targetStr;
    if (cond.operator === 'lt') return strVal < targetStr;
    if (cond.operator === 'gte') return strVal >= targetStr;
    if (cond.operator === 'lte') return strVal <= targetStr;
  }

  return false;
}

export async function executeVaultQuery(
  query: QueryDefinition,
  index: NoteIndexEntry[],
  loadBody?: (noteId: string) => Promise<NoteContent | null>
): Promise<QueryExecutionResult> {
  const activeNotes = index.filter((n) => !n.deleted);
  const needsBody = query.conditions.some((c) => c.field === 'body');

  const filtered: NoteIndexEntry[] = [];
  for (const entry of activeNotes) {
    if (
      query.folderScope &&
      query.folderScope !== 'ALL' &&
      !entry.folderPath.startsWith(query.folderScope)
    ) {
      continue;
    }

    if (query.tagFilter) {
      const targetTag = query.tagFilter.replace(/^#/, '').toLowerCase();
      const hasTag = entry.tags.some(
        (t) => t.toLowerCase() === targetTag || t.toLowerCase().startsWith(`${targetTag}/`)
      );
      if (!hasTag) continue;
    }

    let bodyText: string | undefined;
    if (needsBody && loadBody) {
      const loaded = await loadBody(entry.id);
      bodyText = loaded?.body ?? '';
    }

    const matchesAll = query.conditions.every((cond) =>
      evaluateCondition(entry, cond, bodyText)
    );
    if (matchesAll) filtered.push(entry);
  }

  filtered.sort((a, b) => {
    const va = getFieldValue(a, query.sortBy) ?? '';
    const vb = getFieldValue(b, query.sortBy) ?? '';
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }
    return query.sortDir === 'asc' ? cmp : -cmp;
  });

  // Discover all custom metadata keys across matched notes
  const metaKeys = new Set<string>();
  filtered.forEach((n) => {
    Object.keys(n.metadata).forEach((k) => metaKeys.add(k));
  });
  const columns = Array.from(metaKeys).slice(0, 6);

  const rows: QueryResultRow[] = filtered.map((note) => {
    const matchedFields: Record<string, string | number | boolean> = {};
    for (const key of columns) {
      if (note.metadata[key] !== undefined) {
        matchedFields[key] = note.metadata[key].value;
      }
    }
    return { note, matchedFields };
  });

  // Compute aggregations
  const aggregations: { label: string; value: string }[] = [
    { label: 'Total Records', value: String(rows.length) },
  ];

  for (const agg of query.aggregations) {
    if (agg.fn === 'count') {
      aggregations.push({ label: `COUNT(${agg.field})`, value: String(rows.length) });
      continue;
    }
    const nums = rows
      .map((r) => Number(r.note.metadata[agg.field]?.value))
      .filter((v) => !Number.isNaN(v));
    if (nums.length === 0) {
      aggregations.push({ label: `${agg.fn.toUpperCase()}(${agg.field})`, value: '0' });
      continue;
    }
    let val = 0;
    if (agg.fn === 'sum') val = nums.reduce((a, b) => a + b, 0);
    else if (agg.fn === 'avg') val = nums.reduce((a, b) => a + b, 0) / nums.length;
    else if (agg.fn === 'min') val = Math.min(...nums);
    else if (agg.fn === 'max') val = Math.max(...nums);

    aggregations.push({
      label: `${agg.fn.toUpperCase()}(${agg.field})`,
      value: Number.isInteger(val) ? String(val) : val.toFixed(2),
    });
  }

  return { rows, aggregations, columns };
}

export function compileQueryReportMarkdown(
  query: QueryDefinition,
  result: QueryExecutionResult
): { title: string; folderPath: string; body: string; tags: string[] } {
  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `Report: ${query.name} (${dateStr})`;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(
    `Generated from database query **${query.name}** across folder scope \`${
      query.folderScope || 'ALL'
    }\`${query.tagFilter ? ` filtered by \`#${query.tagFilter}\`` : ''}.`
  );
  lines.push('');
  lines.push('## Summary Metrics');
  lines.push('');
  for (const agg of result.aggregations) {
    lines.push(`- **${agg.label}**: ${agg.value}`);
  }
  lines.push('');
  lines.push('## Compiled Records');
  lines.push('');

  const headers = ['Document', 'Folder', 'Tags', ...result.columns, 'Updated'];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);

  for (const row of result.rows) {
    const cells = [
      `[[${row.note.title}]]`,
      row.note.folderPath,
      row.note.tags.map((t) => `#${t}`).join(' '),
      ...result.columns.map((c) => {
        const v = row.matchedFields[c];
        return v === undefined ? '—' : String(v);
      }),
      new Date(row.note.updatedAt).toISOString().slice(0, 10),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }

  // Add formula total row if any numeric metadata column exists
  if (result.rows.length > 0 && result.columns.length > 0) {
    const firstNumericColIdx = result.columns.findIndex((col) =>
      result.rows.some((r) => typeof r.matchedFields[col] === 'number')
    );
    if (firstNumericColIdx !== -1) {
      const colIndex = 3 + firstNumericColIdx;
      const colLetter = String.fromCharCode(65 + colIndex);
      const lastRow = result.rows.length + 1;
      const sumCells = headers.map((_, idx) => {
        if (idx === 0) return '**Formula Total**';
        if (idx === colIndex) return `=SUM(${colLetter}2:${colLetter}${lastRow})`;
        return '';
      });
      lines.push(`| ${sumCells.join(' | ')} |`);
    }
  }

  return {
    title,
    folderPath: 'Reports',
    tags: ['report', 'database-query'],
    body: lines.join('\n'),
  };
}
