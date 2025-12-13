import { useState, useMemo } from 'react';
import styles from './ReportingDemo.module.css';

// Types
export type DemoView = 'pnl-tree' | 'financial-outlook' | 'stage-gate';

interface TreeNodeData {
  id: string;
  name: string;
  baseValue: number;
  totalValue: number;
  children: TreeNodeData[];
}

interface MonthData {
  month: string;
  plan: number;
  actual: number;
}

interface Initiative {
  id: string;
  name: string;
  impact: number;
}

// P&L Tree data - matching the screenshot structure
const PNL_TREE: TreeNodeData = {
  id: 'net-profit',
  name: 'Net profit',
  baseValue: 90,
  totalValue: 90,
  children: [
    {
      id: 'ebit',
      name: 'EBIT',
      baseValue: 96,
      totalValue: 96,
      children: [
        {
          id: 'opex',
          name: 'Operating expenses',
          baseValue: -74,
          totalValue: -74,
          children: [
            { id: 'rent', name: 'Rent & infrastructure', baseValue: -18, totalValue: -18, children: [] },
            { id: 'marketing', name: 'Marketing programs', baseValue: -32, totalValue: -32, children: [] },
            { id: 'it', name: 'IT & tooling', baseValue: -24, totalValue: -24, children: [] }
          ]
        }
      ]
    },
    {
      id: 'interest',
      name: 'Interest & taxes',
      baseValue: -6,
      totalValue: -6,
      children: []
    },
    {
      id: 'depreciation',
      name: 'Depreciation & amortization',
      baseValue: -7,
      totalValue: -7,
      children: []
    }
  ]
};

// Financial Outlook data
const FINANCIAL_OUTLOOK: MonthData[] = [
  { month: 'Dec 25', plan: 0, actual: 0 },
  { month: 'Jan 26', plan: 0, actual: 0 },
  { month: 'Feb 26', plan: -7, actual: -7 },
  { month: 'Mar 26', plan: 3, actual: 3 },
  { month: 'Apr 26', plan: 2, actual: 2 },
  { month: 'May 26', plan: 5, actual: 5 },
  { month: 'Jun 26', plan: 6, actual: 6 },
  { month: 'Jul 26', plan: 9, actual: 9 },
  { month: 'Aug 26', plan: 10, actual: 10 }
];

// Stage-gate Pipeline data
const STAGE_COLUMNS = ['L0', 'L1 Gate', 'L1', 'L2 Gate', 'L2', 'L3 Gate', 'L3', 'L4 Gate'];

interface WorkstreamData {
  id: string;
  name: string;
  activeInitiatives: number;
  stages: Record<string, { count: number; impact: number; initiatives: Initiative[] }>;
}

const WORKSTREAMS: WorkstreamData[] = [
  {
    id: 'test',
    name: 'Test new workstream',
    activeInitiatives: 0,
    stages: {
      'L0': { count: 0, impact: 0, initiatives: [] },
      'L1 Gate': { count: 0, impact: 0, initiatives: [] },
      'L1': { count: 0, impact: 0, initiatives: [] },
      'L2 Gate': { count: 0, impact: 0, initiatives: [] },
      'L2': { count: 0, impact: 0, initiatives: [] },
      'L3 Gate': { count: 0, impact: 0, initiatives: [] },
      'L3': { count: 0, impact: 0, initiatives: [] },
      'L4 Gate': { count: 0, impact: 0, initiatives: [] }
    }
  },
  {
    id: 'innovation',
    name: 'Innovation',
    activeInitiatives: 9,
    stages: {
      'L0': { count: 4, impact: 1100, initiatives: [
        { id: 'i1', name: 'AI Customer Support', impact: 450 },
        { id: 'i2', name: 'IoT Sensors', impact: 320 },
        { id: 'i3', name: 'Blockchain Pilot', impact: 180 },
        { id: 'i4', name: 'ML Forecasting', impact: 150 }
      ]},
      'L1 Gate': { count: 3, impact: 1800, initiatives: [
        { id: 'i5', name: 'Cloud Migration', impact: 850 },
        { id: 'i6', name: 'Data Platform', impact: 550 },
        { id: 'i7', name: 'API Gateway', impact: 400 }
      ]},
      'L1': { count: 0, impact: 0, initiatives: [] },
      'L2 Gate': { count: 1, impact: 170, initiatives: [
        { id: 'i8', name: 'Mobile App v2', impact: 170 }
      ]},
      'L2': { count: 1, impact: 280, initiatives: [
        { id: 'i9', name: 'CRM Integration', impact: 280 }
      ]},
      'L3 Gate': { count: 0, impact: 0, initiatives: [] },
      'L3': { count: 0, impact: 0, initiatives: [] },
      'L4 Gate': { count: 0, impact: 0, initiatives: [] }
    }
  },
  {
    id: 'sga',
    name: 'SG&A',
    activeInitiatives: 3,
    stages: {
      'L0': { count: 3, impact: 80, initiatives: [
        { id: 's1', name: 'Process Automation', impact: 45 },
        { id: 's2', name: 'Vendor Consolidation', impact: 20 },
        { id: 's3', name: 'Office Optimization', impact: 15 }
      ]},
      'L1 Gate': { count: 0, impact: 0, initiatives: [] },
      'L1': { count: 0, impact: 0, initiatives: [] },
      'L2 Gate': { count: 0, impact: 0, initiatives: [] },
      'L2': { count: 0, impact: 0, initiatives: [] },
      'L3 Gate': { count: 0, impact: 0, initiatives: [] },
      'L3': { count: 0, impact: 0, initiatives: [] },
      'L4 Gate': { count: 0, impact: 0, initiatives: [] }
    }
  }
];

// Formatters
const formatCurrency = (value: number) => {
  if (value === 0) return '$0';
  const prefix = value < 0 ? '-' : '';
  const absVal = Math.abs(value);
  if (absVal >= 1000) {
    return `${prefix}$${(absVal / 1000).toFixed(1)}K`;
  }
  return `${prefix}$${absVal}`;
};

const formatDelta = (base: number, total: number) => {
  if (base === 0) return '0.0%';
  const delta = ((total - base) / Math.abs(base)) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
};

// View descriptions for the selector
export const VIEW_OPTIONS: { id: DemoView; title: string; shortTitle: string }[] = [
  { id: 'pnl-tree', title: 'P&L Impact Tree', shortTitle: 'P&L tree' },
  { id: 'financial-outlook', title: 'Plan vs Actuals', shortTitle: 'Financial outlook' },
  { id: 'stage-gate', title: 'Stage-Gate Pipeline', shortTitle: 'Stage-gate pipeline' }
];

interface ReportingDemoProps {
  className?: string;
  activeView: DemoView;
}

export const ReportingDemo = ({ className, activeView }: ReportingDemoProps) => {
  const [expandedWorkstreams, setExpandedWorkstreams] = useState<Set<string>>(new Set());

  const toggleWorkstream = (id: string) => {
    setExpandedWorkstreams(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // P&L Tree layout calculation
  const treeLayout = useMemo(() => {
    const cardWidth = 180;
    const cardHeight = 80;
    const horizontalGap = 100;
    const verticalGap = 20;
    const positions = new Map<string, { x: number; y: number }>();
    const connectors: { id: string; path: string }[] = [];

    let leafIndex = 0;
    const computePositions = (node: TreeNodeData, depth: number): number => {
      if (node.children.length === 0) {
        const y = leafIndex * (cardHeight + verticalGap);
        leafIndex++;
        positions.set(node.id, { x: depth * (cardWidth + horizontalGap), y });
        return y;
      }

      const childYs = node.children.map(child => computePositions(child, depth + 1));
      const y = childYs.reduce((sum, cy) => sum + cy, 0) / childYs.length;
      positions.set(node.id, { x: depth * (cardWidth + horizontalGap), y });

      // Create connectors
      node.children.forEach(child => {
        const parentPos = positions.get(node.id)!;
        const childPos = positions.get(child.id)!;
        const startX = parentPos.x + cardWidth;
        const startY = parentPos.y + cardHeight / 2;
        const endX = childPos.x;
        const endY = childPos.y + cardHeight / 2;
        const midX = (startX + endX) / 2;
        connectors.push({
          id: `${node.id}-${child.id}`,
          path: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`
        });
      });

      return y;
    };

    computePositions(PNL_TREE, 0);

    const allPositions = Array.from(positions.values());
    const maxX = Math.max(...allPositions.map(p => p.x)) + cardWidth;
    const maxY = Math.max(...allPositions.map(p => p.y)) + cardHeight;

    return { positions, connectors, width: maxX + 40, height: maxY + 40, cardWidth, cardHeight };
  }, []);

  // Calculate max values for stage-gate bars
  const maxStageValues = useMemo(() => {
    const maxCount = Math.max(
      ...WORKSTREAMS.flatMap(ws =>
        STAGE_COLUMNS.map(col => ws.stages[col]?.count || 0)
      ),
      1
    );
    const maxImpact = Math.max(
      ...WORKSTREAMS.flatMap(ws =>
        STAGE_COLUMNS.map(col => ws.stages[col]?.impact || 0)
      ),
      1
    );
    return { maxCount, maxImpact };
  }, []);

  // Portfolio totals
  const portfolioTotals = useMemo(() => {
    const totals: Record<string, { count: number; impact: number }> = {};
    STAGE_COLUMNS.forEach(col => {
      totals[col] = { count: 0, impact: 0 };
      WORKSTREAMS.forEach(ws => {
        totals[col].count += ws.stages[col]?.count || 0;
        totals[col].impact += ws.stages[col]?.impact || 0;
      });
    });
    return totals;
  }, []);

  const totalInitiatives = WORKSTREAMS.reduce((sum, ws) => sum + ws.activeInitiatives, 0);
  const totalImpact = Object.values(portfolioTotals).reduce((sum, t) => sum + t.impact, 0);

  // Render P&L Tree Node
  const renderTreeNode = (node: TreeNodeData) => {
    const pos = treeLayout.positions.get(node.id);
    if (!pos) return null;

    const isNegative = node.baseValue < 0;
    const maxAbs = Math.max(Math.abs(node.baseValue), Math.abs(node.totalValue), 1);
    const baseWidth = (Math.abs(node.baseValue) / maxAbs) * 100;
    const totalWidth = (Math.abs(node.totalValue) / maxAbs) * 100;

    return (
      <div
        key={node.id}
        className={styles.treeCard}
        style={{
          width: treeLayout.cardWidth,
          height: treeLayout.cardHeight,
          transform: `translate(${pos.x}px, ${pos.y}px)`
        }}
      >
        <div className={styles.treeCardHeader}>{node.name}</div>
        <div className={styles.treeCardChart}>
          <div className={styles.treeBarRow}>
            <span className={styles.treeBarLabel}>Base</span>
            <div className={styles.treeBarTrack}>
              <div
                className={`${styles.treeBarFill} ${isNegative ? styles.negative : styles.positive}`}
                style={{ width: `${Math.max(baseWidth, 2)}%` }}
              />
            </div>
            <span className={styles.treeBarValue}>{formatCurrency(node.baseValue)}</span>
          </div>
          <div className={styles.treeBarRow}>
            <span className={styles.treeBarLabel}>With initiatives</span>
            <div className={styles.treeBarTrack}>
              <div
                className={`${styles.treeBarFill} ${styles.initiatives} ${isNegative ? styles.negative : ''}`}
                style={{ width: `${Math.max(totalWidth, 2)}%` }}
              />
            </div>
            <span className={styles.treeBarValue}>
              {formatCurrency(node.totalValue)}
              <span className={styles.treeDelta}>{formatDelta(node.baseValue, node.totalValue)}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Flatten tree for rendering
  const flattenTree = (node: TreeNodeData): TreeNodeData[] => {
    return [node, ...node.children.flatMap(flattenTree)];
  };

  const allNodes = flattenTree(PNL_TREE);

  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      {/* Window chrome */}
      <div className={styles.windowChrome}>
        <div className={styles.windowControls}>
          <span className={styles.windowDot} data-color="red" />
          <span className={styles.windowDot} data-color="yellow" />
          <span className={styles.windowDot} data-color="green" />
        </div>
        <div className={styles.windowTitle}>
          {VIEW_OPTIONS.find(v => v.id === activeView)?.shortTitle || 'LaikaPro'}
        </div>
      </div>

      {/* Dashboard Content */}
      <div className={styles.dashboardContent}>
        {/* P&L Tree View */}
        {activeView === 'pnl-tree' && (
          <div className={styles.pnlTreeWrapper}>
            <div
              className={styles.treeCanvas}
              style={{ width: treeLayout.width, height: treeLayout.height }}
            >
              <svg className={styles.treeSvg} width={treeLayout.width} height={treeLayout.height}>
                {treeLayout.connectors.map(c => (
                  <path key={c.id} d={c.path} className={styles.connectorPath} />
                ))}
              </svg>
              {allNodes.map(renderTreeNode)}
            </div>
          </div>
        )}

        {/* Financial Outlook View */}
        {activeView === 'financial-outlook' && (
          <div className={styles.outlookWrapper}>
            <div className={styles.outlookHeader}>
              <div className={styles.outlookKpis}>
                <div className={styles.outlookKpi}>
                  <span className={styles.kpiLabel}>PLAN (FY)</span>
                  <div className={styles.kpiRows}>
                    <div className={styles.kpiRow}><span>FY2026</span><span>$9</span></div>
                    <div className={styles.kpiRow}><span>FY2027</span><span>$66</span></div>
                  </div>
                </div>
                <div className={styles.outlookKpi}>
                  <span className={styles.kpiLabel}>ACTUALS (FY)</span>
                  <div className={styles.kpiRows}>
                    <div className={styles.kpiRow}><span>FY2026</span><span>$0</span></div>
                    <div className={styles.kpiRow}><span>FY2027</span><span>$0</span></div>
                  </div>
                </div>
                <div className={styles.outlookKpi}>
                  <span className={styles.kpiLabel}>RUN RATE (LAST 12 MONTHS)</span>
                  <div className={styles.kpiBig}>$75</div>
                  <span className={styles.kpiMeta}>Actual: $0 · Delta: -$75</span>
                </div>
                <div className={styles.outlookKpi}>
                  <span className={styles.kpiLabel}>ROI (ACTUAL VS PLAN)</span>
                  <div className={styles.kpiBig}>—</div>
                  <span className={styles.kpiMeta}>Plan: 1,500% · Delta: —</span>
                </div>
              </div>
            </div>
            <div className={styles.chartSection}>
              <div className={styles.chartTitle}>PLAN VS ACTUALS</div>
              <div className={styles.chartArea}>
                <svg className={styles.lineChart} viewBox="0 0 400 150" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="75" x2="400" y2="75" stroke="#e2e8f0" strokeWidth="1" />

                  {/* Plan line (main) */}
                  <polyline
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    points={FINANCIAL_OUTLOOK.map((d, i) => {
                      const x = (i / (FINANCIAL_OUTLOOK.length - 1)) * 380 + 10;
                      const y = 75 - (d.plan / 15) * 60;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Data points with values */}
                  {FINANCIAL_OUTLOOK.map((d, i) => {
                    const x = (i / (FINANCIAL_OUTLOOK.length - 1)) * 380 + 10;
                    const y = 75 - (d.plan / 15) * 60;
                    return (
                      <g key={i}>
                        <circle cx={x} cy={y} r="4" fill="#22d3ee" />
                        <text x={x} y={y - 10} textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="600">
                          {d.plan === 0 ? '$0' : `$${d.plan}`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className={styles.chartXAxis}>
                  {FINANCIAL_OUTLOOK.map((d, i) => (
                    <span key={i}>{d.month}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stage-Gate Pipeline View */}
        {activeView === 'stage-gate' && (
          <div className={styles.pipelineWrapper}>
            <div className={styles.pipelineTable}>
              {/* Header */}
              <div className={styles.pipelineHeader}>
                <div className={styles.pipelineHeaderCell} style={{ width: 180 }}>WORKSTREAM</div>
                <div className={styles.pipelineHeaderCell} style={{ width: 140 }}>METRIC</div>
                {STAGE_COLUMNS.map(col => (
                  <div key={col} className={styles.pipelineHeaderCell}>{col}</div>
                ))}
              </div>

              {/* Workstream rows */}
              {WORKSTREAMS.map(ws => {
                const isExpanded = expandedWorkstreams.has(ws.id);
                return (
                  <div key={ws.id} className={styles.workstreamGroup}>
                    {/* Recurring impact row */}
                    <div className={styles.pipelineRow}>
                      <div className={styles.workstreamCell} style={{ width: 180 }}>
                        <button
                          className={styles.expandBtn}
                          onClick={() => toggleWorkstream(ws.id)}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                        <div>
                          <div className={styles.workstreamName}>{ws.name}</div>
                          <div className={styles.workstreamMeta}>
                            {ws.activeInitiatives} active initiatives
                          </div>
                        </div>
                      </div>
                      <div className={styles.metricCell} style={{ width: 140 }}>
                        <span className={styles.metricLabel}>RECURRING IMPACT</span>
                        <strong>{formatCurrency(Object.values(ws.stages).reduce((s, st) => s + st.impact, 0) * 1000)}</strong>
                      </div>
                      {STAGE_COLUMNS.map(col => {
                        const data = ws.stages[col];
                        const width = data.impact > 0 ? (data.impact / maxStageValues.maxImpact) * 100 : 0;
                        return (
                          <div key={col} className={styles.valueCell}>
                            <div className={styles.barTrack}>
                              <div
                                className={`${styles.barFill} ${styles.impactBar}`}
                                style={{ width: `${width}%` }}
                              />
                              <span className={styles.barValue}>
                                {data.impact > 0 ? formatCurrency(data.impact * 1000) : '$0'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Initiatives count row */}
                    <div className={styles.pipelineRow}>
                      <div className={styles.workstreamCell} style={{ width: 180 }} />
                      <div className={styles.metricCell} style={{ width: 140 }}>
                        <span className={styles.metricLabel}>INITIATIVES</span>
                        <strong>{ws.activeInitiatives}</strong>
                      </div>
                      {STAGE_COLUMNS.map(col => {
                        const data = ws.stages[col];
                        const width = data.count > 0 ? (data.count / maxStageValues.maxCount) * 100 : 0;
                        return (
                          <div key={col} className={styles.valueCell}>
                            <div className={styles.barTrack}>
                              <div
                                className={`${styles.barFill} ${styles.countBar}`}
                                style={{ width: `${width}%` }}
                              />
                              <span className={styles.barValue}>{data.count}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expanded initiatives */}
                    {isExpanded && ws.stages['L0'].initiatives.length > 0 && (
                      <div className={styles.initiativesList}>
                        {Object.entries(ws.stages).map(([stage, data]) =>
                          data.initiatives.map(init => (
                            <div key={init.id} className={styles.initiativeRow}>
                              <div style={{ width: 180, paddingLeft: 36 }}>{init.name}</div>
                              <div style={{ width: 140 }}>{stage}</div>
                              <div>{formatCurrency(init.impact * 1000)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Portfolio total row */}
              <div className={`${styles.pipelineRow} ${styles.totalRow}`}>
                <div className={styles.workstreamCell} style={{ width: 180 }}>
                  <div>
                    <div className={styles.workstreamName}>Portfolio total</div>
                    <div className={styles.workstreamMeta}>{totalInitiatives} active initiatives</div>
                  </div>
                </div>
                <div className={styles.metricCell} style={{ width: 140 }}>
                  <span className={styles.metricLabel}>RECURRING IMPACT</span>
                  <strong>{formatCurrency(totalImpact * 1000)}</strong>
                </div>
                {STAGE_COLUMNS.map(col => {
                  const data = portfolioTotals[col];
                  const width = data.impact > 0 ? (data.impact / maxStageValues.maxImpact) * 100 : 0;
                  return (
                    <div key={col} className={styles.valueCell}>
                      <div className={`${styles.barTrack} ${styles.totalBarTrack}`}>
                        <div
                          className={`${styles.barFill} ${styles.impactBar} ${styles.totalBarFill}`}
                          style={{ width: `${width}%` }}
                        />
                        <span className={styles.barValue}>
                          {data.impact > 0 ? formatCurrency(data.impact * 1000) : '$0'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Portfolio initiatives row */}
              <div className={`${styles.pipelineRow} ${styles.totalRow}`}>
                <div className={styles.workstreamCell} style={{ width: 180 }} />
                <div className={styles.metricCell} style={{ width: 140 }}>
                  <span className={styles.metricLabel}>INITIATIVES</span>
                  <strong>{totalInitiatives}</strong>
                </div>
                {STAGE_COLUMNS.map(col => {
                  const data = portfolioTotals[col];
                  const width = data.count > 0 ? (data.count / maxStageValues.maxCount) * 100 : 0;
                  return (
                    <div key={col} className={styles.valueCell}>
                      <div className={`${styles.barTrack} ${styles.totalBarTrack}`}>
                        <div
                          className={`${styles.barFill} ${styles.countBar} ${styles.totalBarFill}`}
                          style={{ width: `${width}%` }}
                        />
                        <span className={styles.barValue}>{data.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
