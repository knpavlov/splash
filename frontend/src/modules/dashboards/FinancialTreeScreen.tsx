import { useMemo, useState } from 'react';
import styles from '../../styles/FinancialTreeScreen.module.css';
import { useFinancialsState, useInitiativesState } from '../../app/state/AppStateContext';
import { FinancialLineItem } from '../../shared/types/financials';
import {
  initiativeStageKeys,
  initiativeStageLabels,
  initiativeFinancialKinds,
  InitiativeStageKey
} from '../../shared/types/initiative';

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
  baseValue: number;
  initiativeValue: number;
  totalValue: number;
}

const buildTree = (
  lines: FinancialLineItem[],
  parentMap: Map<string, string | null>,
  childMap: Map<string, string[]>,
  baseValueMap: Map<string, Record<string, number>>,
  manualEffectMap: Map<string, number>,
  selectedYear: number
) => {
  const nodeMap = new Map<string, TreeNode>();
  const effectCache = new Map<string, number>();

  const getEffectValue = (line: FinancialLineItem): number => {
    if (effectCache.has(line.id)) {
      return effectCache.get(line.id)!;
    }
    let value = 0;
    if (line.computation === 'manual') {
      value = manualEffectMap.get(line.id) ?? 0;
    } else if (line.computation === 'children') {
      const children = (childMap.get(line.id) ?? [])
        .map((childId) => lines.find((candidate) => candidate.id === childId))
        .filter((child): child is FinancialLineItem => Boolean(child));
      value = children.reduce((sum, child) => sum + getEffectValue(child), 0);
    } else {
      const index = lines.findIndex((candidate) => candidate.id === line.id);
      const scope = lines.slice(0, index).filter((candidate) => candidate.computation !== 'cumulative');
      value = scope.reduce((sum, candidate) => sum + getEffectValue(candidate), 0);
    }
    effectCache.set(line.id, value);
    return value;
  };

  lines.forEach((line) => {
    const totals = computeYearTotals(baseValueMap.get(line.id) ?? {});
    const baseValue = totals.get(selectedYear) ?? 0;
    const initiativeValue = getEffectValue(line);
    nodeMap.set(line.id, {
      line,
      children: [],
      baseValue,
      initiativeValue,
      totalValue: baseValue + initiativeValue
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

export const FinancialTreeScreen = () => {
  const { blueprint, loading, error } = useFinancialsState();
  const { list: initiatives } = useInitiativesState();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [stageFilter, setStageFilter] = useState<InitiativeStageKey[]>([...initiativeStageKeys]);

  const monthList = useMemo(() => (blueprint ? buildMonthIndex(blueprint.lines) : []), [blueprint]);
  const monthKeys = monthList.map((month) => month.key);
  const availableYears = useMemo(
    () => Array.from(new Set(monthList.map((month) => month.year))).sort((a, b) => a - b),
    [monthList]
  );
  const currentYear = new Date().getFullYear();
  const effectiveYear =
    selectedYear ??
    availableYears.find((year) => year >= currentYear) ??
    availableYears[0] ??
    currentYear;

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

  const childMap = useMemo(
    () => (blueprint ? buildChildMap(blueprint.lines) : new Map<string, string[]>()),
    [blueprint]
  );

  const valueMap = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    const manualMap = buildManualValueMap(blueprint.lines, monthKeys);
    return buildValueMap(blueprint.lines, monthKeys, childMap, manualMap);
  }, [blueprint, monthKeys, childMap]);

  const blueprintLineMap = useMemo(() => {
    const map = new Map<string, FinancialLineItem>();
    (blueprint?.lines ?? []).forEach((line) => map.set(line.code, line));
    return map;
  }, [blueprint]);

  const manualEffectMap = useMemo(() => {
    if (!blueprint) {
      return new Map<string, number>();
    }
    const map = new Map<string, number>();
    const filterSet = new Set(stageFilter);
    initiatives.forEach((initiative) => {
      if (filterSet.size > 0 && !filterSet.has(initiative.activeStage)) {
        return;
      }
      const stage = initiative.stages[initiative.activeStage];
      if (!stage) {
        return;
      }
      initiativeFinancialKinds.forEach((kind) => {
        stage.financials[kind].forEach((entry) => {
          if (!entry.lineCode) {
            return;
          }
          const blueprintLine = blueprintLineMap.get(entry.lineCode);
          if (!blueprintLine) {
            return;
          }
          const total = Object.entries(entry.distribution).reduce((sum, [monthKey, raw]) => {
            const parsed = parseMonthKey(monthKey);
            if (!parsed || parsed.year !== effectiveYear) {
              return sum;
            }
            const numeric = Number(raw);
            return Number.isFinite(numeric) ? sum + numeric : sum;
          }, 0);
          if (!total) {
            return;
          }
          map.set(blueprintLine.id, (map.get(blueprintLine.id) ?? 0) + total);
        });
      });
    });
    return map;
  }, [blueprint, initiatives, stageFilter, blueprintLineMap, effectiveYear]);

  const rootNode = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return null;
    }
    return buildTree(blueprint.lines, parentMap, childMap, valueMap, manualEffectMap, effectiveYear);
  }, [blueprint, parentMap, childMap, valueMap, manualEffectMap, effectiveYear, monthKeys.length]);

  const maxAbsValue = useMemo(() => {
    if (!rootNode) {
      return 0;
    }
    const stack = [rootNode];
    let max = 0;
    while (stack.length) {
      const node = stack.pop()!;
      max = Math.max(max, Math.abs(node.baseValue), Math.abs(node.totalValue));
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

  const layout = useMemo(() => {
    if (!rootNode) {
      return null;
    }
    const positions = new Map<string, { depth: number; x: number; y: number }>();
    const columnWidth = 260;
    const columnGap = 120;
    const cardWidth = 220;
    const cardHeight = 120;
    const verticalGap = 160;
    let leafIndex = 0;

    const compute = (node: TreeNode, depth: number): number => {
      if (!node.children.length) {
        const y = leafIndex * verticalGap;
        leafIndex += 1;
        positions.set(node.line.id, { depth, x: depth * (columnWidth + columnGap), y });
        return y;
      }
      const childYs = node.children.map((child) => compute(child, depth + 1));
      const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
      positions.set(node.line.id, { depth, x: depth * (columnWidth + columnGap), y });
      return y;
    };

    compute(rootNode, 0);
    const totalHeight = Math.max(leafIndex - 1, 0) * verticalGap + cardHeight;
    const maxDepth = Math.max(...Array.from(positions.values()).map((pos) => pos.depth));
    const width = (maxDepth + 1) * (columnWidth + columnGap);

    const connectors: { id: string; path: string }[] = [];
    const sortedNodes = Array.from(positions.entries());
    sortedNodes.forEach(([id, position]) => {
      const node = rootNode;
      const visit = (current: TreeNode) => {
        if (current.line.id === id) {
          current.children.forEach((child) => {
            const childPos = positions.get(child.line.id);
            if (!childPos) {
              return;
            }
            const startX = position.x + cardWidth;
            const startY = position.y + cardHeight / 2;
            const endX = childPos.x;
            const endY = childPos.y + cardHeight / 2;
            const elbowX = (startX + endX) / 2;
            const path = `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`;
            connectors.push({ id: `${id}-${child.line.id}`, path });
          });
        } else {
          current.children.forEach(visit);
        }
      };
      visit(node);
    });

    return {
      positions,
      width,
      height: totalHeight + cardHeight,
      cardWidth,
      cardHeight,
      connectors
    };
  }, [rootNode]);

  if (!blueprint || !rootNode || !layout) {
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
          <p>Visualize how each line item contributes to net profit for a selected year.</p>
        </div>
        <div className={styles.filters}>
          <label>
            <span>Year</span>
            <select
              value={effectiveYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Initiative stages</span>
            <div className={styles.stageCheckboxes}>
              {initiativeStageKeys.map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={stageFilter.includes(key)}
                    onChange={() =>
                      setStageFilter((prev) =>
                        prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key]
                      )
                    }
                  />
                  <span>{initiativeStageLabels[key]}</span>
                </label>
              ))}
              <button
                type="button"
                className={styles.stageResetButton}
                onClick={() => setStageFilter([...initiativeStageKeys])}
              >
                Select all
              </button>
            </div>
          </label>
        </div>
      </header>
      {error && (
        <div className={styles.errorBanner}>
          Unable to refresh blueprint data automatically. The view may be stale.
        </div>
      )}
      <div className={styles.treeCanvas} style={{ width: layout.width, height: layout.height }}>
        <svg className={styles.treeSvg} width={layout.width} height={layout.height}>
          {layout.connectors.map((connector) => (
            <path key={connector.id} d={connector.path} className={styles.connectorPath} />
          ))}
        </svg>
        {Array.from(layout.positions.entries()).map(([id, pos]) => {
          const nodeStack: TreeNode[] = [rootNode];
          let node: TreeNode | null = null;
          while (nodeStack.length && !node) {
            const current = nodeStack.pop()!;
            if (current.line.id === id) {
              node = current;
              break;
            }
            nodeStack.push(...current.children);
          }
          if (!node) {
            return null;
          }
          const scale = maxAbsValue || 1;
          const barWidth = (value: number) => `${Math.min(100, Math.abs(value) / scale * 100)}%`;
          return (
            <div
              key={id}
              className={styles.nodeCard}
              style={{
                width: layout.cardWidth,
                height: layout.cardHeight,
                transform: `translate(${pos.x}px, ${pos.y}px)`
              }}
            >
              <header>
                <h4>{node.line.name}</h4>
              </header>
              <div className={styles.simpleBars}>
                <div className={styles.simpleBarRow}>
                  <span>Base</span>
                  <div className={styles.simpleBarTrack}>
                    <div className={styles.simpleBarFillBase} style={{ width: barWidth(node.baseValue) }} />
                  </div>
                  <strong>{formatCurrency(node.baseValue)}</strong>
                </div>
                <div className={styles.simpleBarRow}>
                  <span>With initiatives</span>
                  <div className={styles.simpleBarTrack}>
                    <div className={styles.simpleBarFillTotal} style={{ width: barWidth(node.totalValue) }} />
                  </div>
                  <strong>{formatCurrency(node.totalValue)}</strong>
                </div>
                <div className={styles.deltaRow}>
                  <span>Initiatives delta</span>
                  <strong>{formatCurrency(node.initiativeValue)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
