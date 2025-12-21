
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import styles from '../../styles/FinancialsScreen.module.css';
import { StickyTopPanel } from '../../components/layout/StickyTopPanel';
import {
  buildMonthColumns,
  createDefaultBlueprint,
  createDefaultRatios,
  DEFAULT_MONTH_COUNT,
  MIN_MONTH_COUNT,
  MAX_MONTH_COUNT,
  MAX_INDENT_LEVEL
} from './financialModel';
import {
  FinancialBlueprintPayload,
  FinancialFiscalYearConfig,
  FinancialLineItem,
  FinancialRatioDefinition
} from '../../shared/types/financials';
import {
  addToRecord,
  buildCumulativeLookup,
  buildEmptyRecord,
  buildManualValueMap,
  buildValueMap,
  parseMonthKey,
  lineEffect
} from '../../shared/utils/financialMath';
import { generateId } from '../../shared/ui/generateId';
import { useFinancialsState } from '../../app/state/AppStateContext';
import { DEFAULT_FISCAL_YEAR_START_MONTH } from '../../shared/config/finance';

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

const normalizeLabel = (value: string) => value.trim().toLowerCase();

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
const toColumnLetter = (index: number) => {
  let temp = index;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clampMonth = (value: number) => Math.min(12, Math.max(1, Math.floor(value || 1)));

const formatFiscalWindow = (startMonth: number) => {
  const safeStart = clampMonth(startMonth);
  const endMonth = ((safeStart + 10) % 12) + 1;
  const startLabel = monthLabels[safeStart - 1];
  const endLabel = monthLabels[endMonth - 1];
  return `${startLabel} – ${endLabel}`;
};

const computeFiscalYearKeys = (keys: string[], fiscalStartMonth: number) => {
  if (!keys.length) {
    return [];
  }
  const safeStart = clampMonth(fiscalStartMonth);
  const lastMonth = parseMonthKey(keys[keys.length - 1]);
  if (!lastMonth) {
    return [];
  }
  let fiscalYear = lastMonth.year;
  if (lastMonth.month < safeStart) {
    fiscalYear -= 1;
  }
  const fiscalStartIndex = fiscalYear * 12 + (safeStart - 1);
  const fiscalEndIndex = fiscalStartIndex + 12;
  return keys.filter((key) => {
    const parsed = parseMonthKey(key);
    if (!parsed) {
      return false;
    }
    const index = parsed.year * 12 + (parsed.month - 1);
    return index >= fiscalStartIndex && index < fiscalEndIndex;
  });
};

const seededRandom = (seed: string, index: number) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1_000_000;
  }
  const x = Math.sin(hash + index * 13.37) * 10000;
  return x - Math.floor(x);
};

const buildSampleMonths = (line: FinancialLineItem, monthKeys: string[]) => {
  if (!monthKeys.length) {
    return {};
  }
  const natureMultiplier = line.nature === 'cost' ? -1 : 1;
  const base =
    line.nature === 'revenue'
      ? 80000 + seededRandom(line.code, 1) * 40000
      : 40000 + seededRandom(line.code, 2) * 20000;
  const months: Record<string, number> = {};
  monthKeys.forEach((key, index) => {
    const oscillation = 0.25 * Math.sin((index / 12) * Math.PI * 2 + seededRandom(line.code, index));
    const growth = 1 + 0.015 * index;
    const noise = 0.1 * (seededRandom(line.code, index + 3) - 0.5);
    const value = base * growth * (1 + oscillation + noise);
    months[key] = Math.round(value * natureMultiplier);
  });
  return months;
};

const buildWorkbookDocument = (lines: FinancialLineItem[], startMonth: string, monthCount: number) => {
  const workbook = XLSX.utils.book_new();
  const monthColumns = buildMonthColumns(startMonth, monthCount);
  const parents = buildParentMap(lines);
  const children = buildChildMap(lines, parents);
  const metaHeaders = ['Line name', 'Nature', 'Computation', 'Indent', 'Level', 'Impact'];
  const headers = [...metaHeaders, ...monthColumns.map((month) => month.key)];
  const rows: (string | number)[][] = [headers];
  const rowNumberMap = new Map<string, number>();
  lines.forEach((line, index) => {
    const rowNumber = index + 2;
    rowNumberMap.set(line.id, rowNumber);
    const baseRow: (string | number)[] = [
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
        const childIds = children.get(line.id) ?? [];
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
  const metadataRows = [
    ['Line name', 'Code', 'Line ID', 'Computation', 'Nature'],
    ...lines.map((line) => [line.name, line.code, line.id, line.computation, line.nature])
  ];
  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataRows);
  return workbook;
};
export const FinancialsScreen = () => {
  const { blueprint, loading, error, saveBlueprint, refresh } = useFinancialsState();
  const defaultBlueprint = useMemo(() => createDefaultBlueprint(), []);
  const [lines, setLines] = useState<FinancialLineItem[]>([]);
  const [startMonth, setStartMonth] = useState(defaultBlueprint.startMonth);
  const [monthCount, setMonthCount] = useState(DEFAULT_MONTH_COUNT);
  const [fiscalYear, setFiscalYear] = useState<FinancialFiscalYearConfig>(defaultBlueprint.fiscalYear);
  const [ratios, setRatios] = useState<FinancialRatioDefinition[]>(defaultBlueprint.ratios);
  const [version, setVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const samplePrefillRef = useRef<string | null>(null);

  useEffect(() => {
    if (!blueprint) {
      return;
    }
    setLines(blueprint.lines);
    setStartMonth(blueprint.startMonth);
    setMonthCount(blueprint.monthCount);
    setFiscalYear(blueprint.fiscalYear ?? defaultBlueprint.fiscalYear);
    setRatios(blueprint.ratios ?? defaultBlueprint.ratios);
    setVersion(blueprint.version);
    setDirty(false);
  }, [blueprint, defaultBlueprint]);

  useEffect(() => {
    if (!blueprint) {
      samplePrefillRef.current = null;
      return;
    }
    if (samplePrefillRef.current === blueprint.id) {
      return;
    }
    const hasManualValues = blueprint.lines.some((line) => {
      if (line.computation !== 'manual') {
        return false;
      }
      return Object.values(line.months ?? {}).some((value) => Number(value) !== 0);
    });
    if (hasManualValues) {
      samplePrefillRef.current = blueprint.id;
      return;
    }
    const monthKeys = buildMonthColumns(startMonth, monthCount).map((month) => month.key);
    setLines((current) =>
      current.map((line) => {
        if (line.computation !== 'manual') {
          return line;
        }
        return {
          ...line,
          months: buildSampleMonths(line, monthKeys)
        };
      })
    );
    setDirty(true);
    setSaveFeedback('We pre-filled the P&L with sample data. Save the blueprint to persist it.');
    samplePrefillRef.current = blueprint.id;
  }, [blueprint, startMonth, monthCount]);

  const monthColumns = useMemo(() => buildMonthColumns(startMonth, monthCount), [startMonth, monthCount]);
  const monthKeys = monthColumns.map((month) => month.key);

  const parentMap = useMemo(() => buildParentMap(lines), [lines]);
  const childMap = useMemo(() => buildChildMap(lines, parentMap), [lines, parentMap]);
  const lineByCode = useMemo(() => new Map(lines.map((line) => [line.code, line])), [lines]);
  const lineOptions = useMemo(() => lines.map((line) => ({ code: line.code, name: line.name })), [lines]);
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
  const fiscalStartMonth = fiscalYear?.startMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH;
  const fiscalWindowLabel = formatFiscalWindow(fiscalStartMonth);
  const ratioSummaries = useMemo(() => {
    if (!ratios.length) {
      return [];
    }
    const fiscalKeys = computeFiscalYearKeys(monthKeys, fiscalStartMonth);
    const trailingKeys = monthKeys.slice(Math.max(monthKeys.length - 12, 0));
    const lastKey = monthKeys[monthKeys.length - 1];
    return ratios.map((ratio) => {
      const numerator = lineByCode.get(ratio.numeratorCode);
      const denominator = lineByCode.get(ratio.denominatorCode);
      const numeratorValues = numerator ? valueMap.get(numerator.id) : undefined;
      const denominatorValues = denominator ? valueMap.get(denominator.id) : undefined;
      const computeWindow = (keys: string[]): number | null => {
        if (!keys.length || !numeratorValues || !denominatorValues) {
          return null;
        }
        const numeratorTotal = keys.reduce((sum, key) => sum + (numeratorValues[key] ?? 0), 0);
        const denominatorTotal = keys.reduce((sum, key) => sum + (denominatorValues[key] ?? 0), 0);
        if (!denominatorTotal) {
          return null;
        }
        return numeratorTotal / denominatorTotal;
      };
      return {
        ratio,
        lastMonth: lastKey ? computeWindow([lastKey]) : null,
        trailing12: computeWindow(trailingKeys),
        fiscalYear: computeWindow(fiscalKeys),
        missingNumerator: !numerator,
        missingDenominator: !denominator
      };
    });
  }, [ratios, lineByCode, valueMap, monthKeys, fiscalStartMonth]);

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

  const collapseAllSections = () => setCollapsed(new Set(lines.map((line) => line.id)));
  const expandAllSections = () => setCollapsed(new Set());

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

  const handleRowDragStart = (event: React.DragEvent<HTMLTableRowElement>, id: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
    setDragOverId(null);
  };

  const handleRowDragOver = (event: React.DragEvent<HTMLTableRowElement>, id: string) => {
    event.preventDefault();
    if (!draggingId || draggingId === id) {
      return;
    }
    setDragOverId(id);
  };

  const handleRowDrop = (event: React.DragEvent<HTMLTableRowElement>, id: string) => {
    event.preventDefault();
    if (!draggingId || draggingId === id) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    setLines((current) => {
      const sourceIndex = current.findIndex((line) => line.id === draggingId);
      const targetIndex = current.findIndex((line) => line.id === id);
      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggingId(null);
    setDragOverId(null);
    markDirty();
  };

  const handleRowDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
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

  const handleFiscalStartChange = (nextStart: number) => {
    const safeValue = clampMonth(nextStart);
    setFiscalYear((current) => ({ ...current, startMonth: safeValue }));
    markDirty();
  };

  const addRatio = () => {
    if (!lineOptions.length) {
      return;
    }
    const defaultDenominator =
      lineOptions.find((option) => option.code === 'REV_TOTAL')?.code ?? lineOptions[0].code;
    const defaultNumerator =
      lineOptions.find((option) => option.code === 'GROSS_PROFIT')?.code ?? lineOptions[0].code;
    setRatios((current) => [
      ...current,
      {
        id: generateId(),
        label: 'New ratio',
        numeratorCode: defaultNumerator,
        denominatorCode: defaultDenominator,
        format: 'percentage',
        precision: 1
      }
    ]);
    markDirty();
  };

  const updateRatio = (id: string, changes: Partial<FinancialRatioDefinition>) => {
    setRatios((current) => current.map((ratio) => (ratio.id === id ? { ...ratio, ...changes } : ratio)));
    markDirty();
  };

  const removeRatio = (id: string) => {
    setRatios((current) => current.filter((ratio) => ratio.id !== id));
    markDirty();
  };

  const formatRatioDisplay = (value: number | null, ratio: FinancialRatioDefinition) => {
    const basePrecision = Number.isFinite(ratio.precision) ? Math.max(0, Math.min(4, ratio.precision)) : 1;
    if (value === null) {
      return '—';
    }
    if (ratio.format === 'multiple') {
      return `${value.toFixed(basePrecision)}x`;
    }
    return `${(value * 100).toFixed(basePrecision)}%`;
  };

  const resetToTemplate = () => {
    const defaults = createDefaultBlueprint();
    setLines(defaults.lines);
    setStartMonth(defaults.startMonth);
    setMonthCount(defaults.monthCount);
    setFiscalYear(defaults.fiscalYear);
    setRatios(defaults.ratios);
    setCollapsed(new Set());
    setDirty(true);
    setSaveFeedback(null);
  };
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const shouldConfirmReplace = dirty || lines.length > 0;
    if (shouldConfirmReplace) {
      const confirmed = window.confirm('Importing will replace the current blueprint. Continue?');
      if (!confirmed) {
        event.target.value = '';
        return;
      }
    }
    const existingById = new Map(lines.map((line) => [line.id, line]));
    const existingByCode = new Map(lines.map((line) => [line.code.toUpperCase(), line]));
    const existingByName = new Map<string, FinancialLineItem[]>();
    lines.forEach((line) => {
      const key = normalizeLabel(line.name);
      if (!key) {
        return;
      }
      if (!existingByName.has(key)) {
        existingByName.set(key, []);
      }
      existingByName.get(key)!.push(line);
    });
    const detachFromNameQueue = (line: FinancialLineItem) => {
      const key = normalizeLabel(line.name);
      if (!key) {
        return;
      }
      const queue = existingByName.get(key);
      if (!queue) {
        return;
      }
      const index = queue.findIndex((entry) => entry.id === line.id);
      if (index >= 0) {
        queue.splice(index, 1);
      }
    };
    const releaseLine = (line: FinancialLineItem) => {
      existingById.delete(line.id);
      existingByCode.delete(line.code.toUpperCase());
      detachFromNameQueue(line);
    };
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
      const monthKeySet = new Set(monthColumnsInSheet);
      if (monthColumnsInSheet.length === 0) {
        throw new Error('No month columns detected (YYYY-MM).');
      }
      const nameColumn =
        columnKeys.find((key) => key.toLowerCase() === 'line name' || key.toLowerCase() === 'name') ?? 'Line name';
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
          const nameValue = row[nameColumn];
          const name =
            (typeof nameValue === 'string' && nameValue.trim()) ||
            (typeof row['Line name'] === 'string' && row['Line name'].trim()) ||
            (typeof row.name === 'string' && row.name.trim()) ||
            `Line ${index + 1}`;
          const providedId =
            (typeof row['Line ID'] === 'string' && row['Line ID'].trim()) ||
            (typeof row.id === 'string' && row.id.trim()) ||
            '';
          const rawCodeInput =
            (typeof row.Code === 'string' && row.Code.trim()) || (typeof row.code === 'string' && row.code.trim()) || '';
          const normalizedCodeInput = rawCodeInput ? slugifyCode(rawCodeInput) : '';
          const normalizedName = normalizeLabel(name);
          let matchedLine: FinancialLineItem | undefined;
          if (providedId && existingById.has(providedId)) {
            matchedLine = existingById.get(providedId);
          } else if (normalizedCodeInput && existingByCode.has(normalizedCodeInput)) {
            matchedLine = existingByCode.get(normalizedCodeInput);
          } else if (normalizedName && existingByName.has(normalizedName)) {
            const queue = existingByName.get(normalizedName);
            if (queue?.length) {
              matchedLine = queue.shift();
            }
          }
          if (matchedLine) {
            releaseLine(matchedLine);
          }
          const id = providedId || matchedLine?.id || generateId();
          const codeSeed = rawCodeInput ? normalizedCodeInput : matchedLine?.code ?? slugifyCode(name);
          const months: Record<string, number> = {};
          if (computation === 'manual') {
            monthColumnsInSheet.forEach((key) => {
              if (!monthKeySet.has(key)) {
                return;
              }
              const numeric = Number(row[key as keyof typeof row]);
              if (Number.isFinite(numeric)) {
                months[key] = numeric;
              }
            });
          }
          return {
            id,
            code: codeSeed,
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
      const nextLines = sanitizedLines.length ? sanitizedLines : lines;
      setLines(nextLines);
      if (monthColumnsInSheet.length) {
        setStartMonth(monthColumnsInSheet[0]);
        setMonthCount(Math.max(MIN_MONTH_COUNT, Math.min(MAX_MONTH_COUNT, monthColumnsInSheet.length)));
      }
      setCollapsed(new Set());
      setDirty(true);
      setSaveFeedback(null);
      setImportStatus({ type: 'success', message: 'Excel data imported. IDs and codes were recreated when needed.' });
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
    const workbook = buildWorkbookDocument(lines, startMonth, monthCount);
    XLSX.writeFile(workbook, 'financials-blueprint.xlsx');
  };

  const downloadTemplateWorkbook = () => {
    const defaults = createDefaultBlueprint();
    const workbook = buildWorkbookDocument(defaults.lines, defaults.startMonth, defaults.monthCount);
    const instructions = [
      ['Financials template cheat-sheet'],
      ['1. Month column headers already use YYYY-MM (for example, 2025-07). Do not rename them—just paste your data.'],
      ['1. Paste or type the line names, indentation, nature, and computation. Reorder rows freely.'],
      ['2. Line ID and Code cells are optional—leave them blank or delete them. We match existing lines by ID/code/name and regenerate stable values automatically.'],
      ['3. Fill months only for manual rows. Enter costs as positive values; the app applies signs.'],
      ['4. Save the file as .xlsx and upload it here. Roll-ups, cumulative subtotals, and margins recalculate on import.'],
      ['Tip: export the current blueprint first if you want to tweak the live structure.']
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
    XLSX.writeFile(workbook, 'financials-template.xlsx');
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
    const ratioIssues = ratios
      .filter((ratio) => !lineByCode.has(ratio.numeratorCode) || !lineByCode.has(ratio.denominatorCode))
      .map((ratio) => ratio.label || ratio.id);
    if (ratioIssues.length) {
      issues.push(`Ratios referencing missing line codes: ${ratioIssues.slice(0, 4).join(', ')}.`);
    }
    return issues;
  }, [lines, childMap, ratios, lineByCode]);

  const blueprintStats = useMemo(() => {
    const manualRevenue = lines.filter((line) => line.computation === 'manual' && line.nature === 'revenue').length;
    const manualCosts = lines.filter((line) => line.computation === 'manual' && line.nature === 'cost').length;
    const summaries = lines.length - manualRevenue - manualCosts;
    return {
      total: lines.length,
      revenue: manualRevenue,
      costs: manualCosts,
      summaries,
      ratios: ratios.length
    };
  }, [lines, ratios.length]);

  const handleSave = async () => {
    if (saving || version === null) {
      return;
    }
    setSaving(true);
    setSaveFeedback(null);
    const payload: FinancialBlueprintPayload = {
      startMonth,
      monthCount,
      fiscalYear,
      ratios,
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
      <div className={styles.page}>
        <section className={styles.screen}>
          <p>Loading financial blueprint...</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <StickyTopPanel
        right={
          <div className={styles.headerActions}>
            <button
              className={styles.primaryButton}
              onClick={handleSave}
              disabled={saving || !dirty || version === null}
              type="button"
            >
              {saving ? 'Saving...' : dirty ? 'Save blueprint' : 'Saved'}
            </button>
            <button className={styles.secondaryButton} onClick={refresh} type="button" disabled={loading}>
              Reload
            </button>
            <button className={styles.secondaryButton} onClick={exportWorkbook} type="button">
              Export to Excel
            </button>
            <button className={styles.secondaryButton} onClick={downloadTemplateWorkbook} type="button">
              Download template
            </button>
            <label className={styles.importButton}>
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} />
              Import from Excel
            </label>
          </div>
        }
      />
      <section className={styles.screen}>
        <header className={styles.header}>
          <div>
            <h1>Financials</h1>
            <p className={styles.subtitle}>
              Define the hierarchy of the company P&L once, reuse it in initiatives, and keep Excel round-trips clean.
            </p>
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
            <span>Fiscal year start</span>
            <select
              value={fiscalStartMonth}
              onChange={(event) => handleFiscalStartChange(Number(event.target.value))}
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
            <small className={styles.controlHint}>FY window: {fiscalWindowLabel}</small>
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
          <button className={styles.ghostButton} onClick={collapseAllSections} type="button">
            Collapse all
          </button>
          <button className={styles.ghostButton} onClick={expandAllSections} type="button">
            Expand all
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
                  visibleLines.map(({ line, hasChildren, isCollapsed, level }) => {
                    const resolved = valueMap.get(line.id) ?? buildEmptyRecord(monthKeys);
                    const rowClasses = [
                      line.computation !== 'manual' ? styles.summaryRow : '',
                      line.computation === 'cumulative' ? styles.cumulativeRow : '',
                      draggingId === line.id ? styles.draggingRow : '',
                      dragOverId === line.id ? styles.dragOverRow : ''
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <tr
                        key={line.id}
                        className={rowClasses || undefined}
                        draggable
                        onDragStart={(event) => handleRowDragStart(event, line.id)}
                        onDragOver={(event) => handleRowDragOver(event, line.id)}
                        onDrop={(event) => handleRowDrop(event, line.id)}
                        onDragEnd={handleRowDragEnd}
                        title={`Line code: ${line.code}`}
                      >
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
                              <div className={styles.nameRow}>
                                <span className={styles.dragHandle} aria-hidden="true">
                                  ::
                                </span>
                                <input
                                  className={styles.nameInput}
                                  value={line.name}
                                  onChange={(event) => handleNameChange(line.id, event.target.value)}
                                />
                              </div>
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  onClick={() => handleIndentChange(line.id, -1)}
                                  disabled={line.indent === 0}
                                  title="Decrease indent"
                                >
                                  {'<'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleIndentChange(line.id, 1)}
                                  title="Increase indent"
                                >
                                  {'>'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(line.id)}
                                  className={styles.removeButton}
                                  title="Remove line"
                                >
                                  Remove
                                </button>
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
                                value={line.months[month.key] === undefined ? '' : String(line.months[month.key] ?? '')}
                                onChange={(event) => handleValueChange(line.id, month.key, event.target.value)}
                              />
                            ) : (
                              <span className={styles.valueReadonly}>{formatCurrency(resolved[month.key] ?? 0)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.ratioPanel}>
            <div className={styles.ratioEditor}>
            <div className={styles.ratioHeader}>
              <h3>Ratios & margins</h3>
              <p>Link numerator and denominator line codes to surface the key profitability views.</p>
            </div>
            {ratios.length === 0 ? (
              <p className={styles.placeholder}>
                No ratios yet. Use &ldquo;Add ratio / margin&rdquo; to start tracking gross, EBITDA, or custom metrics.
              </p>
            ) : (
              <div className={styles.ratioList}>
                {ratios.map((ratio) => (
                  <div key={ratio.id} className={styles.ratioRow}>
                    <input
                      className={styles.ratioNameInput}
                      value={ratio.label}
                      onChange={(event) => updateRatio(ratio.id, { label: event.target.value })}
                      placeholder="Ratio name"
                    />
                    <select
                      value={ratio.numeratorCode}
                      onChange={(event) => updateRatio(ratio.id, { numeratorCode: event.target.value })}
                    >
                      {lineOptions.map((option) => (
                        <option key={`num-${ratio.id}-${option.code}`} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <span className={styles.ratioDivider}>÷</span>
                    <select
                      value={ratio.denominatorCode}
                      onChange={(event) => updateRatio(ratio.id, { denominatorCode: event.target.value })}
                    >
                      {lineOptions.map((option) => (
                        <option key={`den-${ratio.id}-${option.code}`} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ratio.format}
                      onChange={(event) =>
                        updateRatio(ratio.id, { format: event.target.value as FinancialRatioDefinition['format'] })
                      }
                    >
                      <option value="percentage">%</option>
                      <option value="multiple">Multiple</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={ratio.precision}
                      onChange={(event) =>
                        updateRatio(ratio.id, { precision: Math.max(0, Math.min(4, Number(event.target.value))) })
                      }
                      className={styles.ratioPrecisionInput}
                    />
                    <button
                      type="button"
                      className={styles.ratioRemoveButton}
                      onClick={() => removeRatio(ratio.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              className={styles.ghostButton}
              onClick={addRatio}
              type="button"
              disabled={!lineOptions.length}
            >
              Add ratio / margin
            </button>
          </div>

          <div className={styles.ratioPreview}>
            <div className={styles.ratioHeader}>
              <h4>Live preview</h4>
              <p>Last month, trailing 12 months, and FY {fiscalWindowLabel}.</p>
            </div>
            <table className={styles.ratioTable}>
              <thead>
                <tr>
                  <th>Ratio</th>
                  <th>Last month</th>
                  <th>Trailing 12</th>
                  <th>FY {fiscalWindowLabel}</th>
                </tr>
              </thead>
              <tbody>
                {ratioSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      Ratios appear here as soon as you create one.
                    </td>
                  </tr>
                ) : (
                  ratioSummaries.map((entry) => (
                    <tr key={entry.ratio.id}>
                      <td>
                        <strong>{entry.ratio.label || 'Unnamed ratio'}</strong>
                        {(entry.missingDenominator || entry.missingNumerator) && (
                          <span className={styles.ratioWarning}>Missing source line</span>
                        )}
                      </td>
                      <td>{formatRatioDisplay(entry.lastMonth, entry.ratio)}</td>
                      <td>{formatRatioDisplay(entry.trailing12, entry.ratio)}</td>
                      <td>{formatRatioDisplay(entry.fiscalYear, entry.ratio)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
              <li>Download the template or export the live blueprint as a starting point.</li>
              <li>
                Add/reorder lines freely. Line ID and Code cells are optional—we reuse them when present and regenerate
                consistent values when they are blank or removed.
              </li>
              <li>Keep the YYYY-MM month headers intact. They map directly to the timeline on this page.</li>
              <li>Keep the Indent / Nature / Computation columns so the hierarchy and roll-ups stay intact.</li>
              <li>Enter monthly values only for manual rows. Costs should stay positive; we flip the sign.</li>
              <li>Save as .xlsx, upload it, review changes, and click Save blueprint to publish.</li>
            </ol>
            <button type="button" className={styles.sidebarButton} onClick={downloadTemplateWorkbook}>
              Download template
            </button>
          </div>
          <div className={styles.sidebarCard}>
            <h3>Fiscal calendar</h3>
            <p>FY runs {fiscalWindowLabel}. Initiative editors and analytics dashboards rely on this definition.</p>
            <p>
              See it in context inside{' '}
              <a href="#/initiatives" className={styles.inlineLink}>
                Initiatives &rarr; Financial outlook
              </a>
              .
            </p>
          </div>
          <div className={styles.sidebarCard}>
            <h3>Blueprint stats</h3>
            <p>
              Total lines: <strong>{blueprintStats.total}</strong>
            </p>
            <p>
              Revenue lines: <strong>{blueprintStats.revenue}</strong>
            </p>
            <p>
              Cost lines: <strong>{blueprintStats.costs}</strong>
            </p>
            <p>
              Summaries: <strong>{blueprintStats.summaries}</strong>
            </p>
            <p>
              Custom ratios: <strong>{blueprintStats.ratios}</strong>
            </p>
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
    </div>
  );
};
