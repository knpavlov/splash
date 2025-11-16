import { ChangeEvent, Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import styles from '../../styles/FinancialsScreen.module.css';
import {
  buildMonthColumns,
  createDefaultBlueprint,
  FinancialAggregationMode,
  FinancialLineItem,
  MAX_INDENT_LEVEL,
  MAX_MONTH_COUNT,
  MIN_MONTH_COUNT
} from './financialModel';
import { pnlCategories, type PnlCategory } from '../../shared/types/initiative';
import { generateId } from '../../shared/ui/generateId';

type ImportStatus = { type: 'success' | 'error'; message: string } | null;

interface VisibleLine {
  line: FinancialLineItem;
  index: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

const STORAGE_KEY = 'financials.blueprint.v1';
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

const aggregationLabels: Record<FinancialAggregationMode, string> = {
  manual: 'Manual entry',
  children: 'Roll up direct children',
  cumulative: 'Running subtotal'
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const clampIndent = (value: number) => Math.max(0, Math.min(MAX_INDENT_LEVEL, Math.floor(value)));

const buildEmptyRecord = (monthKeys: string[]) =>
  monthKeys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<string, number>);

const normalizeMonths = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => MONTH_KEY_PATTERN.test(key))
    .reduce((acc, [key, raw]) => {
      const numeric = Number(raw);
      acc[key] = Number.isFinite(numeric) ? numeric : 0;
      return acc;
    }, {} as Record<string, number>);
};

const isPnlCategory = (value: string): value is PnlCategory =>
  pnlCategories.includes(value as PnlCategory);

const sanitizeLine = (input: Partial<FinancialLineItem>): FinancialLineItem => {
  const fallback = generateId();
  const codeSource = typeof input.code === 'string' && input.code.trim() ? input.code : fallback.slice(0, 8);
  const sanitizedAggregation: FinancialAggregationMode =
    input.aggregation === 'children' || input.aggregation === 'cumulative' ? input.aggregation : 'manual';
  const normalizedNature =
    input.nature === 'cost' ? 'cost' : input.nature === 'summary' ? 'summary' : 'revenue';
  const derivedNature = sanitizedAggregation === 'manual' ? normalizedNature : 'summary';
  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : fallback,
    code: codeSource.trim().replace(/\s+/g, '_').toUpperCase(),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Untitled line',
    indent: clampIndent(Number(input.indent) || 0),
    nature: derivedNature,
    aggregation: sanitizedAggregation,
    category: typeof input.category === 'string' && isPnlCategory(input.category) ? input.category : '',
    notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : undefined,
    months: normalizeMonths(input.months)
  };
};

const sanitizeBlueprint = (source: unknown) => {
  const fallback = createDefaultBlueprint();
  if (!source || typeof source !== 'object') {
    return fallback;
  }
  const raw = source as Record<string, unknown>;
  const start =
    typeof raw.startMonth === 'string' && MONTH_KEY_PATTERN.test(raw.startMonth)
      ? raw.startMonth
      : fallback.startMonth;
  const countCandidate = Number(raw.monthCount);
  const count = Number.isFinite(countCandidate) ? countCandidate : fallback.monthCount;
  const rawLines = Array.isArray(raw.lines) ? raw.lines : fallback.lines;
  const lines = rawLines.map((line) => sanitizeLine(line));
  return {
    startMonth: start,
    monthCount: Math.max(MIN_MONTH_COUNT, Math.min(MAX_MONTH_COUNT, Math.floor(count))),
    lines
  };
};

const loadStoredBlueprint = () => {
  if (typeof window === 'undefined') {
    return createDefaultBlueprint();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultBlueprint();
    }
    return sanitizeBlueprint(JSON.parse(raw));
  } catch (error) {
    console.error('Unable to parse stored financial blueprint:', error);
    return createDefaultBlueprint();
  }
};

const buildParentMap = (lines: FinancialLineItem[]) => {
  const stack: { id: string; indent: number }[] = [];
  const map = new Map<string, string | null>();
  lines.forEach((line) => {
    while (stack.length && stack[stack.length - 1].indent >= line.indent) {
      stack.pop();
    }
    const parent = stack.length ? stack[stack.length - 1].id : null;
    map.set(line.id, parent);
    stack.push({ id: line.id, indent: line.indent });
  });
  return map;
};

const buildChildMap = (lines: FinancialLineItem[], parents: Map<string, string | null>) => {
  const map = new Map<string, string[]>();
  lines.forEach((line) => {
    const parent = parents.get(line.id);
    if (!parent) {
      return;
    }
    if (!map.has(parent)) {
      map.set(parent, []);
    }
    map.get(parent)!.push(line.id);
  });
  return map;
};

const resolveLineValues = (
  lines: FinancialLineItem[],
  monthKeys: string[],
  childMap: Map<string, string[]>,
  indexMap: Map<string, number>
) => {
  const memo = new Map<string, Record<string, number>>();
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const sumRecords = (records: Record<string, number>[]) => {
    if (!records.length) {
      return buildEmptyRecord(monthKeys);
    }
    const totals = buildEmptyRecord(monthKeys);
    for (const key of monthKeys) {
      totals[key] = records.reduce((acc, record) => acc + (record[key] ?? 0), 0);
    }
    return totals;
  };

  const resolve = (line: FinancialLineItem): Record<string, number> => {
    if (memo.has(line.id)) {
      return memo.get(line.id)!;
    }
    let values: Record<string, number>;
    if (line.aggregation === 'manual') {
      values = monthKeys.reduce((acc, key) => {
        const numeric = Number(line.months[key]);
        acc[key] = Number.isFinite(numeric) ? numeric : 0;
        return acc;
      }, {} as Record<string, number>);
    } else if (line.aggregation === 'children') {
      const children = (childMap.get(line.id) ?? [])
        .map((childId) => lineById.get(childId))
        .filter(Boolean) as FinancialLineItem[];
      values = children.length ? sumRecords(children.map((child) => resolve(child))) : buildEmptyRecord(monthKeys);
    } else {
      const index = indexMap.get(line.id) ?? 0;
      const scope = lines.slice(0, index).filter((candidate) => candidate.aggregation !== 'cumulative');
      values = scope.length ? sumRecords(scope.map((candidate) => resolve(candidate))) : buildEmptyRecord(monthKeys);
    }
    memo.set(line.id, values);
    return values;
  };

  lines.forEach((line) => resolve(line));
  return memo;
};

const buildVisibleLines = (
  lines: FinancialLineItem[],
  childMap: Map<string, string[]>,
  collapsedIds: Set<string>
): VisibleLine[] => {
  const visible: VisibleLine[] = [];
  let hiddenIndent: number | null = null;
  lines.forEach((line, index) => {
    if (hiddenIndent !== null) {
      if (line.indent > hiddenIndent) {
        return;
      }
      hiddenIndent = null;
    }
    const hasChildren = (childMap.get(line.id)?.length ?? 0) > 0;
    const isCollapsed = hasChildren && collapsedIds.has(line.id);
    visible.push({ line, index, hasChildren, isCollapsed });
    if (isCollapsed) {
      hiddenIndent = line.indent;
    }
  });
  return visible;
};

const guessAggregation = (value: string): FinancialAggregationMode => {
  const lower = value.toLowerCase();
  if (lower.includes('child')) {
    return 'children';
  }
  if (lower.includes('cumulative') || lower.includes('subtotal') || lower.includes('rolling')) {
    return 'cumulative';
  }
  return 'manual';
};

const guessNature = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.includes('cost')) {
    return 'cost';
  }
  if (lower.includes('summary') || lower.includes('subtotal')) {
    return 'summary';
  }
  return 'revenue';
};

const parseNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

export const FinancialsScreen = () => {
  const initialBlueprint = useMemo(() => loadStoredBlueprint(), []);
  const [lines, setLines] = useState<FinancialLineItem[]>(initialBlueprint.lines);
  const [startMonth, setStartMonth] = useState(initialBlueprint.startMonth);
  const [monthCount, setMonthCount] = useState(initialBlueprint.monthCount);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);

  const monthColumns = useMemo(() => buildMonthColumns(startMonth, monthCount), [startMonth, monthCount]);
  const monthKeys = monthColumns.map((column) => column.key);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          startMonth,
          monthCount,
          lines
        })
      );
    } catch (error) {
      console.warn('Unable to persist financial blueprint locally:', error);
    }
  }, [startMonth, monthCount, lines]);

  const parentMap = useMemo(() => buildParentMap(lines), [lines]);
  const childMap = useMemo(() => buildChildMap(lines, parentMap), [lines, parentMap]);
  const lineIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((line, index) => map.set(line.id, index));
    return map;
  }, [lines]);
  const valueMap = useMemo(
    () => resolveLineValues(lines, monthKeys, childMap, lineIndexMap),
    [lines, monthKeys, childMap, lineIndexMap]
  );
  const visibleLines = useMemo(() => buildVisibleLines(lines, childMap, collapsed), [lines, childMap, collapsed]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateLine = (id: string, updater: (line: FinancialLineItem) => FinancialLineItem) => {
    setLines((current) => current.map((line) => (line.id === id ? updater(line) : line)));
  };

  const handleNameChange = (id: string, value: string) => {
    updateLine(id, (line) => ({ ...line, name: value }));
  };

  const handleCodeChange = (id: string, value: string) => {
    updateLine(id, (line) => ({ ...line, code: value.trim().replace(/\s+/g, '_').toUpperCase() }));
  };

  const handleNatureChange = (id: string, value: FinancialLineItem['nature']) => {
    updateLine(id, (line) => {
      if (line.aggregation !== 'manual') {
        return { ...line, nature: 'summary' };
      }
      if (value === 'summary') {
        return { ...line, nature: 'revenue' };
      }
      return { ...line, nature: value };
    });
  };

  const handleAggregationChange = (id: string, aggregation: FinancialAggregationMode) => {
    updateLine(id, (line) => {
      if (aggregation === 'manual') {
        const fallbackNature = line.nature === 'summary' ? 'revenue' : line.nature;
        return { ...line, aggregation, nature: fallbackNature };
      }
      return { ...line, aggregation, nature: 'summary' };
    });
  };

  const handleCategoryChange = (id: string, category: string) => {
    const normalized = isPnlCategory(category) ? category : '';
    updateLine(id, (line) => ({ ...line, category: normalized }));
  };

  const handleIndentChange = (id: string, delta: number) => {
    setLines((current) => {
      const next = [...current];
      const index = next.findIndex((line) => line.id === id);
      if (index === -1) {
        return current;
      }
      const prevIndent = index === 0 ? 0 : next[index - 1].indent;
      const targetIndent =
        delta > 0 ? Math.min(prevIndent + 1, clampIndent(next[index].indent + delta)) : clampIndent(next[index].indent + delta);
      next[index] = { ...next[index], indent: targetIndent };
      return next;
    });
  };

  const handleMove = (id: string, direction: -1 | 1) => {
    setLines((current) => {
      const index = current.findIndex((line) => line.id === id);
      if (index === -1) {
        return current;
      }
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [line] = next.splice(index, 1);
      next.splice(targetIndex, 0, line);
      return next;
    });
  };

  const handleRemove = (id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));
    setCollapsed((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleValueChange = (id: string, monthKey: string, rawValue: string) => {
    updateLine(id, (line) => {
      if (line.aggregation !== 'manual') {
        return line;
      }
      const nextMonths = { ...line.months };
      if (!rawValue.trim()) {
        delete nextMonths[monthKey];
        return { ...line, months: nextMonths };
      }
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        return line;
      }
      nextMonths[monthKey] = numeric;
      return { ...line, months: nextMonths };
    });
  };

  const addLine = (nature: 'revenue' | 'cost') => {
    const seq = lines.length + 1;
    const codePrefix = nature === 'revenue' ? 'REV' : 'COST';
    setLines((current) => [
      ...current,
      {
        id: generateId(),
        code: `${codePrefix}_${seq}`,
        name: nature === 'revenue' ? 'New revenue line' : 'New cost line',
        indent: 0,
        nature,
        aggregation: 'manual',
        category: nature === 'revenue' ? pnlCategories[0] : '',
        months: {}
      }
    ]);
  };

  const addSubtotal = () => {
    setLines((current) => [
      ...current,
      {
        id: generateId(),
        code: `TOTAL_${current.length + 1}`,
        name: 'New subtotal',
        indent: 0,
        nature: 'summary',
        aggregation: 'cumulative',
        category: '',
        months: {}
      }
    ]);
  };

  const resetBlueprint = () => {
    const defaults = createDefaultBlueprint();
    setLines(defaults.lines);
    setStartMonth(defaults.startMonth);
    setMonthCount(defaults.monthCount);
    setCollapsed(new Set());
    setImportStatus(null);
  };

  const netSummaryLine = useMemo(
    () => [...lines].reverse().find((line) => line.aggregation === 'cumulative'),
    [lines]
  );
  const netValues = netSummaryLine ? valueMap.get(netSummaryLine.id) : undefined;

  const netTotals = useMemo(() => {
    if (!netValues) {
      return null;
    }
    const totals = { horizon: 0, trailing12: 0, lastMonth: 0 };
    const monthKeysAsc = [...monthKeys];
    monthKeysAsc.forEach((key, index) => {
      const value = netValues[key] ?? 0;
      totals.horizon += value;
      if (index >= monthKeysAsc.length - 12) {
        totals.trailing12 += value;
      }
      if (index === monthKeysAsc.length - 1) {
        totals.lastMonth = value;
      }
    });
    return totals;
  }, [netValues, monthKeys]);

  const warnings = useMemo(() => {
    const issues: string[] = [];
    const manualLines = lines.filter((line) => line.aggregation === 'manual');
    const missingCategories = manualLines.filter((line) => !line.category);
    if (missingCategories.length) {
      issues.push(`${missingCategories.length} manual lines do not have a linked P&L category yet.`);
    }
    const codeUsage = new Map<string, number>();
    lines.forEach((line) => {
      const code = line.code.trim();
      codeUsage.set(code, (codeUsage.get(code) ?? 0) + 1);
    });
    const duplicateCodes = Array.from(codeUsage.entries())
      .filter(([, count]) => count > 1)
      .map(([code]) => code);
    if (duplicateCodes.length) {
      issues.push(`Duplicate codes detected: ${duplicateCodes.slice(0, 5).join(', ')}.`);
    }
    lines.forEach((line, index) => {
      if (index === 0) {
        return;
      }
      if (line.indent - lines[index - 1].indent > 1) {
        issues.push(`Line "${line.name}" skips hierarchy levels. Use indent controls to nest gradually.`);
      }
    });
    const orphanRollups = lines.filter(
      (line) => line.aggregation === 'children' && (childMap.get(line.id)?.length ?? 0) === 0
    );
    if (orphanRollups.length) {
      issues.push(`${orphanRollups.length} roll-up lines have no children and therefore always show zero.`);
    }
    return issues;
  }, [lines, childMap]);

  const mappingStats = useMemo(() => {
    const manualLines = lines.filter((line) => line.aggregation === 'manual');
    const linked = manualLines.filter((line) => Boolean(line.category));
    return {
      total: manualLines.length,
      linked: linked.length,
      coverage: manualLines.length ? Math.round((linked.length / manualLines.length) * 100) : 0
    };
  }, [lines]);

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    const rows = lines.map((line) => {
      const resolved = valueMap.get(line.id) ?? buildEmptyRecord(monthKeys);
      const row: Record<string, string | number> = {
        'Line ID': line.id,
        Code: line.code,
        'Line name': line.name,
        Nature: line.nature,
        Aggregation: aggregationLabels[line.aggregation],
        Indent: line.indent,
        Category: line.category,
        Notes: line.notes ?? ''
      };
      monthKeys.forEach((key) => {
        row[key] = resolved[key] ?? 0;
      });
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Blueprint');
    XLSX.writeFile(workbook, 'financials-blueprint.xlsx');
  };

  const downloadTemplate = () => {
    const defaults = createDefaultBlueprint();
    const templateMonths = buildMonthColumns(defaults.startMonth, defaults.monthCount).map((column) => column.key);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      defaults.lines.map((line) => {
        const row: Record<string, string | number> = {
          'Line ID': line.id,
          Code: line.code,
          'Line name': line.name,
          Nature: line.nature,
          Aggregation: aggregationLabels[line.aggregation],
          Indent: line.indent,
          Category: line.category,
          Notes: ''
        };
        templateMonths.forEach((key) => {
          row[key] = 0;
        });
        return row;
      })
    );
    XLSX.utils.book_append_sheet(workbook, sheet, 'Blueprint');
    XLSX.writeFile(workbook, 'financials-template.xlsx');
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        throw new Error('No worksheets detected in the file.');
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) {
        throw new Error('The sheet is empty.');
      }
      const columnKeys = Object.keys(rows[0]);
      const monthColumnsInSheet = columnKeys.filter((key) => MONTH_KEY_PATTERN.test(key)).sort();
      const parsedLines: FinancialLineItem[] = rows.map((row, index) => {
        const aggregation = guessAggregation(String(row.Aggregation ?? row.aggregation ?? ''));
        const rawNature = guessNature(String(row.Nature ?? row.nature ?? ''));
        const sanitizedNature = aggregation === 'manual' ? rawNature : 'summary';
        const months = monthColumnsInSheet.reduce((acc, key) => {
          const numeric = parseNumber(row[key]);
          if (typeof numeric === 'number') {
            acc[key] = numeric;
          }
          return acc;
        }, {} as Record<string, number>);
        const rawCategory = typeof row.Category === 'string' ? row.Category.trim() : '';
        const categoryValue: PnlCategory | '' = isPnlCategory(rawCategory) ? rawCategory : '';
        return {
          id:
            (typeof row['Line ID'] === 'string' && row['Line ID'].trim()) ||
            (typeof row.id === 'string' && row.id.trim()) ||
            generateId(),
          code:
            (typeof row.Code === 'string' && row.Code.trim().replace(/\s+/g, '_').toUpperCase()) ||
            `LINE_${index + 1}`,
          name:
            (typeof row['Line name'] === 'string' && row['Line name'].trim()) ||
            (typeof row.name === 'string' && row.name.trim()) ||
            `Line ${index + 1}`,
          indent: clampIndent(Number(row.Indent ?? row.indent) || 0),
          aggregation,
          nature: sanitizedNature as FinancialLineItem['nature'],
          category: categoryValue,
          notes: typeof row.Notes === 'string' && row.Notes.trim() ? row.Notes.trim() : undefined,
          months
        };
      });
      setLines(parsedLines);
      if (monthColumnsInSheet.length) {
        setStartMonth(monthColumnsInSheet[0]);
        setMonthCount(Math.max(MIN_MONTH_COUNT, Math.min(MAX_MONTH_COUNT, monthColumnsInSheet.length)));
      }
      setCollapsed(new Set());
      setImportStatus({ type: 'success', message: 'Data imported from Excel successfully.' });
    } catch (error) {
      console.error('Failed to import blueprint:', error);
      setImportStatus({
        type: 'error',
        message: 'Unable to import the file. Please verify the template structure and try again.'
      });
    } finally {
      event.target.value = '';
    }
  };

  const importStatusNode = importStatus && (
    <p className={importStatus.type === 'success' ? styles.successText : styles.errorText}>{importStatus.message}</p>
  );

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>Financials</h1>
          <p className={styles.subtitle}>
            Define the P&amp;L blueprint once, control monthly values, and keep dashboards and initiative editors in sync.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} onClick={downloadTemplate} type="button">
            Download template
          </button>
          <button className={styles.secondaryButton} onClick={exportWorkbook} type="button">
            Export current model
          </button>
          <label className={styles.importButton}>
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} />
            Import from Excel
          </label>
        </div>
      </header>

      <div className={styles.controlsBar}>
        <div className={styles.timelineControls}>
          <label>
            <span>Start month</span>
            <input
              type="month"
              value={startMonth}
              onChange={(event) => {
                if (MONTH_KEY_PATTERN.test(event.target.value)) {
                  setStartMonth(event.target.value);
                }
              }}
            />
          </label>
          <label>
            <span>Horizon</span>
            <select
              value={monthCount}
              onChange={(event) => setMonthCount(Math.max(MIN_MONTH_COUNT, Number(event.target.value)))}
            >
              {[24, 30, 36, 42, 48].map((value) => (
                <option key={value} value={value}>
                  {value} months
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.lineButtons}>
          <button className={styles.primaryButton} onClick={() => addLine('revenue')} type="button">
            + Revenue line
          </button>
          <button className={styles.primaryButton} onClick={() => addLine('cost')} type="button">
            + Cost line
          </button>
          <button className={styles.primaryButton} onClick={addSubtotal} type="button">
            + Subtotal
          </button>
          <button className={styles.ghostButton} onClick={resetBlueprint} type="button">
            Reset to curated template
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.sheetPanel}>
          <div className={styles.sheetScroller}>
            <table className={styles.blueprintTable}>
              <thead>
                <tr>
                  <th className={styles.lineColumn}>Line item</th>
                  <th className={styles.natureColumn}>Nature</th>
                  <th className={styles.categoryColumn}>P&amp;L category link</th>
                  <th className={styles.aggregationColumn}>Aggregation</th>
                  {monthColumns.map((month) => (
                    <th key={month.key} className={styles.monthColumn}>
                      <span>{month.label}</span>
                      <small>{month.year}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleLines.length === 0 ? (
                  <tr>
                    <td colSpan={4 + monthColumns.length} className={styles.emptyCell}>
                      No lines yet. Use the buttons above to add revenue, cost, or subtotal rows.
                    </td>
                  </tr>
                ) : (
                  visibleLines.map(({ line, index, hasChildren, isCollapsed }) => {
                    const resolved = valueMap.get(line.id) ?? buildEmptyRecord(monthKeys);
                    return (
                      <Fragment key={line.id}>
                        <tr className={line.aggregation !== 'manual' ? styles.summaryRow : undefined}>
                          <td className={styles.lineColumn}>
                            <div className={styles.lineCell} style={{ marginLeft: `${line.indent * 16}px` }}>
                              {hasChildren && (
                                <button
                                  className={styles.collapseButton}
                                  onClick={() => toggleCollapse(line.id)}
                                  type="button"
                                  aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                                >
                                  {isCollapsed ? '▸' : '▾'}
                                </button>
                              )}
                              {!hasChildren && line.indent > 0 && <span className={styles.placeholderIcon} />}
                              <div className={styles.lineInputs}>
                                <input
                                  className={styles.nameInput}
                                  value={line.name}
                                  onChange={(event) => handleNameChange(line.id, event.target.value)}
                                />
                                <div className={styles.metaRow}>
                                  <input
                                    className={styles.codeInput}
                                    value={line.code}
                                    onChange={(event) => handleCodeChange(line.id, event.target.value)}
                                  />
                                  <div className={styles.rowActions}>
                                    <button
                                      type="button"
                                      onClick={() => handleIndentChange(line.id, -1)}
                                      disabled={line.indent === 0}
                                    >
                                      ◂
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleIndentChange(line.id, 1)}
                                      disabled={index === 0}
                                    >
                                      ▸
                                    </button>
                                    <button type="button" onClick={() => handleMove(line.id, -1)} disabled={index === 0}>
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMove(line.id, 1)}
                                      disabled={index === lines.length - 1}
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemove(line.id)}
                                      className={styles.removeButton}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <select
                              value={line.nature}
                              onChange={(event) => handleNatureChange(line.id, event.target.value as FinancialLineItem['nature'])}
                              disabled={line.aggregation !== 'manual'}
                            >
                              <option value="revenue">Revenue</option>
                              <option value="cost">Cost</option>
                              <option value="summary" disabled>
                                Subtotal / summary
                              </option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={line.category}
                              onChange={(event) => handleCategoryChange(line.id, event.target.value)}
                              disabled={line.aggregation !== 'manual'}
                            >
                              <option value="">Not linked</option>
                              {pnlCategories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={line.aggregation}
                              onChange={(event) =>
                                handleAggregationChange(line.id, event.target.value as FinancialAggregationMode)
                              }
                            >
                              {Object.entries(aggregationLabels).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          {monthColumns.map((month) => (
                            <td key={`${line.id}-${month.key}`}>
                              {line.aggregation === 'manual' ? (
                                <input
                                  type="number"
                                  value={line.months[month.key] === undefined ? '' : String(line.months[month.key] ?? '')}
                                  onChange={(event) => handleValueChange(line.id, month.key, event.target.value)}
                                />
                              ) : (
                                <span className={styles.valueReadonly}>{formatCurrency(resolved[month.key] ?? 0)}</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {importStatusNode}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <h3>Quality guardrails</h3>
            {warnings.length === 0 ? (
              <p className={styles.successText}>Everything looks consistent.</p>
            ) : (
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.sidebarCard}>
            <h3>Linking to initiatives</h3>
            <p>
              Each revenue/cost line should have a unique code and a mapped P&amp;L category. When a user edits an initiative,
              these codes become the picker options so that every benefit or cost rolls up into exactly one bucket.
            </p>
            <p>
              Coverage: <strong>{mappingStats.linked}</strong> / {mappingStats.total} manual lines linked (
              {mappingStats.coverage}%).
            </p>
          </div>
          <div className={styles.sidebarCard}>
            <h3>Excel automation</h3>
            <ol>
              <li>Download the template and fill in line items, indent (hierarchy), and month values for manual rows.</li>
              <li>Keep month headers in YYYY-MM format and don&apos;t rename the first columns (Line ID, Code, etc.).</li>
              <li>Upload the finished file. Subtotals are recalculated automatically; manual rows keep the imported numbers.</li>
              <li>Use the export button to push the current model back to Excel for bulk edits or sharing.</li>
            </ol>
          </div>
          {netSummaryLine && netTotals && (
            <div className={styles.sidebarCard}>
              <h3>{netSummaryLine.name}</h3>
              <p>Last month: {formatCurrency(netTotals.lastMonth)}</p>
              <p>Next 12 months: {formatCurrency(netTotals.trailing12)}</p>
              <p>Total horizon: {formatCurrency(netTotals.horizon)}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
