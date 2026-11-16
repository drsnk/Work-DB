import React, { useEffect, useMemo, useState } from 'react';
import { FileOutput, Play, Plus, Save, Trash2 } from 'lucide-react';
import type {
  NoteContent,
  NoteIndexEntry,
  QueryCondition,
  QueryDefinition,
  QueryOperator,
} from '../types/vault';
import {
  compileQueryReportMarkdown,
  executeVaultQuery,
  type QueryExecutionResult,
} from '../lib/queryEngine';

interface QueryBuilderViewProps {
  notes: NoteIndexEntry[];
  savedQueries: QueryDefinition[];
  initialQuery?: QueryDefinition | null;
  loadNoteBody: (noteId: string) => Promise<NoteContent | null>;
  onSaveQuery: (query: QueryDefinition) => Promise<void>;
  onDeleteQuery: (queryId: string) => Promise<void>;
  onCompileReportNote: (report: {
    title: string;
    folderPath: string;
    body: string;
    tags: string[];
  }) => Promise<void>;
  onOpenNote: (noteId: string) => void;
}

export const QueryBuilderView: React.FC<QueryBuilderViewProps> = ({
  notes,
  savedQueries,
  initialQuery,
  loadNoteBody,
  onSaveQuery,
  onDeleteQuery,
  onCompileReportNote,
  onOpenNote,
}) => {
  const [query, setQuery] = useState<QueryDefinition>(
    initialQuery ?? {
      id: `query-${Date.now()}`,
      name: 'Custom Vault Report',
      folderScope: 'ALL',
      tagFilter: '',
      conditions: [],
      sortBy: 'updatedAt',
      sortDir: 'desc',
      aggregations: [],
      createdAt: Date.now(),
    }
  );
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const discoveredMetadataKeys = useMemo(() => {
    const set = new Set<string>(['title', 'folderPath', 'tag', 'body', 'updatedAt']);
    notes.forEach((n) => {
      if (!n.deleted) Object.keys(n.metadata).forEach((k) => set.add(k));
    });
    return Array.from(set);
  }, [notes]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    notes.filter((n) => !n.deleted).forEach((n) => set.add(n.folderPath));
    return Array.from(set).sort();
  }, [notes]);

  const runQuery = async (targetQuery = query) => {
    setIsRunning(true);
    try {
      const res = await executeVaultQuery(targetQuery, notes, loadNoteBody);
      setResult(res);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    void runQuery(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.folderScope, query.tagFilter, query.sortBy, query.sortDir, query.conditions, query.aggregations, notes]);

  const addCondition = () => {
    const newCond: QueryCondition = {
      id: `cond-${Date.now()}`,
      field: discoveredMetadataKeys[0] || 'title',
      operator: 'contains',
      value: '',
    };
    setQuery((q) => ({ ...q, conditions: [...q.conditions, newCond] }));
  };

  const addAggregation = () => {
    const numericKey =
      discoveredMetadataKeys.find(
        (k) => !['title', 'folderPath', 'tag', 'body', 'updatedAt'].includes(k)
      ) ?? 'iterations';
    setQuery((q) => ({
      ...q,
      aggregations: [...q.aggregations, { field: numericKey, fn: 'sum' }],
    }));
  };

  const handleCompile = async () => {
    if (!result) return;
    const report = compileQueryReportMarkdown(query, result);
    await onCompileReportNote(report);
  };

  return (
    <div
      className="h-full overflow-y-auto p-5 sm:p-8"
      style={{ backgroundColor: 'var(--fv-canvas)', color: 'var(--fv-ink)' }}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">
              Database Query & Report Compiler
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--fv-muted)' }}>
              Filter across encrypted metadata fields, folders, and tags, compute aggregations, and compile results into a new Markdown report file.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSaveQuery(query)}
              className="min-h-[42px] px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                borderColor: 'var(--fv-border)',
                backgroundColor: 'var(--fv-surface)',
              }}
            >
              <Save className="w-3.5 h-3.5" />
              Save Query
            </button>
            <button
              type="button"
              onClick={handleCompile}
              disabled={!result}
              className="min-h-[42px] px-4 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              style={{
                backgroundColor: 'var(--fv-accent)',
                color: 'var(--fv-accent-ink)',
              }}
            >
              <FileOutput className="w-3.5 h-3.5" />
              Compile Report Note
            </button>
          </div>
        </div>

        {/* Saved Queries Strip */}
        {savedQueries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--fv-muted)' }}>
              Saved:
            </span>
            {savedQueries.map((sq) => (
              <div
                key={sq.id}
                className="inline-flex items-center rounded-lg border overflow-hidden"
                style={{
                  borderColor: 'var(--fv-border)',
                  backgroundColor: 'var(--fv-surface)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setQuery(sq)}
                  className="px-3 py-1.5 text-xs font-medium hover:opacity-75 cursor-pointer"
                >
                  {sq.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteQuery(sq.id)}
                  className="px-2 py-1.5 border-l hover:opacity-75 cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)', color: 'var(--fv-muted)' }}
                  aria-label={`Delete saved query ${sq.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Query Parameters Surface */}
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{
            backgroundColor: 'var(--fv-surface)',
            borderColor: 'var(--fv-border)',
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fv-muted)' }}>
                Query Title
              </label>
              <input
                type="text"
                value={query.name}
                onChange={(e) => setQuery((q) => ({ ...q, name: e.target.value }))}
                className="w-full min-h-[40px] rounded-lg border px-3 text-xs outline-none"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fv-muted)' }}>
                Folder Scope
              </label>
              <select
                value={query.folderScope}
                onChange={(e) => setQuery((q) => ({ ...q, folderScope: e.target.value }))}
                className="w-full min-h-[40px] rounded-lg border px-2.5 text-xs outline-none"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
              >
                <option value="ALL">All Folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fv-muted)' }}>
                Tag Prefix Filter
              </label>
              <input
                type="text"
                value={query.tagFilter}
                onChange={(e) => setQuery((q) => ({ ...q, tagFilter: e.target.value }))}
                placeholder="e.g. security or crypto/aes"
                className="w-full min-h-[40px] rounded-lg border px-3 text-xs font-mono outline-none"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fv-muted)' }}>
                Sort Order
              </label>
              <div className="flex gap-1.5">
                <select
                  value={query.sortBy}
                  onChange={(e) => setQuery((q) => ({ ...q, sortBy: e.target.value }))}
                  className="flex-1 min-h-[40px] rounded-lg border px-2 text-xs outline-none"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                >
                  {discoveredMetadataKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setQuery((q) => ({ ...q, sortDir: q.sortDir === 'asc' ? 'desc' : 'asc' }))
                  }
                  className="min-h-[40px] px-2.5 rounded-lg border text-xs font-mono cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  {query.sortDir.toUpperCase()}
                </button>
              </div>
            </div>
          </div>

          {/* Filter Conditions */}
          <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--fv-border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--fv-muted)' }}>
                Filter Conditions ({query.conditions.length})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCondition}
                  className="min-h-[36px] px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Filter
                </button>
                <button
                  type="button"
                  onClick={addAggregation}
                  className="min-h-[36px] px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Aggregation
                </button>
                <button
                  type="button"
                  onClick={() => runQuery(query)}
                  className="min-h-[36px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  <Play className="w-3.5 h-3.5" />
                  {isRunning ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>

            {query.conditions.map((cond) => (
              <div key={cond.id} className="flex flex-wrap items-center gap-2">
                <select
                  value={cond.field}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      conditions: q.conditions.map((c) =>
                        c.id === cond.id ? { ...c, field: e.target.value } : c
                      ),
                    }))
                  }
                  className="min-h-[38px] rounded-lg border px-2.5 text-xs font-mono"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                >
                  {discoveredMetadataKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <select
                  value={cond.operator}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      conditions: q.conditions.map((c) =>
                        c.id === cond.id ? { ...c, operator: e.target.value as QueryOperator } : c
                      ),
                    }))
                  }
                  className="min-h-[38px] rounded-lg border px-2.5 text-xs"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="gte">&gt;=</option>
                  <option value="lte">&lt;=</option>
                  <option value="is_empty">is empty</option>
                </select>
                {cond.operator !== 'is_empty' && (
                  <input
                    type="text"
                    value={cond.value}
                    onChange={(e) =>
                      setQuery((q) => ({
                        ...q,
                        conditions: q.conditions.map((c) =>
                          c.id === cond.id ? { ...c, value: e.target.value } : c
                        ),
                      }))
                    }
                    placeholder="Value..."
                    className="flex-1 min-w-[140px] min-h-[38px] rounded-lg border px-2.5 text-xs"
                    style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                  />
                )}
                <button
                  type="button"
                  onClick={() =>
                    setQuery((q) => ({
                      ...q,
                      conditions: q.conditions.filter((c) => c.id !== cond.id),
                    }))
                  }
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)', color: 'var(--fv-muted)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {query.aggregations.map((agg, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: 'var(--fv-muted)' }}>
                  Aggregate:
                </span>
                <select
                  value={agg.fn}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      aggregations: q.aggregations.map((a, i) =>
                        i === idx ? { ...a, fn: e.target.value as typeof agg.fn } : a
                      ),
                    }))
                  }
                  className="min-h-[36px] rounded-lg border px-2 text-xs font-mono"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                >
                  <option value="sum">SUM</option>
                  <option value="avg">AVG</option>
                  <option value="min">MIN</option>
                  <option value="max">MAX</option>
                  <option value="count">COUNT</option>
                </select>
                <select
                  value={agg.field}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      aggregations: q.aggregations.map((a, i) =>
                        i === idx ? { ...a, field: e.target.value } : a
                      ),
                    }))
                  }
                  className="min-h-[36px] rounded-lg border px-2 text-xs font-mono"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                >
                  {discoveredMetadataKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setQuery((q) => ({
                      ...q,
                      aggregations: q.aggregations.filter((_, i) => i !== idx),
                    }))
                  }
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border cursor-pointer"
                  style={{ borderColor: 'var(--fv-border)', color: 'var(--fv-muted)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Aggregations Summary Strip */}
        {result && (
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {result.aggregations.map((agg) => (
              <div
                key={agg.label}
                className="rounded-xl border p-3.5"
                style={{
                  backgroundColor: 'var(--fv-surface)',
                  borderColor: 'var(--fv-border)',
                }}
              >
                <div className="text-xs font-medium" style={{ color: 'var(--fv-muted)' }}>
                  {agg.label}
                </div>
                <div className="text-xl font-semibold font-mono-tabular mt-1">{agg.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Query Results Table */}
        {result && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'var(--fv-surface)',
              borderColor: 'var(--fv-border)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left tabular-nums">
                <thead>
                  <tr style={{ backgroundColor: 'var(--fv-subtle)' }}>
                    <th className="px-4 py-3 font-semibold border-b" style={{ borderColor: 'var(--fv-border)' }}>
                      Document
                    </th>
                    <th className="px-4 py-3 font-semibold border-b" style={{ borderColor: 'var(--fv-border)' }}>
                      Folder
                    </th>
                    <th className="px-4 py-3 font-semibold border-b" style={{ borderColor: 'var(--fv-border)' }}>
                      Tags
                    </th>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 font-semibold font-mono border-b"
                        style={{ borderColor: 'var(--fv-border)' }}
                      >
                        {col}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold border-b" style={{ borderColor: 'var(--fv-border)' }}>
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + result.columns.length}
                        className="px-4 py-8 text-center"
                        style={{ color: 'var(--fv-muted)' }}
                      >
                        No documents matched your query criteria.
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row) => (
                      <tr
                        key={row.note.id}
                        className="border-b last:border-b-0 hover:opacity-85"
                        style={{ borderColor: 'var(--fv-border)' }}
                      >
                        <td className="px-4 py-3 font-medium">
                          <button
                            type="button"
                            onClick={() => onOpenNote(row.note.id)}
                            className="underline underline-offset-2 cursor-pointer text-left"
                            style={{ color: 'var(--fv-accent)' }}
                          >
                            {row.note.title}
                          </button>
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--fv-muted)' }}>
                          {row.note.folderPath}
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: 'var(--fv-muted)' }}>
                          {row.note.tags.map((t) => `#${t}`).join(' ')}
                        </td>
                        {result.columns.map((col) => (
                          <td key={col} className="px-4 py-3 font-mono">
                            {row.matchedFields[col] === undefined
                              ? '—'
                              : String(row.matchedFields[col])}
                          </td>
                        ))}
                        <td className="px-4 py-3 font-mono" style={{ color: 'var(--fv-muted)' }}>
                          {new Date(row.note.updatedAt).toISOString().slice(0, 10)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
