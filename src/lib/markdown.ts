import * as yaml from 'js-yaml';
import katex from 'katex';
import { marked } from 'marked';
import type { MetadataField, NoteContent, PluginDefinition } from '../types/vault';
import { applyPreParsePlugins } from './plugins';

export function extractWikiLinks(markdown: string): string[] {
  const links = new Set<string>();
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const target = match[1].trim();
    if (target) links.add(target);
  }
  return Array.from(links);
}

export function extractInlineTags(markdown: string): string[] {
  const tags = new Set<string>();
  // Remove fenced code blocks before scanning for #tags
  const stripped = markdown.replace(/```[\s\S]*?```/g, '');
  const regex = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(stripped)) !== null) {
    tags.add(match[1]);
  }
  return Array.from(tags);
}

export function parseYamlMarkdown(raw: string, fallbackTitle: string): {
  title: string;
  folderPath: string;
  tags: string[];
  metadata: Record<string, MetadataField>;
  body: string;
} {
  let frontmatter: Record<string, unknown> = {};
  let body = raw;

  if (raw.startsWith('---\n') || raw.startsWith('---\r\n')) {
    const endIdx = raw.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlBlock = raw.slice(4, endIdx);
      body = raw.slice(endIdx + 4).replace(/^\r?\n/, '');
      try {
        const parsed = yaml.load(yamlBlock);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch {
        // Fallback to raw body if YAML fails
      }
    }
  }

  const title =
    typeof frontmatter.title === 'string' && frontmatter.title.trim()
      ? frontmatter.title.trim()
      : fallbackTitle;
  const folderPath =
    typeof frontmatter.folder === 'string' && frontmatter.folder.trim()
      ? frontmatter.folder.trim()
      : 'Inbox';

  const fmTags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)
    : [];
  const inlineTags = extractInlineTags(body);
  const tags = Array.from(new Set([...fmTags, ...inlineTags]));

  const metadata: Record<string, MetadataField> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (k === 'title' || k === 'folder' || k === 'tags') continue;
    if (typeof v === 'boolean') {
      metadata[k] = { key: k, type: 'boolean', value: v };
    } else if (typeof v === 'number') {
      metadata[k] = { key: k, type: 'number', value: v };
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      metadata[k] = { key: k, type: 'date', value: v.slice(0, 10) };
    } else if (v !== null && v !== undefined) {
      metadata[k] = { key: k, type: 'text', value: String(v) };
    }
  }

  return { title, folderPath, tags, metadata, body };
}

export function serializeToYamlMarkdown(note: NoteContent): string {
  const fm: Record<string, unknown> = {
    title: note.title,
    folder: note.folderPath,
    tags: note.tags,
  };
  for (const field of Object.values(note.metadata)) {
    fm[field.key] = field.value;
  }
  const yamlText = yaml.dump(fm, { lineWidth: 100 }).trim();
  return `---\n${yamlText}\n---\n\n${note.body}`;
}

// Spreadsheet Formula Evaluator inside Markdown tables
function colLettersToIndex(letters: string): number {
  let idx = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return {
    col: colLettersToIndex(m[1]),
    row: parseInt(m[2], 10) - 1, // 1-based row index in table (Row 1 = header, Row 2 = first data row)
  };
}

export function evaluateTableFormulas(grid: string[][]): {
  raw: string;
  computed: string;
  isFormula: boolean;
  error?: string;
}[][] {
  const memo = new Map<string, string>();
  const visiting = new Set<string>();

  const evalCell = (r: number, c: number): string => {
    if (r < 0 || r >= grid.length || c < 0 || c >= (grid[r]?.length ?? 0)) return '0';
    const key = `${r}:${c}`;
    if (memo.has(key)) return memo.get(key)!;
    if (visiting.has(key)) return '#CYCLE!';

    const raw = (grid[r][c] ?? '').trim();
    if (!raw.startsWith('=')) {
      memo.set(key, raw);
      return raw;
    }

    visiting.add(key);
    try {
      const expr = raw.slice(1).trim();
      const value = evalFormulaExpr(expr);
      memo.set(key, value);
      visiting.delete(key);
      return value;
    } catch {
      visiting.delete(key);
      return '#ERR';
    }
  };

  const getNumericValuesInRange = (rangeStr: string): number[] => {
    const [startStr, endStr] = rangeStr.split(':');
    const start = parseCellRef(startStr);
    const end = endStr ? parseCellRef(endStr) : start;
    if (!start || !end) return [];
    const nums: number[] = [];
    const rMin = Math.min(start.row, end.row);
    const rMax = Math.max(start.row, end.row);
    const cMin = Math.min(start.col, end.col);
    const cMax = Math.max(start.col, end.col);
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const val = parseFloat(evalCell(r, c).replace(/[$,%]/g, ''));
        if (!Number.isNaN(val)) nums.push(val);
      }
    }
    return nums;
  };

  const evalFormulaExpr = (expr: string): string => {
    // Handle IF(cond, trueVal, falseVal)
    const ifMatch = /^IF\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i.exec(expr);
    if (ifMatch) {
      const condStr = replaceRefs(ifMatch[1]);
      const condMatch = /^\s*(-?\d+(?:\.\d+)?)\s*(>=|<=|!=|=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(condStr);
      let condResult = false;
      if (condMatch) {
        const lhs = parseFloat(condMatch[1]);
        const op = condMatch[2];
        const rhs = parseFloat(condMatch[3]);
        if (op === '>') condResult = lhs > rhs;
        else if (op === '<') condResult = lhs < rhs;
        else if (op === '>=') condResult = lhs >= rhs;
        else if (op === '<=') condResult = lhs <= rhs;
        else if (op === '=' ) condResult = lhs === rhs;
        else if (op === '!=') condResult = lhs !== rhs;
      }
      const chosen = (condResult ? ifMatch[2] : ifMatch[3]).trim();
      return chosen.replace(/^["']|["']$/g, '');
    }

    // Handle aggregate functions: SUM, AVG, MIN, MAX, COUNT
    const replacedFuncs = expr.replace(
      /\b(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\(([^)]+)\)/gi,
      (_m, fnName: string, args: string) => {
        const parts = args.split(',');
        const values: number[] = [];
        for (const part of parts) {
          if (part.includes(':')) {
            values.push(...getNumericValuesInRange(part));
          } else {
            const ref = parseCellRef(part);
            if (ref) {
              const v = parseFloat(evalCell(ref.row, ref.col).replace(/[$,%]/g, ''));
              if (!Number.isNaN(v)) values.push(v);
            } else {
              const n = parseFloat(part.trim());
              if (!Number.isNaN(n)) values.push(n);
            }
          }
        }
        const fn = fnName.toUpperCase();
        if (fn === 'COUNT') return String(values.length);
        if (values.length === 0) return '0';
        if (fn === 'SUM') return String(values.reduce((a, b) => a + b, 0));
        if (fn === 'AVG' || fn === 'AVERAGE') {
          return String(values.reduce((a, b) => a + b, 0) / values.length);
        }
        if (fn === 'MIN') return String(Math.min(...values));
        if (fn === 'MAX') return String(Math.max(...values));
        return '0';
      }
    );

    const arithmetic = replaceRefs(replacedFuncs);
    // Safe arithmetic evaluator (digits, operators, parens, whitespace, decimal points only)
    if (/^[0-9+\-*/().\s]+$/.test(arithmetic)) {
      const val = Function(`"use strict"; return (${arithmetic});`)();
      if (typeof val === 'number' && Number.isFinite(val)) {
        return Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.00$/, '');
      }
    }
    return arithmetic;
  };

  const replaceRefs = (expr: string): string => {
    return expr.replace(/\b([A-Za-z]+)(\d+)\b/g, (full, colStr: string, rowStr: string) => {
      const ref = parseCellRef(`${colStr}${rowStr}`);
      if (!ref) return full;
      const cellVal = evalCell(ref.row, ref.col).replace(/[$,%]/g, '');
      const num = parseFloat(cellVal);
      return Number.isNaN(num) ? '0' : String(num);
    });
  };

  return grid.map((row, r) =>
    row.map((cell, c) => {
      const raw = cell.trim();
      const isFormula = raw.startsWith('=');
      if (!isFormula) {
        return { raw, computed: raw, isFormula: false };
      }
      const computed = evalCell(r, c);
      return {
        raw,
        computed,
        isFormula: true,
        error: computed.startsWith('#') ? computed : undefined,
      };
    })
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTableBlockWithFormulas(tableLines: string[]): string {
  const parseRow = (line: string): string[] => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((c) => c.trim());
  };

  if (tableLines.length < 2) return tableLines.join('\n');
  const headers = parseRow(tableLines[0]);
  // tableLines[1] is separator | --- | --- |
  const dataRows = tableLines.slice(2).map(parseRow);
  const fullGrid = [headers, ...dataRows];
  const evaluated = evaluateTableFormulas(fullGrid);

  let html = '<table><thead><tr>';
  evaluated[0].forEach((cell) => {
    html += `<th>${escapeHtml(cell.computed)}</th>`;
  });
  html += '</tr></thead><tbody>';
  for (let r = 1; r < evaluated.length; r++) {
    html += '<tr>';
    evaluated[r].forEach((cell) => {
      if (cell.isFormula) {
        html += `<td class="fv-formula-cell" title="Formula: ${escapeHtml(cell.raw)}">${escapeHtml(
          cell.computed
        )}</td>`;
      } else {
        html += `<td>${marked.parseInline(cell.computed) as string}</td>`;
      }
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderKanbanHtml(blockBody: string): string {
  const lines = blockBody.split('\n');
  const columns: { title: string; cards: string[] }[] = [];
  let current: { title: string; cards: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      current = { title: trimmed.slice(3).trim(), cards: [] };
      columns.push(current);
    } else if ((trimmed.startsWith('- ') || trimmed.startsWith('* ')) && current) {
      current.cards.push(trimmed.slice(2).trim());
    }
  }

  if (columns.length === 0) {
    return `<pre><code>${escapeHtml(blockBody)}</code></pre>`;
  }

  return `<div class="fv-kanban">${columns
    .map(
      (col) =>
        `<div class="fv-kanban-col"><h4>${escapeHtml(col.title)}</h4>${col.cards
          .map((card) => `<div class="fv-kanban-card">${escapeHtml(card)}</div>`)
          .join('')}</div>`
    )
    .join('')}</div>`;
}

export function renderMarkdownToHtml(
  rawMarkdown: string,
  note: NoteContent | null,
  plugins: PluginDefinition[]
): string {
  const calloutEnabled = plugins.some((p) => p.hookType === 'callout-blocks' && p.enabled);
  const kanbanEnabled = plugins.some((p) => p.hookType === 'kanban-board' && p.enabled);
  const footnotesEnabled = plugins.some((p) => p.hookType === 'citation-footnotes' && p.enabled);

  let text = applyPreParsePlugins(rawMarkdown, note, plugins);

  // Extract fenced blocks (kanban & math) before inline transforms
  const placeholders: { token: string; html: string }[] = [];
  const addPlaceholder = (html: string): string => {
    const token = `<!--FV_PLACEHOLDER_${placeholders.length}-->`;
    placeholders.push({ token, html });
    return token;
  };

  if (kanbanEnabled) {
    text = text.replace(/```kanban\n([\s\S]*?)```/g, (_m, body: string) => {
      return addPlaceholder(renderKanbanHtml(body));
    });
  }

  // Block LaTeX $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    try {
      const rendered = katex.renderToString(tex.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      return addPlaceholder(`<div class="my-4 overflow-x-auto">${rendered}</div>`);
    } catch {
      return addPlaceholder(`<pre><code>${escapeHtml(tex)}</code></pre>`);
    }
  });

  // Inline LaTeX $...$ (outside code blocks)
  text = text.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_m, prefix: string, tex: string) => {
    try {
      const rendered = katex.renderToString(tex.trim(), {
        displayMode: false,
        throwOnError: false,
      });
      return `${prefix}${addPlaceholder(rendered)}`;
    } catch {
      return `${prefix}$${tex}$`;
    }
  });

  // Evaluate Markdown tables containing formulas
  const lines = text.split('\n');
  const processedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s:-]+\|/.test(lines[i + 1])
    ) {
      const tableLines = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }
      processedLines.push(addPlaceholder(renderTableBlockWithFormulas(tableLines)));
      i = j - 1;
    } else {
      processedLines.push(line);
    }
  }
  text = processedLines.join('\n');

  // Callout blocks: > [!TYPE]
  if (calloutEnabled) {
    text = text.replace(
      /(?:^|\n)((?:> ?\[!(NOTE|TIP|WARNING|IMPORTANT)\][^\n]*\n(?:> ?[^\n]*\n?)*))/gi,
      (_m, block: string, kind: string) => {
        const bodyLines = block
          .trim()
          .split('\n')
          .slice(1)
          .map((l) => l.replace(/^>\s?/, ''))
          .join('\n');
        const inner = marked.parse(bodyLines) as string;
        return `\n${addPlaceholder(
          `<div class="fv-callout"><div class="fv-callout-title">${escapeHtml(
            kind.toUpperCase()
          )}</div>${inner}</div>`
        )}\n`;
      }
    );
  }

  // Wiki-links [[Target]] or [[Target|Alias]]
  text = text.replace(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) => {
      const cleanTarget = target.trim();
      const label = (alias ?? cleanTarget).trim();
      return addPlaceholder(
        `<a class="fv-wikilink" data-wikilink="${escapeHtml(cleanTarget)}">${escapeHtml(label)}</a>`
      );
    }
  );

  // Inline #tags (avoid headings # Title)
  text = text.replace(/(^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)/g, (_m, lead: string, tag: string) => {
    return `${lead}${addPlaceholder(`<span class="fv-tag-inline">#${escapeHtml(tag)}</span>`)}`;
  });

  // Footnote references if plugin enabled
  if (footnotesEnabled) {
    text = text.replace(/\[\^([a-zA-Z0-9_-]+)\](?!:)/g, (_m, ref: string) => {
      return addPlaceholder(
        `<sup class="text-xs font-mono" style="color:var(--fv-accent)">[${escapeHtml(ref)}]</sup>`
      );
    });
  }

  let html = marked.parse(text, { gfm: true, breaks: true }) as string;

  // Restore placeholders (run two passes in case placeholders were nested)
  for (let pass = 0; pass < 2; pass++) {
    for (const ph of placeholders) {
      html = html.replace(ph.token, ph.html);
    }
  }

  return html;
}
