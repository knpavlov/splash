
import { ChangeEvent, Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import styles from '../../styles/FinancialsScreen.module.css';
import {
  buildMonthColumns,
  createDefaultBlueprint,
  DEFAULT_MONTH_COUNT,
  MIN_MONTH_COUNT,
  MAX_MONTH_COUNT,
  MAX_INDENT_LEVEL
} from './financialModel';
import { FinancialBlueprintPayload, FinancialLineItem } from '../../shared/types/financials';
import { generateId } from '../../shared/ui/generateId';
import { useFinancialsState } from '../../app/state/AppStateContext';

type ImportStatus = { type: 'success' | 'error'; message: string } | null;

interface VisibleLine {
  line: FinancialLineItem;
  index: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  level: number;
}

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const slugifyCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `LINE_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const ensureUniqueCode = (lines: FinancialLineItem[], seed: string, currentId?: string) => {
  const normalized = seed || 'LINE';
  const taken = new Set(lines.filter((line) => line.id !== currentId).map((line) => line.code));
  if (!taken.has(normalized)) {
    return normalized;
  }
  let suffix = 2;
  while (taken.has(`${normalized}_${suffix}`)) {
    suffix += 1;
  }
  return `${normalized}_${suffix}`;
};

const clampIndent = (value: number, maxIndent: number) =>
  Math.max(0, Math.min(maxIndent, Math.floor(value)));

const lineEffect = (line: FinancialLineItem) => {
  if (line.nature === 'cost') {
    return -1;
  }
  if (line.nature === 'revenue') {
    return 1;
  }
  return 1;
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

const buildVisibleLines = (
  lines: FinancialLineItem[],
  childMap: Map<string, string[]>,
  collapsed: Set<string>
): VisibleLine[] => {
  const result: VisibleLine[] = [];
  let hiddenLevel: number | null = null;
  lines.forEach((line, index) => {
    if (hiddenLevel !== null && line.indent > hiddenLevel) {
      return;
    }
    if (hiddenLevel !== null && line.indent <= hiddenLevel) {
      hiddenLevel = null;
    }
    const hasChildren = (childMap.get(line.id)?.length ?? 0) > 0;
    const isCollapsed = hasChildren && collapsed.has(line.id);
    result.push({ line, index, hasChildren, isCollapsed, level: line.indent + 1 });
    if (isCollapsed) {
      hiddenLevel = line.indent;
    }
  });
  return result;
};
const buildEmptyRecord = (keys: string[]) =>
  keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<string, number>);

const addToRecord = (target: Record<string, number>, source: Record<string, number>) => {
  Object.keys(target).forEach((key) => {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  });
};

const buildManualValueMap = (lines: FinancialLineItem[], monthKeys: string[]) => {
  const map = new Map<string, Record<string, number>>();
  for (const line of lines) {
    if (line.computation !== 'manual') {
      continue;
    }
    const effect = lineEffect(line);
    const record = buildEmptyRecord(monthKeys);
    monthKeys.forEach((key) => {
      const numeric = Number(line.months[key]);
      record[key] = Number.isFinite(numeric) ? effect * numeric : 0;
    });
    map.set(line.id, record);
  }
  return map;
};

const buildCumulativeLookup = (
  lines: FinancialLineItem[],
  monthKeys: string[],
  manualMap: Map<string, Record<string, number>>
) => {
  const running = buildEmptyRecord(monthKeys);
  const lookup = new Map<string, Record<string, number>>();
  for (const line of lines) {
    if (line.computation === 'manual') {
      const contribution = manualMap.get(line.id) ?? buildEmptyRecord(monthKeys);
      addToRecord(running, contribution);
    }
    if (line.computation === 'cumulative') {
      lookup.set(line.id, { ...running });
    }
  }
  return lookup;
};

const buildValueMap = (
  lines: FinancialLineItem[],
  monthKeys: string[],
  childMap: Map<string, string[]>,
  manualMap: Map<string, Record<string, number>>,
  cumulativeLookup: Map<string, Record<string, number>>
) => {
  const memo = new Map<string, Record<string, number>>();
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const resolve = (line: FinancialLineItem): Record<string, number> => {
    if (memo.has(line.id)) {
      return memo.get(line.id)!;
    }
    let computed: Record<string, number>;
    if (line.computation === 'manual') {
      computed = manualMap.get(line.id) ?? buildEmptyRecord(monthKeys);
    } else if (line.computation === 'children') {
      const totals = buildEmptyRecord(monthKeys);
      const children = childMap.get(line.id) ?? [];
      for (const childId of children) {
        const child = lineById.get(childId);
        if (!child) {
          continue;
        }
        const childValue = resolve(child);
        addToRecord(totals, childValue);
      }
      computed = totals;
    } else {
      computed = cumulativeLookup.get(line.id) ?? buildEmptyRecord(monthKeys);
    }
    memo.set(line.id, computed);
    return computed;
  };

  lines.forEach((line) => resolve(line));
  return memo;
};

const toColumnLetter = (index: number) => {
  let temp = index;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};
export const FinancialsScreen = () => {
  const { blueprint, loading, error, saveBlueprint, refresh } = useFinancialsState();
  const [lines, setLines] = useState<FinancialLineItem[]>([]);
  const [startMonth, setStartMonth] = useState(createDefaultBlueprint().startMonth);
  const [monthCount, setMonthCount] = useState(DEFAULT_MONTH_COUNT);
  const [version, setVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);

  useEffect(() => {
    if (!blueprint) {
      return;
    }
    setLines(blueprint.lines);
    setStartMonth(blueprint.startMonth);
    setMonthCount(blueprint.monthCount);
    setVersion(blueprint.version);
    setDirty(false);
  }, [blueprint]);

  const monthColumns = useMemo(() => buildMonthColumns(startMonth, monthCount), [startMonth, monthCount]);
  const monthKeys = monthColumns.map((month) => month.key);

  const parentMap = useMemo(() => buildParentMap(lines), [lines]);
  const childMap = useMemo(() => buildChildMap(lines, parentMap), [lines, parentMap]);
  const manualValueMap = useMemo(() => buildManualValueMap(lines, monthKeys), [lines, monthKeys]);
  const cumulativeLookup = useMemo(
    () => buildCumulativeLookup(lines, monthKeys, manualValueMap),
    [lines, monthKeys, manualValueMap]
  );
  const valueMap = useMemo(
    () => buildValueMap(lines, monthKeys, childMap, manualValueMap, cumulativeLookup),
    [lines, monthKeys, childMap, manualValueMap, cumulativeLookup]
  );
  const visibleLines = useMemo(() => buildVisibleLines(lines, childMap, collapsed), [lines, childMap, collapsed]);

  const markDirty = () => {
    setDirty(true);
    setSaveFeedback(null);
  };

  const handleNameChange = (id: string, name: string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) {
          return line;
        }
        const previousSlug = slugifyCode(line.name);
        const hasCustomCode = line.code !== previousSlug;
        const nextName = name;
        const nextLine: FinancialLineItem = { ...line, name: nextName };
        if (!hasCustomCode) {
          const baseCode = slugifyCode(nextName);
          nextLine.code = ensureUniqueCode(current, baseCode, id);
        }
        return nextLine;
      })
    );
    markDirty();
  };

  const handleComputationChange = (id: string, computation: FinancialLineItem['computation']) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) {
          return line;
        }
        if (computation === 'manual') {
          const nature = line.nature === 'cost' ? 'cost' : 'revenue';
          return { ...line, computation, nature };
        }
        return { ...line, computation, nature: 'summary', months: {} };
      })
    );
    markDirty();
  };

  const handleNatureChange = (id: string, nature: FinancialLineItem['nature']) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) {
          return line;
        }
        if (line.computation !== 'manual') {
          return line;
        }
        return { ...line, nature: nature === 'cost' ? 'cost' : 'revenue' };
      })
    );
    markDirty();
  };

  const handleIndentChange = (id: string, delta: number) => {
    setLines((current) => {
      const next = [...current];
      const index = next.findIndex((line) => line.id === id);
      if (index === -1) {
        return current;
      }
      const prevIndent = index === 0 ? 0 : next[index - 1].indent;
      const target = delta > 0 ? Math.min(prevIndent + 1, next[index].indent + delta) : next[index].indent + delta;
      next[index] = { ...next[index], indent: clampIndent(target, MAX_INDENT_LEVEL) };
      return next;
    });
    markDirty();
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
    markDirty();
  };

  const handleDelete = (id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    markDirty();
  };

  const handleValueChange = (id: string, monthKey: string, raw: string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) {
          return line;
        }
        if (line.computation !== 'manual') {
          return line;
        }
        const nextMonths = { ...line.months };
        if (!raw.trim()) {
          delete nextMonths[monthKey];
          return { ...line, months: nextMonths };
        }
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          return line;
        }
        nextMonths[monthKey] = numeric;
        return { ...line, months: nextMonths };
      })
    );
    markDirty();
  };

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

  const addLine = () => {
    setLines((current) => {
      const baseName = 'New line item';
      const baseCode = ensureUniqueCode(current, slugifyCode(baseName));
      return [
        ...current,
        {
          id: generateId(),
          code: baseCode,
          name: baseName,
          indent: 0,
          nature: 'revenue',
          computation: 'manual',
          months: {}
        }
      ];
    });
    markDirty();
  };

  const resetToTemplate = () => {
    const defaults = createDefaultBlueprint();
    setLines(defaults.lines);
    setStartMonth(defaults.startMonth);
    setMonthCount(DEFAULT_MONTH_COUNT);
    setCollapsed(new Set());
    setDirty(true);
    setSaveFeedback(null);
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
        throw new Error('Sheet not found.');
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: '' });
      if (!rows.length) {
        throw new Error('Sheet is empty.');
      }
      const columnKeys = Object.keys(rows[0]);
      const monthColumnsInSheet = columnKeys.filter((key) => MONTH_KEY_PATTERN.test(key)).sort();
      const sanitizedLines: FinancialLineItem[] = rows
        .map((row, index) => {
          const computation: FinancialLineItem['computation'] =
            row.Computation === 'children' || row.Computation === 'cumulative' ? row.Computation : 'manual';
          const nature: FinancialLineItem['nature'] =
            computation === 'manual'
              ? row.Nature === 'cost'
                ? 'cost'
                : 'revenue'
              : 'summary';
          const indentValue = clampIndent(Number(row.Indent ?? row.indent ?? 0), MAX_INDENT_LEVEL);
          const id =
            (typeof row['Line ID'] === 'string' && row['Line ID'].trim()) ||
            (typeof row.id === 'string' && row.id.trim()) ||
            generateId();
          const name =
            (typeof row['Line name'] === 'string' && row['Line name'].trim()) ||
            (typeof row.name === 'string' && row.name.trim()) ||
            `Line ${index + 1}`;
          const rawCode =
            (typeof row.Code === 'string' && row.Code.trim()) ||
            (typeof row.code === 'string' && row.code.trim()) ||
            slugifyCode(name);
          const months: Record<string, number> = {};
          if (computation === 'manual') {
            monthColumnsInSheet.forEach((key) => {
              const numeric = Number(row[key]);
              if (Number.isFinite(numeric)) {
                months[key] = numeric;
              }
            });
          }
          return {
            id,
            code: rawCode,
            name,
            indent: indentValue,
            nature,
            computation,
            months
          };
        })
        .map((line, _, array) => ({
          ...line,
          code: ensureUniqueCode(array, slugifyCode(line.code), line.id),
          months:
            line.computation === 'manual'
              ? Object.fromEntries(
                  Object.entries(line.months).map(([key, value]) => [
                    key,
                    line.nature === 'cost' ? Math.abs(value) : value
                  ])
                )
              : {}
        }));
      setLines(sanitizedLines);
      if (monthColumnsInSheet.length) {
        setStartMonth(monthColumnsInSheet[0]);
        setMonthCount(Math.max(MIN_MONTH_COUNT, Math.min(MAX_MONTH_COUNT, monthColumnsInSheet.length)));
      }
      setCollapsed(new Set());
      setDirty(true);
      setSaveFeedback(null);
      setImportStatus({ type: 'success', message: 'Excel data imported.' });
    } catch (importError) {
      console.error('Failed to import blueprint:', importError);
      setImportStatus({
        type: 'error',
        message: 'Unable to import the file. Ensure headers match the template.'
      });
    } finally {
      event.target.value = '';
    }
  };

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    const metaHeaders = [
      'Line ID',
      'Code',
      'Line name',
      'Nature',
      'Computation',
      'Indent',
      'Level',
      'Impact'
    ];
    const headers = [...metaHeaders, ...monthColumns.map((month) => `${month.label} ${month.year}`)];
      const rows: (string | number)[][] = [headers];
    const rowNumberMap = new Map<string, number>();
    lines.forEach((line, index) => {
      const rowNumber = index + 2;
      rowNumberMap.set(line.id, rowNumber);
      const baseRow: (string | number)[] = [
        line.id,
        line.code,
        line.name,
        line.nature,
        line.computation,
        line.indent,
        line.indent + 1,
        line.computation === 'manual' ? lineEffect(line) : 1
      ];
      const monthValues = monthColumns.map((month) => {
        if (line.computation !== 'manual') {
          return '';
        }
        const raw = Number(line.months[month.key]);
        return Number.isFinite(raw) ? raw : '';
      });
      rows.push([...baseRow, ...monthValues]);
    });
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const impactColumnLetter = toColumnLetter(metaHeaders.length - 1);
    const computationColumnLetter = toColumnLetter(metaHeaders.indexOf('Computation'));
    lines.forEach((line, lineIndex) => {
      const rowNumber = lineIndex + 2;
      monthColumns.forEach((month, monthIndex) => {
        const columnIndex = metaHeaders.length + monthIndex;
        const columnLetter = toColumnLetter(columnIndex);
        const cellRef = `${columnLetter}${rowNumber}`;
        if (line.computation === 'manual') {
          const raw = Number(line.months[month.key]);
          sheet[cellRef] = Number.isFinite(raw)
            ? { t: 'n', v: raw }
            : { t: 'n', v: '' as unknown as number };
          return;
        }
        if (line.computation === 'children') {
          const childIds = childMap.get(line.id) ?? [];
          const terms = childIds
            .map((childId) => {
              const childRow = rowNumberMap.get(childId);
              if (!childRow) {
                return null;
              }
              const childLine = lines.find((candidate) => candidate.id === childId);
              if (!childLine) {
                return null;
              }
              if (childLine.computation === 'manual') {
                return `${impactColumnLetter}${childRow}*${columnLetter}${childRow}`;
              }
              return `${columnLetter}${childRow}`;
            })
            .filter(Boolean);
          const formula = terms.length ? `=${terms.join('+')}` : '=0';
          sheet[cellRef] = { t: 'n', f: formula };
          return;
        }
        const rangeEnd = rowNumber - 1;
        if (rangeEnd <= 1) {
          sheet[cellRef] = { t: 'n', v: 0 };
          return;
        }
        const formula = `=SUMPRODUCT(--($${computationColumnLetter}$2:$${computationColumnLetter}$${rangeEnd}="manual"), $${impactColumnLetter}$2:$${impactColumnLetter}$${rangeEnd}, ${columnLetter}$2:${columnLetter}$${rangeEnd})`;
        sheet[cellRef] = { t: 'n', f: formula };
      });
    });
    XLSX.utils.book_append_sheet(workbook, sheet, 'Blueprint');
    XLSX.writeFile(workbook, 'financials-blueprint.xlsx');
  };

  const downloadTemplate = () => {
    const defaults = createDefaultBlueprint();
    setLines(defaults.lines);
    setStartMonth(defaults.startMonth);
    setMonthCount(DEFAULT_MONTH_COUNT);
    setCollapsed(new Set());
    setDirty(true);
    setSaveFeedback(null);
  };
  const netSummaryLine = useMemo(
    () => [...lines].reverse().find((line) => line.computation === 'cumulative'),
    [lines]
  );
  const netValues = netSummaryLine ? valueMap.get(netSummaryLine.id) : undefined;
  const netTotals = useMemo(() => {
    if (!netValues) {
      return null;
    }
    const totals = { horizon: 0, trailing12: 0, lastMonth: 0 };
    monthKeys.forEach((key, index) => {
      const value = netValues[key] ?? 0;
      totals.horizon += value;
      if (index >= monthKeys.length - 12) {
        totals.trailing12 += value;
      }
      if (index === monthKeys.length - 1) {
        totals.lastMonth = value;
      }
    });
    return totals;
  }, [netValues, monthKeys]);

  const warnings = useMemo(() => {
    const issues: string[] = [];
    const codeUsage = new Map<string, number>();
    lines.forEach((line) => {
      codeUsage.set(line.code, (codeUsage.get(line.code) ?? 0) + 1);
    });
    const duplicateCodes = Array.from(codeUsage.entries())
      .filter(([, count]) => count > 1)
      .map(([code]) => code);
    if (duplicateCodes.length) {
      issues.push(`Duplicate codes detected: ${duplicateCodes.slice(0, 4).join(', ')}.`);
    }
    lines.forEach((line, index) => {
      if (index === 0) {
        return;
      }
      const previous = lines[index - 1];
      if (line.indent - previous.indent > 1) {
        issues.push(`"${line.name}" skips hierarchy levels. Use indent controls to nest gradually.`);
      }
    });
    const orphanRollups = lines.filter(
      (line) => line.computation === 'children' && (childMap.get(line.id)?.length ?? 0) === 0
    );
    if (orphanRollups.length) {
      issues.push(`${orphanRollups.length} roll-up lines have no children and always show zero.`);
    }
    return issues;
  }, [lines, childMap]);

  const handleSave = async () => {
    if (saving || version === null) {
      return;
    }
    setSaving(true);
    setSaveFeedback(null);
    const payload: FinancialBlueprintPayload = {
      startMonth,
      monthCount,
      lines
    };
    const result = await saveBlueprint(payload, version);
    if (result.ok) {
      setSaveFeedback('Blueprint saved.');
      setDirty(false);
    } else if (result.error === 'version-conflict') {
      setSaveFeedback('Version conflict. Reloading latest data.');
    } else {
      setSaveFeedback('Unable to save. Please retry.');
    }
    setSaving(false);
  };

  if (loading && !blueprint) {
    return (
      <section className={styles.screen}>
        <p>Loading financial blueprint...</p>
      </section>
    );
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>Financials</h1>
          <p className={styles.subtitle}>
            Define the hierarchy of the company P&L once, reuse it in initiatives, and keep Excel round-trips clean.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.primaryButton}
            onClick={handleSave}
            disabled={saving || !dirty || version === null}
          >
            {saving ? 'Saving...' : dirty ? 'Save blueprint' : 'Saved'}
          </button>
          <button className={styles.secondaryButton} onClick={refresh} type="button" disabled={loading}>
            Reload
          </button>
          <button className={styles.secondaryButton} onClick={exportWorkbook} type="button">
            Export to Excel
          </button>
          <label className={styles.importButton}>
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} />
            Import from Excel
          </label>
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          Unable to load the blueprint. Refresh or reload the page and try again.
        </div>
      )}

      {saveFeedback && <div className={styles.infoBanner}>{saveFeedback}</div>}
      {importStatus && (
        <div className={importStatus.type === 'success' ? styles.infoBanner : styles.errorBanner}>
          {importStatus.message}
        </div>
      )}

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
                  markDirty();
                }
              }}
            />
          </label>
          <label>
            <span>Horizon</span>
            <select
              value={monthCount}
              onChange={(event) => {
                setMonthCount(Math.max(MIN_MONTH_COUNT, Number(event.target.value)));
                markDirty();
              }}
            >
              {[24, 30, 36, 42, 48].map((value) => (
                <option key={value} value={value}>
                  {value} months
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Last updated</span>
            <strong>{blueprint ? new Date(blueprint.updatedAt).toLocaleString() : '-'}</strong>
          </label>
        </div>
        <div className={styles.lineButtons}>
          <button className={styles.primaryButton} onClick={addLine} type="button">
            Create line item
          </button>
          <button className={styles.ghostButton} onClick={resetToTemplate} type="button">
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
                  <th className={styles.levelColumn}>Level</th>
                  <th className={styles.impactColumn}>Impact</th>
                  <th className={styles.natureColumn}>Nature</th>
                  <th className={styles.aggregationColumn}>Computation</th>
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
                    <td colSpan={5 + monthColumns.length} className={styles.emptyCell}>
                      No lines yet. Use "Create line item" to start defining the hierarchy.
                    </td>
                  </tr>
                ) : (
                  visibleLines.map(({ line, index, hasChildren, isCollapsed, level }) => {
                    const resolved = valueMap.get(line.id) ?? buildEmptyRecord(monthKeys);
                    return (
                      <Fragment key={line.id}>
                        <tr className={line.computation !== 'manual' ? styles.summaryRow : undefined}>
                          <td className={styles.lineColumn}>
                            <div className={styles.lineCell} style={{ marginLeft: `${line.indent * 16}px` }}>
                              {hasChildren ? (
                                <button
                                  className={styles.collapseButton}
                                  onClick={() => toggleCollapse(line.id)}
                                  type="button"
                                  aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                                >
                                  {isCollapsed ? '>' : 'v'}
                                </button>
                              ) : (
                                <span className={styles.placeholderIcon} />
                              )}
                              <div className={styles.lineInputs}>
                                <input
                                  className={styles.nameInput}
                                  value={line.name}
                                  onChange={(event) => handleNameChange(line.id, event.target.value)}
                                />
                                <div className={styles.metaRow}>
                                  <span className={styles.codeBadge}>{line.code}</span>
                                  <div className={styles.rowActions}>
                                    <button
                                      type="button"
                                      onClick={() => handleIndentChange(line.id, -1)}
                                      disabled={line.indent === 0}
                                    >
                                      {'<'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleIndentChange(line.id, 1)}
                                      disabled={index === 0}
                                    >
                                      {'>'}
                                    </button>
                                    <button type="button" onClick={() => handleMove(line.id, -1)} disabled={index === 0}>
                                      {'^'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMove(line.id, 1)}
                                      disabled={index === lines.length - 1}
                                    >
                                      {'v'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(line.id)}
                                      className={styles.removeButton}
                                    >
                                      x
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className={styles.levelColumn}>{level}</td>
                          <td className={styles.impactColumn}>
                            {line.computation === 'manual' ? (line.nature === 'cost' ? '-' : '+') : 'SUM'}
                          </td>
                          <td>
                            <select
                              value={line.nature}
                              onChange={(event) => handleNatureChange(line.id, event.target.value as FinancialLineItem['nature'])}
                              disabled={line.computation !== 'manual'}
                            >
                              <option value="revenue">Revenue / gain</option>
                              <option value="cost">Cost / loss</option>
                              <option value="summary" disabled>
                                Summary
                              </option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={line.computation}
                              onChange={(event) =>
                                handleComputationChange(line.id, event.target.value as FinancialLineItem['computation'])
                              }
                            >
                              <option value="manual">Manual entry</option>
                              <option value="children">Roll-up children</option>
                              <option value="cumulative">Running subtotal</option>
                            </select>
                          </td>
                          {monthColumns.map((month) => (
                            <td key={`${line.id}-${month.key}`}>
                              {line.computation === 'manual' ? (
                                <input
                                  type="number"
                                  value={
                                    line.months[month.key] === undefined ? '' : String(line.months[month.key] ?? '')
                                  }
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
            <h3>Excel automation</h3>
            <ol>
              <li>Download the template or export the current blueprint.</li>
              <li>
                Each manual line keeps editable values. Cost rows should stay negative once exported so subtotals keep
                signs.
              </li>
              <li>
                Roll-up rows rely on formulas that reference the hierarchy level column. Avoid deleting metadata columns.
              </li>
              <li>Import the updated file. We ignore formulas for computed rows and recalculate them automatically.</li>
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
