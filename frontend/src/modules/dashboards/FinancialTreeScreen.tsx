import { useMemo } from 'react';
import styles from '../../styles/FinancialTreeScreen.module.css';
import { useFinancialsState } from '../../app/state/AppStateContext';
import { FinancialLineItem } from '../../shared/types/financials';

interface MonthDescriptor {
  key: string;
  year: number;
  month: number;
}

const parseMonthKey = (key: string): MonthDescriptor | null => {
  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  return { key, year, month };
};

const buildMonthIndex = (lines: FinancialLineItem[]) => {
  const keys = new Set<string>();
  lines.forEach((line) => {
    Object.keys(line.months ?? {}).forEach((key) => keys.add(key));
  });
  return Array.from(keys)
    .map((key) => parseMonthKey(key))
    .filter((month): month is MonthDescriptor => Boolean(month))
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year));
};

const buildIndentParentMap = (lines: FinancialLineItem[]) => {
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

const buildNextCumulativeMap = (lines: FinancialLineItem[]) => {
  const nextMap = new Map<string, string | null>();
  let nextCumulative: FinancialLineItem | null = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    nextMap.set(line.id, nextCumulative ? nextCumulative.id : null);
    if (line.computation === 'cumulative') {
      nextCumulative = line;
    }
  }
  return nextMap;
};

const buildChildMap = (lines: FinancialLineItem[]) => {
  const map = new Map<string, string[]>();
  lines.forEach((line) => map.set(line.id, []));
  const stack: { line: FinancialLineItem }[] = [];
  lines.forEach((line) => {
    while (stack.length && stack[stack.length - 1].line.indent >= line.indent) {
      stack.pop();
    }
    if (stack.length) {
      const parent = stack[stack.length - 1].line;
      map.get(parent.id)?.push(line.id);
    }
    stack.push({ line });
  });
  return map;
};

const buildManualValueMap = (lines: FinancialLineItem[], monthKeys: string[]) => {
  const map = new Map<string, Record<string, number>>();
  lines.forEach((line) => {
    if (line.computation !== 'manual') {
      return;
    }
    const record: Record<string, number> = {};
    monthKeys.forEach((key) => {
      const raw = Number(line.months[key]);
      record[key] = Number.isFinite(raw) ? raw : 0;
    });
    map.set(line.id, record);
  });
  return map;
};

const sumRecords = (records: Record<string, number>[], monthKeys: string[]) => {
  const total: Record<string, number> = {};
  monthKeys.forEach((key) => {
    total[key] = records.reduce((sum, record) => sum + (record[key] ?? 0), 0);
  });
  return total;
};

const buildValueMap = (
  lines: FinancialLineItem[],
  monthKeys: string[],
  childMap: Map<string, string[]>,
  manualMap: Map<string, Record<string, number>>
) => {
  const map = new Map<string, Record<string, number>>();
  const getValue = (line: FinancialLineItem): Record<string, number> => {
    if (map.has(line.id)) {
      return map.get(line.id)!;
    }
    let value: Record<string, number>;
    if (line.computation === 'manual') {
      value = manualMap.get(line.id) ?? monthKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    } else if (line.computation === 'children') {
      const children = (childMap.get(line.id) ?? [])
        .map((childId) => lines.find((candidate) => candidate.id === childId))
        .filter((child): child is FinancialLineItem => Boolean(child));
      value = sumRecords(children.map((child) => getValue(child)), monthKeys);
    } else {
      // cumulative
      const index = lines.findIndex((candidate) => candidate.id === line.id);
      const slice = lines.slice(0, index).filter((candidate) => candidate.computation !== 'cumulative');
      value = sumRecords(slice.map((candidate) => getValue(candidate)), monthKeys);
    }
    map.set(line.id, value);
    return value;
  };
  lines.forEach((line) => getValue(line));
  return map;
};

const computeYearTotals = (values: Record<string, number>) => {
  const totals = new Map<number, number>();
  Object.entries(values).forEach(([key, value]) => {
    const parsed = parseMonthKey(key);
    if (!parsed) {
      return;
    }
    totals.set(parsed.year, (totals.get(parsed.year) ?? 0) + value);
  });
  return totals;
};

interface TreeNode {
  line: FinancialLineItem;
  children: TreeNode[];
  yearA: number;
  yearB: number;
  valueA: number;
  valueB: number;
}

const buildTree = (
  lines: FinancialLineItem[],
  parentMap: Map<string, string | null>,
  valueMap: Map<string, Record<string, number>>,
  yearA: number,
  yearB: number
) => {
  const nodeMap = new Map<string, TreeNode>();
  lines.forEach((line) => {

    const totals = computeYearTotals(valueMap.get(line.id) ?? {});
    nodeMap.set(line.id, {
      line,
      children: [],
      yearA,
      yearB,
      valueA: totals.get(yearA) ?? 0,
      valueB: totals.get(yearB) ?? 0
    });
  });
  lines.forEach((line) => {
    const parentId = parentMap.get(line.id);
    if (parentId) {
      const parentNode = nodeMap.get(parentId);
      const childNode = nodeMap.get(line.id);
      if (parentNode && childNode) {
        parentNode.children.push(childNode);
      }
    }
  });
  const roots = lines
    .map((line) => nodeMap.get(line.id))
    .filter((node): node is TreeNode => Boolean(node && !parentMap.get(node.line.id)));
  const netProfitRoot =
    roots.find(
      (node) => node.line.computation === 'cumulative' && node.line.code.toUpperCase().includes('NET')
    ) ?? roots[0] ?? null;
  return netProfitRoot;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.round(value)
  );

const TreeNodeCard = ({
  node,
  maxAbsValue
}: {
  node: TreeNode;
  maxAbsValue: number;
}) => {
  const scale = maxAbsValue || 1;
  const barWidth = (value: number) => `${Math.min(100, Math.abs(value) / scale * 100)}%`;
  const color = (value: number) => (value >= 0 ? styles.barPositive : styles.barNegative);
  const sortedChildren = [...node.children].sort(
    (a, b) => Math.abs(b.valueA + b.valueB) - Math.abs(a.valueA + a.valueB)
  );
  const nodeClasses = [
    styles.treeNode,
    sortedChildren.length === 0 ? styles.treeNodeLeaf : styles.treeNodeBranch
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={nodeClasses}>
      <div className={styles.nodeCard}>
        <header>
          <small>{node.line.code}</small>
          <h4>{node.line.name}</h4>
        </header>
        <div className={styles.bars}>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>{node.yearA}</span>
            <div className={styles.barTrack}>
              <div className={`${styles.barFill} ${color(node.valueA)}`} style={{ width: barWidth(node.valueA) }} />
            </div>
            <span className={styles.barValue}>{formatCurrency(node.valueA)}</span>
          </div>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>{node.yearB}</span>
            <div className={styles.barTrack}>
              <div className={`${styles.barFill} ${color(node.valueB)}`} style={{ width: barWidth(node.valueB) }} />
            </div>
            <span className={styles.barValue}>{formatCurrency(node.valueB)}</span>
          </div>
        </div>
      </div>
      {sortedChildren.length > 0 && (
        <div className={styles.treeChildren}>
          {sortedChildren.map((child, index) => {
            const branchClasses = [
              styles.treeBranch,
              index === 0 ? styles.treeBranchFirst : '',
              index === sortedChildren.length - 1 ? styles.treeBranchLast : ''
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={child.line.id} className={branchClasses}>
                <TreeNodeCard node={child} maxAbsValue={maxAbsValue} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const FinancialTreeScreen = () => {
  const { blueprint, loading, error } = useFinancialsState();

  const monthList = useMemo(() => (blueprint ? buildMonthIndex(blueprint.lines) : []), [blueprint]);
  const monthKeys = monthList.map((month) => month.key);
  const availableYears = useMemo(
    () => Array.from(new Set(monthList.map((month) => month.year))).sort((a, b) => a - b),
    [monthList]
  );
  const currentYear = new Date().getFullYear();
  const baseYear =
    availableYears.find((year) => year >= currentYear) ?? availableYears[0] ?? currentYear;
  const nextYear = baseYear + 1;

  const parentMap = useMemo(() => {
    if (!blueprint) {
      return new Map<string, string | null>();
    }
    const indentParents = buildIndentParentMap(blueprint.lines);
    const nextCumulative = buildNextCumulativeMap(blueprint.lines);
    const map = new Map<string, string | null>();
    blueprint.lines.forEach((line) => {
      map.set(line.id, indentParents.get(line.id) ?? null);
    });
    blueprint.lines.forEach((line) => {
      const fallbackParent = nextCumulative.get(line.id);
      if (line.computation === 'cumulative') {
        if (fallbackParent) {
          map.set(line.id, fallbackParent);
        } else if (!map.has(line.id)) {
          map.set(line.id, null);
        }
      } else if (!map.get(line.id) && fallbackParent) {
        map.set(line.id, fallbackParent);
      }
    });
    return map;
  }, [blueprint]);

  const valueMap = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    const childMap = buildChildMap(blueprint.lines);
    const manualMap = buildManualValueMap(blueprint.lines, monthKeys);
    return buildValueMap(blueprint.lines, monthKeys, childMap, manualMap);
  }, [blueprint, monthKeys]);

  const rootNode = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return null;
    }
    return buildTree(blueprint.lines, parentMap, valueMap, baseYear, nextYear);
  }, [blueprint, parentMap, valueMap, baseYear, nextYear, monthKeys.length]);

  const maxAbsValue = useMemo(() => {
    if (!rootNode) {
      return 0;
    }
    const stack = [rootNode];
    let max = 0;
    while (stack.length) {
      const node = stack.pop()!;
      max = Math.max(max, Math.abs(node.valueA), Math.abs(node.valueB));
      stack.push(...node.children);
    }
    return max;
  }, [rootNode]);

  if (!blueprint && loading) {
    return (
      <section className={styles.screen}>
        <p>Loading P&amp;L blueprint...</p>
      </section>
    );
  }

  if (!blueprint || !rootNode) {
    return (
      <section className={styles.screen}>
        <p className={styles.warningText}>
          The Financials blueprint is not available yet. Configure it first to unlock this dashboard.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>P&amp;L tree</h1>
          <p>
            Visualize how each line item contributes to net profit. Blocks show annual impact for {baseYear} and{' '}
            {nextYear}.
          </p>
        </div>
      </header>
      {error && (
        <div className={styles.errorBanner}>
          Unable to refresh blueprint data automatically. The view may be stale.
        </div>
      )}
      <div className={styles.treeWrapper}>
        <TreeNodeCard node={rootNode} maxAbsValue={maxAbsValue} />
      </div>
    </section>
  );
};
