import { useState, useMemo } from 'react';
import styles from './ReportingDemo.module.css';

// Types
export type DemoView = 'pnl-tree' | 'financial-outlook' | 'stage-gate';

interface TreeNodeData {
  id: string;
  name: string;
  baseValue: number;
  withInitiatives: number;
  children: TreeNodeData[];
}

interface MonthData {
  month: string;
  baseline: number;
  initiatives: number;
  plan: number;
}

interface Initiative {
  id: string;
  name: string;
  impact: number;
}

// =============================================
// P&L TREE DATA - Starting from EBITDA, 3 levels
// Structure: EBITDA -> (Gross Profit, OpEx) -> (Revenue, COGS, Sales & Marketing, R&D, G&A)
// =============================================
const PNL_TREE: TreeNodeData = {
  id: 'ebitda',
  name: 'EBITDA',
  baseValue: 2400,
  withInitiatives: 3150,
  children: [
    {
      id: 'gross-profit',
      name: 'Gross Profit',
      baseValue: 5800,
      withInitiatives: 6400,
      children: [
        { id: 'revenue', name: 'Revenue', baseValue: 12500, withInitiatives: 13800, children: [] },
        { id: 'cogs', name: 'COGS', baseValue: -6700, withInitiatives: -7400, children: [] }
      ]
    },
    {
      id: 'opex',
      name: 'Operating Expenses',
      baseValue: -3400,
      withInitiatives: -3250,
      children: [
        { id: 'sales-marketing', name: 'Sales & Marketing', baseValue: -1400, withInitiatives: -1350, children: [] },
        { id: 'rd', name: 'R&D', baseValue: -1200, withInitiatives: -1100, children: [] },
        { id: 'ga', name: 'G&A', baseValue: -800, withInitiatives: -800, children: [] }
      ]
    }
  ]
};

// =============================================
// FINANCIAL OUTLOOK DATA - Plan vs Actuals with baseline + initiatives
// Showing a 12-month period with improving performance
// =============================================
const FINANCIAL_OUTLOOK: MonthData[] = [
  { month: 'Jan', baseline: 180, initiatives: 0, plan: 200 },
  { month: 'Feb', baseline: 195, initiatives: 15, plan: 220 },
  { month: 'Mar', baseline: 210, initiatives: 45, plan: 250 },
  { month: 'Apr', baseline: 200, initiatives: 80, plan: 270 },
  { month: 'May', baseline: 225, initiatives: 95, plan: 300 },
  { month: 'Jun', baseline: 240, initiatives: 130, plan: 340 },
  { month: 'Jul', baseline: 235, initiatives: 165, plan: 380 },
  { month: 'Aug', baseline: 250, initiatives: 190, plan: 410 },
  { month: 'Sep', baseline: 260, initiatives: 220, plan: 450 },
  { month: 'Oct', baseline: 275, initiatives: 260, plan: 500 },
  { month: 'Nov', baseline: 280, initiatives: 300, plan: 550 },
  { month: 'Dec', baseline: 290, initiatives: 350, plan: 600 }
];

// =============================================
// STAGE-GATE PIPELINE DATA
// =============================================
const STAGE_COLUMNS = ['L0', 'L1 Gate', 'L1', 'L2 Gate', 'L2', 'L3'];

interface WorkstreamData {
  id: string;
  name: string;
  color: string;
  stages: Record<string, { count: number; impact: number; initiatives: Initiative[] }>;
}

const WORKSTREAMS: WorkstreamData[] = [
  {
    id: 'digital',
    name: 'Digital Transformation',
    color: '#8b5cf6',
    stages: {
      'L0': { count: 3, impact: 890, initiatives: [
        { id: 'd1', name: 'AI-Powered Analytics', impact: 420 },
        { id: 'd2', name: 'Cloud Migration Phase 2', impact: 280 },
        { id: 'd3', name: 'API Modernization', impact: 190 }
      ]},
      'L1 Gate': { count: 2, impact: 650, initiatives: [
        { id: 'd4', name: 'Customer Data Platform', impact: 380 },
        { id: 'd5', name: 'ML Recommendation Engine', impact: 270 }
      ]},
      'L1': { count: 1, impact: 520, initiatives: [
        { id: 'd6', name: 'Real-time Inventory System', impact: 520 }
      ]},
      'L2 Gate': { count: 1, impact: 340, initiatives: [
        { id: 'd7', name: 'Mobile App Redesign', impact: 340 }
      ]},
      'L2': { count: 2, impact: 780, initiatives: [
        { id: 'd8', name: 'E-commerce Platform', impact: 450 },
        { id: 'd9', name: 'Omnichannel Integration', impact: 330 }
      ]},
      'L3': { count: 1, impact: 620, initiatives: [
        { id: 'd10', name: 'Predictive Maintenance', impact: 620 }
      ]}
    }
  },
  {
    id: 'ops',
    name: 'Operational Excellence',
    color: '#3b82f6',
    stages: {
      'L0': { count: 2, impact: 450, initiatives: [
        { id: 'o1', name: 'Supply Chain Optimization', impact: 280 },
        { id: 'o2', name: 'Warehouse Automation', impact: 170 }
      ]},
      'L1 Gate': { count: 1, impact: 320, initiatives: [
        { id: 'o3', name: 'Quality Control AI', impact: 320 }
      ]},
      'L1': { count: 2, impact: 590, initiatives: [
        { id: 'o4', name: 'Lean Manufacturing', impact: 340 },
        { id: 'o5', name: 'Vendor Management System', impact: 250 }
      ]},
      'L2 Gate': { count: 0, impact: 0, initiatives: [] },
      'L2': { count: 1, impact: 410, initiatives: [
        { id: 'o6', name: 'Process Automation', impact: 410 }
      ]},
      'L3': { count: 1, impact: 380, initiatives: [
        { id: 'o7', name: 'Carbon Footprint Reduction', impact: 380 }
      ]}
    }
  },
  {
    id: 'cx',
    name: 'Customer Experience',
    color: '#22d3ee',
    stages: {
      'L0': { count: 1, impact: 290, initiatives: [
        { id: 'c1', name: 'Voice of Customer Platform', impact: 290 }
      ]},
      'L1 Gate': { count: 2, impact: 480, initiatives: [
        { id: 'c2', name: 'Personalization Engine', impact: 310 },
        { id: 'c3', name: 'Loyalty Program 2.0', impact: 170 }
      ]},
      'L1': { count: 1, impact: 360, initiatives: [
        { id: 'c4', name: 'Self-Service Portal', impact: 360 }
      ]},
      'L2 Gate': { count: 1, impact: 240, initiatives: [
        { id: 'c5', name: 'Chatbot Enhancement', impact: 240 }
      ]},
      'L2': { count: 1, impact: 420, initiatives: [
        { id: 'c6', name: 'CRM Integration', impact: 420 }
      ]},
      'L3': { count: 0, impact: 0, initiatives: [] }
    }
  }
];

// Formatters
const formatCurrency = (value: number, compact = true) => {
  if (value === 0) return '$0';
  const prefix = value < 0 ? '-' : '';
  const absVal = Math.abs(value);
  if (compact && absVal >= 1000) {
    return `${prefix}$${(absVal / 1000).toFixed(1)}K`;
  }
  return `${prefix}$${absVal}`;
};

const formatDelta = (base: number, withInit: number) => {
  if (base === 0) return '+∞';
  const delta = ((withInit - base) / Math.abs(base)) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`;
};

// View descriptions
export const VIEW_OPTIONS: { id: DemoView; title: string; shortTitle: string }[] = [
  { id: 'pnl-tree', title: 'P&L Impact Tree', shortTitle: 'P&L tree' },
  { id: 'financial-outlook', title: 'Plan vs Actuals', shortTitle: 'Financial outlook actuals' },
  { id: 'stage-gate', title: 'Stage-Gate Pipeline', shortTitle: 'Stage-gate pipeline' }
];

interface ReportingDemoProps {
  className?: string;
  activeView: DemoView;
}

export const ReportingDemo = ({ className, activeView }: ReportingDemoProps) => {
  const [expandedWorkstreams, setExpandedWorkstreams] = useState<Set<string>>(new Set(['digital']));
  const [hoveredBar, setHoveredBar] = useState<{ month: string; type: 'actual' | 'plan' } | null>(null);

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

  // =============================================
  // P&L TREE LAYOUT - Compact, fits without scroll
  // =============================================
  const treeLayout = useMemo(() => {
    const cardWidth = 140;
    const cardHeight = 58;
    const horizontalGap = 60;
    const verticalGap = 8;
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

    return { positions, connectors, width: maxX + 20, height: maxY + 20, cardWidth, cardHeight };
  }, []);

  // Calculate max values for charts
  const outlookMax = useMemo(() => {
    const maxActual = Math.max(...FINANCIAL_OUTLOOK.map(d => d.baseline + d.initiatives));
    const maxPlan = Math.max(...FINANCIAL_OUTLOOK.map(d => d.plan));
    return Math.max(maxActual, maxPlan) * 1.1;
  }, []);

  // Stage-gate totals
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

  const maxStageValues = useMemo(() => {
    const maxCount = Math.max(
      ...WORKSTREAMS.flatMap(ws => STAGE_COLUMNS.map(col => ws.stages[col]?.count || 0)),
      1
    );
    const maxImpact = Math.max(
      ...WORKSTREAMS.flatMap(ws => STAGE_COLUMNS.map(col => ws.stages[col]?.impact || 0)),
      1
    );
    return { maxCount, maxImpact };
  }, []);

  const totalInitiatives = WORKSTREAMS.reduce((sum, ws) =>
    sum + STAGE_COLUMNS.reduce((s, col) => s + (ws.stages[col]?.count || 0), 0), 0
  );
  const totalImpact = Object.values(portfolioTotals).reduce((sum, t) => sum + t.impact, 0);

  // Flatten tree for rendering
  const flattenTree = (node: TreeNodeData): TreeNodeData[] => {
    return [node, ...node.children.flatMap(flattenTree)];
  };
  const allNodes = flattenTree(PNL_TREE);

  // Render P&L Tree Node
  const renderTreeNode = (node: TreeNodeData) => {
    const pos = treeLayout.positions.get(node.id);
    if (!pos) return null;

    const isNegative = node.baseValue < 0;
    const delta = node.withInitiatives - node.baseValue;
    const deltaPercent = formatDelta(node.baseValue, node.withInitiatives);
    const isPositiveDelta = delta > 0;
    const maxVal = Math.max(Math.abs(node.baseValue), Math.abs(node.withInitiatives));
    const baseWidth = maxVal > 0 ? (Math.abs(node.baseValue) / maxVal) * 100 : 0;
    const initWidth = maxVal > 0 ? (Math.abs(node.withInitiatives) / maxVal) * 100 : 0;

    return (
      <div
        key={node.id}
        className={styles.treeCard}
        style={{
          width: treeLayout.cardWidth,
          transform: `translate(${pos.x}px, ${pos.y}px)`
        }}
      >
        <div className={styles.treeCardHeader}>
          <span className={styles.treeCardName}>{node.name}</span>
          <span className={`${styles.treeCardDelta} ${isPositiveDelta ? styles.positive : styles.negative}`}>
            {deltaPercent}
          </span>
        </div>
        <div className={styles.treeCardBars}>
          <div className={styles.treeBarGroup}>
            <div className={styles.treeBarTrack}>
              <div
                className={`${styles.treeBarBase} ${isNegative ? styles.negativeBar : ''}`}
                style={{ width: `${baseWidth}%` }}
              />
            </div>
            <span className={styles.treeBarValue}>{formatCurrency(node.baseValue)}</span>
          </div>
          <div className={styles.treeBarGroup}>
            <div className={styles.treeBarTrack}>
              <div
                className={`${styles.treeBarInit} ${isNegative ? styles.negativeBar : ''}`}
                style={{ width: `${initWidth}%` }}
              />
            </div>
            <span className={styles.treeBarValue}>{formatCurrency(node.withInitiatives)}</span>
          </div>
        </div>
      </div>
    );
  };

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

      {/* Dashboard Content - Fixed height */}
      <div className={styles.dashboardContent}>
        {/* P&L Tree View */}
        {activeView === 'pnl-tree' && (
          <div className={styles.pnlTreeWrapper}>
            <div className={styles.treeHeader}>
              <h3>P&L Impact Analysis</h3>
              <div className={styles.treeLegend}>
                <span><span className={styles.legendDotBase} /> Baseline</span>
                <span><span className={styles.legendDotInit} /> With Initiatives</span>
              </div>
            </div>
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
              <h3>Financial Outlook</h3>
              <div className={styles.outlookLegend}>
                <span><span className={styles.legendBarBase} /> Baseline</span>
                <span><span className={styles.legendBarInit} /> Initiatives</span>
                <span><span className={styles.legendLine} /> Plan</span>
              </div>
            </div>
            <div className={styles.chartContainer}>
              {/* Y-axis labels */}
              <div className={styles.yAxisLabels}>
                <span>$600K</span>
                <span>$400K</span>
                <span>$200K</span>
                <span>$0</span>
              </div>

              {/* Chart area */}
              <div className={styles.chartArea}>
                {/* Grid lines */}
                <div className={styles.gridLines}>
                  <div className={styles.gridLine} />
                  <div className={styles.gridLine} />
                  <div className={styles.gridLine} />
                  <div className={styles.gridLine} />
                </div>

                {/* Bars */}
                <div className={styles.barsContainer}>
                  {FINANCIAL_OUTLOOK.map((d, i) => {
                    const actualTotal = d.baseline + d.initiatives;
                    const actualHeight = (actualTotal / outlookMax) * 100;
                    const baselineHeight = (d.baseline / outlookMax) * 100;
                    const initiativesHeight = (d.initiatives / outlookMax) * 100;
                    const isHovered = hoveredBar?.month === d.month;

                    return (
                      <div key={d.month} className={styles.barColumn}>
                        <div
                          className={`${styles.stackedBar} ${isHovered ? styles.hovered : ''}`}
                          style={{ height: `${actualHeight}%` }}
                          onMouseEnter={() => setHoveredBar({ month: d.month, type: 'actual' })}
                          onMouseLeave={() => setHoveredBar(null)}
                        >
                          {d.initiatives > 0 && (
                            <div
                              className={styles.barSegmentInit}
                              style={{ height: `${(initiativesHeight / actualHeight) * 100}%` }}
                            />
                          )}
                          <div
                            className={styles.barSegmentBase}
                            style={{ height: `${(baselineHeight / actualHeight) * 100}%` }}
                          />
                        </div>

                        {/* Tooltip */}
                        {isHovered && (
                          <div className={styles.barTooltip}>
                            <strong>{d.month}</strong>
                            <div className={styles.tooltipRow}>
                              <span className={styles.tooltipDotBase} />
                              <span>Baseline: {formatCurrency(d.baseline * 1000, true)}</span>
                            </div>
                            <div className={styles.tooltipRow}>
                              <span className={styles.tooltipDotInit} />
                              <span>Initiatives: {formatCurrency(d.initiatives * 1000, true)}</span>
                            </div>
                            <div className={styles.tooltipTotal}>
                              Total: {formatCurrency(actualTotal * 1000, true)}
                            </div>
                          </div>
                        )}

                        <span className={styles.monthLabel}>{d.month}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Plan line */}
                <svg className={styles.planLineSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    className={styles.planLine}
                    points={FINANCIAL_OUTLOOK.map((d, i) => {
                      const x = (i / (FINANCIAL_OUTLOOK.length - 1)) * 100;
                      const y = 100 - (d.plan / outlookMax) * 100;
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                  {FINANCIAL_OUTLOOK.map((d, i) => {
                    const x = (i / (FINANCIAL_OUTLOOK.length - 1)) * 100;
                    const y = 100 - (d.plan / outlookMax) * 100;
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="1.5"
                        className={styles.planDot}
                      />
                    );
                  })}
                </svg>

                {/* Plan value labels */}
                <div className={styles.planLabels}>
                  {FINANCIAL_OUTLOOK.filter((_, i) => i % 3 === 0 || i === FINANCIAL_OUTLOOK.length - 1).map((d, i) => {
                    const actualIndex = i === 0 ? 0 : i * 3 >= FINANCIAL_OUTLOOK.length - 1 ? FINANCIAL_OUTLOOK.length - 1 : i * 3;
                    const bottom = (FINANCIAL_OUTLOOK[actualIndex].plan / outlookMax) * 100 + 3;
                    const left = (actualIndex / (FINANCIAL_OUTLOOK.length - 1)) * 100;
                    return (
                      <span
                        key={actualIndex}
                        className={styles.planLabel}
                        style={{ bottom: `${bottom}%`, left: `${left}%` }}
                      >
                        {formatCurrency(FINANCIAL_OUTLOOK[actualIndex].plan * 1000, true)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* KPI summary */}
            <div className={styles.outlookKpis}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>YTD Actual</span>
                <span className={styles.kpiValue}>$4.2M</span>
                <span className={styles.kpiDelta}>+18% vs plan</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Initiative Impact</span>
                <span className={styles.kpiValue}>$1.9M</span>
                <span className={styles.kpiDelta}>45% of total</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Run Rate</span>
                <span className={styles.kpiValue}>$640K/mo</span>
                <span className={styles.kpiDelta}>+12% MoM</span>
              </div>
            </div>
          </div>
        )}

        {/* Stage-Gate Pipeline View */}
        {activeView === 'stage-gate' && (
          <div className={styles.pipelineWrapper}>
            <div className={styles.pipelineHeader}>
              <h3>Pipeline Overview</h3>
              <div className={styles.pipelineStats}>
                <span>{totalInitiatives} initiatives</span>
                <span className={styles.statDivider}>•</span>
                <span className={styles.statHighlight}>{formatCurrency(totalImpact * 1000)} impact</span>
              </div>
            </div>

            <div className={styles.pipelineTable}>
              {/* Header */}
              <div className={styles.pipelineTableHeader}>
                <div className={styles.wsHeaderCell}>Workstream</div>
                {STAGE_COLUMNS.map(col => (
                  <div key={col} className={styles.stageHeaderCell}>{col}</div>
                ))}
              </div>

              {/* Workstream rows */}
              {WORKSTREAMS.map(ws => {
                const isExpanded = expandedWorkstreams.has(ws.id);
                const wsTotal = STAGE_COLUMNS.reduce((sum, col) => sum + (ws.stages[col]?.impact || 0), 0);

                return (
                  <div key={ws.id} className={styles.workstreamRow}>
                    <div className={styles.wsCell}>
                      <button
                        className={styles.expandBtn}
                        onClick={() => toggleWorkstream(ws.id)}
                      >
                        {isExpanded ? '−' : '+'}
                      </button>
                      <div className={styles.wsInfo}>
                        <span className={styles.wsColorDot} style={{ background: ws.color }} />
                        <div>
                          <div className={styles.wsName}>{ws.name}</div>
                          <div className={styles.wsImpact}>{formatCurrency(wsTotal * 1000)} total</div>
                        </div>
                      </div>
                    </div>
                    {STAGE_COLUMNS.map(col => {
                      const data = ws.stages[col];
                      const width = data.impact > 0 ? (data.impact / maxStageValues.maxImpact) * 100 : 0;
                      return (
                        <div key={col} className={styles.stageCell}>
                          {data.count > 0 ? (
                            <div className={styles.stageContent}>
                              <div className={styles.stageBar}>
                                <div
                                  className={styles.stageBarFill}
                                  style={{ width: `${width}%`, background: ws.color }}
                                />
                                <span className={styles.stageBarValue}>{data.count}</span>
                              </div>
                              <span className={styles.stageImpact}>{formatCurrency(data.impact * 1000)}</span>
                            </div>
                          ) : (
                            <span className={styles.stageEmpty}>—</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Expanded initiatives */}
                    {isExpanded && (
                      <div className={styles.initiativesExpanded}>
                        {STAGE_COLUMNS.map(col =>
                          ws.stages[col]?.initiatives.map(init => (
                            <div key={init.id} className={styles.initiativeItem}>
                              <span className={styles.initName}>{init.name}</span>
                              <span className={styles.initStage}>{col}</span>
                              <span className={styles.initImpact}>{formatCurrency(init.impact * 1000)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Total row */}
              <div className={`${styles.workstreamRow} ${styles.totalRow}`}>
                <div className={styles.wsCell}>
                  <div className={styles.wsInfo}>
                    <div>
                      <div className={styles.wsName}>Portfolio Total</div>
                      <div className={styles.wsImpact}>{totalInitiatives} initiatives</div>
                    </div>
                  </div>
                </div>
                {STAGE_COLUMNS.map(col => {
                  const data = portfolioTotals[col];
                  const width = data.impact > 0 ? (data.impact / maxStageValues.maxImpact) * 100 : 0;
                  return (
                    <div key={col} className={styles.stageCell}>
                      {data.count > 0 ? (
                        <div className={styles.stageContent}>
                          <div className={`${styles.stageBar} ${styles.totalStageBar}`}>
                            <div
                              className={styles.stageBarFill}
                              style={{ width: `${width}%` }}
                            />
                            <span className={styles.stageBarValue}>{data.count}</span>
                          </div>
                          <span className={styles.stageImpact}>{formatCurrency(data.impact * 1000)}</span>
                        </div>
                      ) : (
                        <span className={styles.stageEmpty}>—</span>
                      )}
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
