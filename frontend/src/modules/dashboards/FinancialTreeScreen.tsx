import { useEffect, useMemo, useState } from 'react';
import styles from '../../styles/FinancialTreeScreen.module.css';
import { useFinancialsState, useInitiativesState } from '../../app/state/AppStateContext';
import { FinancialLineItem } from '../../shared/types/financials';
import {
  initiativeStageKeys,
  initiativeStageLabels,
  initiativeFinancialKinds,
  InitiativeStageKey
} from '../../shared/types/initiative';
import {
  buildCumulativeLookup,
  buildEmptyRecord,
  buildManualValueMap,
  buildMonthIndex,
  buildValueMap,
  lineEffect,
  parseMonthKey
} from '../../shared/utils/financialMath';

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
  baseValueMap: Map<string, Record<string, number>>,
  initiativeValueMap: Map<string, Record<string, number>>,
  selectedYear: number
) => {
  const nodeMap = new Map<string, TreeNode>();

  lines.forEach((line) => {
    const baseTotals = computeYearTotals(baseValueMap.get(line.id) ?? {});
    const initiativeTotals = computeYearTotals(initiativeValueMap.get(line.id) ?? {});
    const baseValue = baseTotals.get(selectedYear) ?? 0;
    const initiativeValue = initiativeTotals.get(selectedYear) ?? 0;
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
  const { blueprint, loading, error, refresh } = useFinancialsState();
  const { list: initiatives } = useInitiativesState();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [stageFilter, setStageFilter] = useState<InitiativeStageKey[]>([...initiativeStageKeys]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [refreshRequested, setRefreshRequested] = useState(false);

  useEffect(() => {
    if (!blueprint && !loading && !refreshRequested) {
      setRefreshRequested(true);
      void refresh();
    }
  }, [blueprint, loading, refresh, refreshRequested]);

  useEffect(() => {
    if (!blueprint) {
      return;
    }
    const handle = setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(handle);
  }, [blueprint, refresh]);

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

  const manualValueMap = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    return buildManualValueMap(blueprint.lines, monthKeys);
  }, [blueprint, monthKeys]);

  const cumulativeLookup = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    return buildCumulativeLookup(blueprint.lines, monthKeys, manualValueMap);
  }, [blueprint, monthKeys, manualValueMap]);

  const valueMap = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    return buildValueMap(blueprint.lines, monthKeys, childMap, manualValueMap, cumulativeLookup);
  }, [blueprint, monthKeys, childMap, manualValueMap, cumulativeLookup]);

  const blueprintLineMap = useMemo(() => {
    const map = new Map<string, FinancialLineItem>();
    (blueprint?.lines ?? []).forEach((line) => map.set(line.code.toUpperCase(), line));
    return map;
  }, [blueprint]);

  const initiativeManualMap = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    const map = new Map<string, Record<string, number>>();
    const filterSet = new Set(stageFilter);
    const monthSet = new Set(monthKeys);
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
          const normalizedCode = entry.lineCode?.trim().toUpperCase();
          if (!normalizedCode) {
            return;
          }
          const blueprintLine = blueprintLineMap.get(normalizedCode);
          if (!blueprintLine || blueprintLine.computation !== 'manual') {
            return;
          }
          if (!map.has(blueprintLine.id)) {
            map.set(blueprintLine.id, buildEmptyRecord(monthKeys));
          }
          const record = map.get(blueprintLine.id)!;
          Object.entries(entry.distribution).forEach(([monthKey, raw]) => {
            if (!monthSet.has(monthKey)) {
              return;
            }
            const numeric = Number(raw);
            if (!Number.isFinite(numeric)) {
              return;
            }
            record[monthKey] += numeric * lineEffect(blueprintLine);
          });
        });
      });
    });
    return map;
  }, [blueprint, initiatives, stageFilter, blueprintLineMap, monthKeys]);

  const initiativeLookup = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    return buildCumulativeLookup(blueprint.lines, monthKeys, initiativeManualMap);
  }, [blueprint, monthKeys, initiativeManualMap]);

  const initiativeValueMap = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return new Map<string, Record<string, number>>();
    }
    return buildValueMap(blueprint.lines, monthKeys, childMap, initiativeManualMap, initiativeLookup);
  }, [blueprint, monthKeys, childMap, initiativeManualMap, initiativeLookup]);

  const rootNode = useMemo(() => {
    if (!blueprint || !monthKeys.length) {
      return null;
    }
    return buildTree(blueprint.lines, parentMap, valueMap, initiativeValueMap, effectiveYear);
  }, [blueprint, parentMap, valueMap, initiativeValueMap, effectiveYear, monthKeys.length]);

  const nodeLookup = useMemo(() => {
    if (!rootNode) {
      return new Map<string, TreeNode>();
    }
    const map = new Map<string, TreeNode>();
    const stack = [rootNode];
    while (stack.length) {
      const node = stack.pop()!;
      map.set(node.line.id, node);
      stack.push(...node.children);
    }
    return map;
  }, [rootNode]);

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
    const cardWidth = 210;
    const columnWidth = cardWidth;
    const columnGap = 80;
    const cardHeight = 160;
    const verticalGap = 140;
    const horizontalPadding = 80;
    const verticalPadding = 30;
    let leafIndex = 0;

    const compute = (node: TreeNode, depth: number): number => {
      if (!node.children.length) {
        const y = verticalPadding + leafIndex * verticalGap;
        leafIndex += 1;
        positions.set(node.line.id, {
          depth,
          x: horizontalPadding + depth * (columnWidth + columnGap),
          y
        });
        return y;
      }
      const childYs = node.children.map((child) => compute(child, depth + 1));
      const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
      positions.set(node.line.id, {
        depth,
        x: horizontalPadding + depth * (columnWidth + columnGap),
        y
      });
      return y;
    };

    compute(rootNode, 0);
    const totalHeight = Math.max(leafIndex - 1, 0) * verticalGap + cardHeight + verticalPadding * 2;
    const depthValues = Array.from(positions.values()).map((pos) => pos.depth);
    const maxDepth = depthValues.length ? Math.max(...depthValues) : 0;
    const width = horizontalPadding * 2 + (maxDepth + 1) * (columnWidth + columnGap);

    const connectors: { id: string; path: string }[] = [];
    const stack = [rootNode];
    while (stack.length) {
      const node = stack.pop()!;
      const position = positions.get(node.line.id);
      if (!position) {
        continue;
      }
      node.children.forEach((child) => {
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
        connectors.push({ id: `${node.line.id}-${child.line.id}`, path });
        stack.push(child);
      });
    }

    return {
      positions,
      width,
      height: totalHeight,
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
          <div className={styles.dropdown} onMouseLeave={() => setDropdownOpen(false)}>
            <button
              type="button"
              className={styles.dropdownTrigger}
              onClick={() => setDropdownOpen((prev) => !prev)}
            >
              {`Stage gates (${stageFilter.length}/${initiativeStageKeys.length})`}
            </button>
            {dropdownOpen && (
              <div className={styles.dropdownPanel}>
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
                <button type="button" onClick={() => setStageFilter([...initiativeStageKeys])}>
                  Select all
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {error && (
        <div className={styles.errorBanner}>
          Unable to refresh blueprint data automatically. The view may be stale.
        </div>
      )}
      <div className={styles.treeWrapper}>
        <div className={styles.treeCanvas} style={{ width: layout.width, height: layout.height }}>
          <svg className={styles.treeSvg} width={layout.width} height={layout.height}>
            {layout.connectors.map((connector) => (
              <path key={connector.id} d={connector.path} className={styles.connectorPath} />
            ))}
          </svg>
          {Array.from(layout.positions.entries()).map(([id, pos]) => {
            const node = nodeLookup.get(id);
            if (!node) {
              return null;
            }
            const scale = maxAbsValue || 1;
            const barHeight = (value: number) => {
              if (!scale || value === 0) {
                return '0%';
              }
              const ratio = Math.abs(value) / scale;
              const percentage = Math.max(8, Math.min(100, ratio * 100));
              return `${percentage}%`;
            };
            const delta =
              node.baseValue === 0 ? null : Math.min(999, Math.max(-999, node.totalValue / node.baseValue - 1));
            const formattedDelta = delta === null ? '—' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`;
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
                <div className={styles.barChart}>
                  <div className={styles.barColumn}>
                    <div className={styles.barValueRow}>
                      <div className={styles.barValue}>{formatCurrency(node.baseValue)}</div>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${styles.barFillBase} ${
                          node.baseValue < 0 ? styles.barNegative : ''
                        }`}
                        style={{ height: barHeight(node.baseValue) }}
                      />
                    </div>
                    <span className={styles.barLabel}>Base</span>
                  </div>
                  <div className={`${styles.barColumn} ${styles.barColumnEmphasis}`}>
                    <div className={styles.barValueRow}>
                      <div className={styles.barValue}>{formatCurrency(node.totalValue)}</div>
                      <div className={styles.deltaBadge}>{formattedDelta}</div>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${styles.barFillTotal} ${
                          node.totalValue < 0 ? styles.barNegative : ''
                        }`}
                        style={{ height: barHeight(node.totalValue) }}
                      />
                    </div>
                    <span className={styles.barLabel}>With initiatives</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
