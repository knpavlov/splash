import { useState, useCallback, useMemo } from 'react';
import styles from './ReportingDemo.module.css';

// Types
type DemoView = 'pnl-tree' | 'financial-outlook' | 'stage-gate';
type WorkstreamId = 'digital' | 'ops' | 'cx';

interface TreeNodeData {
  id: string;
  label: string;
  code: string;
  baseline: number;
  withInitiatives: number;
  children?: TreeNodeData[];
  isExpanded?: boolean;
}

interface MonthData {
  month: string;
  plan: number;
  actual: number;
  segments: { initiative: string; value: number; color: string }[];
}

interface Initiative {
  id: string;
  name: string;
  stage: string;
  impact: number;
}

// Demo data
const WORKSTREAMS: { id: WorkstreamId; name: string; color: string }[] = [
  { id: 'digital', name: 'Digital Transformation', color: '#8b5cf6' },
  { id: 'ops', name: 'Operations Excellence', color: '#3b82f6' },
  { id: 'cx', name: 'Customer Experience', color: '#22d3ee' }
];

// P&L Tree data
const PNL_TREE_DATA: TreeNodeData = {
  id: 'net-profit',
  label: 'Net Profit',
  code: 'NP',
  baseline: 12500000,
  withInitiatives: 15800000,
  children: [
    {
      id: 'revenue',
      label: 'Revenue',
      code: 'REV',
      baseline: 85000000,
      withInitiatives: 92000000,
      children: [
        { id: 'product-sales', label: 'Product Sales', code: 'PS', baseline: 65000000, withInitiatives: 70000000 },
        { id: 'services', label: 'Services', code: 'SVC', baseline: 20000000, withInitiatives: 22000000 }
      ]
    },
    {
      id: 'cogs',
      label: 'Cost of Goods',
      code: 'COGS',
      baseline: -52000000,
      withInitiatives: -54000000,
      children: [
        { id: 'materials', label: 'Materials', code: 'MAT', baseline: -35000000, withInitiatives: -36000000 },
        { id: 'labor', label: 'Direct Labor', code: 'DL', baseline: -17000000, withInitiatives: -18000000 }
      ]
    },
    {
      id: 'opex',
      label: 'Operating Expenses',
      code: 'OPEX',
      baseline: -20500000,
      withInitiatives: -22200000,
      children: [
        { id: 'sg-a', label: 'SG&A', code: 'SGA', baseline: -12500000, withInitiatives: -13200000 },
        { id: 'rd', label: 'R&D', code: 'RD', baseline: -8000000, withInitiatives: -9000000 }
      ]
    }
  ]
};

// Financial Outlook data by workstream
const FINANCIAL_OUTLOOK_DATA: Record<WorkstreamId, MonthData[]> = {
  digital: [
    { month: 'Jan', plan: 180, actual: 165, segments: [
      { initiative: 'Cloud Migration', value: 85, color: '#8b5cf6' },
      { initiative: 'API Platform', value: 50, color: '#a78bfa' },
      { initiative: 'Data Lake', value: 30, color: '#c4b5fd' }
    ]},
    { month: 'Feb', plan: 220, actual: 210, segments: [
      { initiative: 'Cloud Migration', value: 110, color: '#8b5cf6' },
      { initiative: 'API Platform', value: 65, color: '#a78bfa' },
      { initiative: 'Data Lake', value: 35, color: '#c4b5fd' }
    ]},
    { month: 'Mar', plan: 280, actual: 295, segments: [
      { initiative: 'Cloud Migration', value: 145, color: '#8b5cf6' },
      { initiative: 'API Platform', value: 90, color: '#a78bfa' },
      { initiative: 'Data Lake', value: 60, color: '#c4b5fd' }
    ]},
    { month: 'Apr', plan: 350, actual: 340, segments: [
      { initiative: 'Cloud Migration', value: 170, color: '#8b5cf6' },
      { initiative: 'API Platform', value: 100, color: '#a78bfa' },
      { initiative: 'Data Lake', value: 70, color: '#c4b5fd' }
    ]},
    { month: 'May', plan: 420, actual: 450, segments: [
      { initiative: 'Cloud Migration', value: 220, color: '#8b5cf6' },
      { initiative: 'API Platform', value: 130, color: '#a78bfa' },
      { initiative: 'Data Lake', value: 100, color: '#c4b5fd' }
    ]},
    { month: 'Jun', plan: 500, actual: 485, segments: [
      { initiative: 'Cloud Migration', value: 240, color: '#8b5cf6' },
      { initiative: 'API Platform', value: 145, color: '#a78bfa' },
      { initiative: 'Data Lake', value: 100, color: '#c4b5fd' }
    ]}
  ],
  ops: [
    { month: 'Jan', plan: 120, actual: 135, segments: [
      { initiative: 'Lean Manufacturing', value: 75, color: '#3b82f6' },
      { initiative: 'Supply Chain Opt', value: 60, color: '#60a5fa' }
    ]},
    { month: 'Feb', plan: 150, actual: 160, segments: [
      { initiative: 'Lean Manufacturing', value: 90, color: '#3b82f6' },
      { initiative: 'Supply Chain Opt', value: 70, color: '#60a5fa' }
    ]},
    { month: 'Mar', plan: 180, actual: 175, segments: [
      { initiative: 'Lean Manufacturing', value: 100, color: '#3b82f6' },
      { initiative: 'Supply Chain Opt', value: 75, color: '#60a5fa' }
    ]},
    { month: 'Apr', plan: 220, actual: 235, segments: [
      { initiative: 'Lean Manufacturing', value: 130, color: '#3b82f6' },
      { initiative: 'Supply Chain Opt', value: 105, color: '#60a5fa' }
    ]},
    { month: 'May', plan: 260, actual: 280, segments: [
      { initiative: 'Lean Manufacturing', value: 155, color: '#3b82f6' },
      { initiative: 'Supply Chain Opt', value: 125, color: '#60a5fa' }
    ]},
    { month: 'Jun', plan: 310, actual: 305, segments: [
      { initiative: 'Lean Manufacturing', value: 175, color: '#3b82f6' },
      { initiative: 'Supply Chain Opt', value: 130, color: '#60a5fa' }
    ]}
  ],
  cx: [
    { month: 'Jan', plan: 90, actual: 85, segments: [
      { initiative: 'Mobile App Redesign', value: 45, color: '#22d3ee' },
      { initiative: 'CRM Integration', value: 40, color: '#67e8f9' }
    ]},
    { month: 'Feb', plan: 110, actual: 120, segments: [
      { initiative: 'Mobile App Redesign', value: 65, color: '#22d3ee' },
      { initiative: 'CRM Integration', value: 55, color: '#67e8f9' }
    ]},
    { month: 'Mar', plan: 140, actual: 155, segments: [
      { initiative: 'Mobile App Redesign', value: 85, color: '#22d3ee' },
      { initiative: 'CRM Integration', value: 70, color: '#67e8f9' }
    ]},
    { month: 'Apr', plan: 175, actual: 180, segments: [
      { initiative: 'Mobile App Redesign', value: 100, color: '#22d3ee' },
      { initiative: 'CRM Integration', value: 80, color: '#67e8f9' }
    ]},
    { month: 'May', plan: 210, actual: 225, segments: [
      { initiative: 'Mobile App Redesign', value: 125, color: '#22d3ee' },
      { initiative: 'CRM Integration', value: 100, color: '#67e8f9' }
    ]},
    { month: 'Jun', plan: 250, actual: 240, segments: [
      { initiative: 'Mobile App Redesign', value: 135, color: '#22d3ee' },
      { initiative: 'CRM Integration', value: 105, color: '#67e8f9' }
    ]}
  ]
};

// Stage Gate Pipeline data
const STAGE_COLUMNS = ['L0', 'L1 Gate', 'L1', 'L2 Gate', 'L2', 'Scale'];

const STAGE_GATE_DATA: Record<WorkstreamId, Record<string, Initiative[]>> = {
  digital: {
    'L0': [
      { id: 'd1', name: 'AI Customer Support', stage: 'L0', impact: 450000 }
    ],
    'L1 Gate': [
      { id: 'd2', name: 'Blockchain Pilot', stage: 'L1 Gate', impact: 280000 }
    ],
    'L1': [
      { id: 'd3', name: 'IoT Sensors Network', stage: 'L1', impact: 620000 },
      { id: 'd4', name: 'ML Demand Forecasting', stage: 'L1', impact: 380000 }
    ],
    'L2 Gate': [
      { id: 'd5', name: 'Cloud Migration', stage: 'L2 Gate', impact: 1200000 }
    ],
    'L2': [
      { id: 'd6', name: 'API Platform', stage: 'L2', impact: 850000 }
    ],
    'Scale': [
      { id: 'd7', name: 'Data Lake', stage: 'Scale', impact: 1500000 }
    ]
  },
  ops: {
    'L0': [
      { id: 'o1', name: 'Robotic Assembly', stage: 'L0', impact: 520000 },
      { id: 'o2', name: 'Predictive Maintenance', stage: 'L0', impact: 340000 }
    ],
    'L1 Gate': [],
    'L1': [
      { id: 'o3', name: 'Warehouse Automation', stage: 'L1', impact: 780000 }
    ],
    'L2 Gate': [
      { id: 'o4', name: 'Lean Manufacturing', stage: 'L2 Gate', impact: 920000 }
    ],
    'L2': [
      { id: 'o5', name: 'Supply Chain Opt', stage: 'L2', impact: 1100000 }
    ],
    'Scale': []
  },
  cx: {
    'L0': [],
    'L1 Gate': [
      { id: 'c1', name: 'Loyalty Program 2.0', stage: 'L1 Gate', impact: 420000 }
    ],
    'L1': [
      { id: 'c2', name: 'Omnichannel Support', stage: 'L1', impact: 550000 }
    ],
    'L2 Gate': [],
    'L2': [
      { id: 'c3', name: 'Mobile App Redesign', stage: 'L2', impact: 680000 },
      { id: 'c4', name: 'CRM Integration', stage: 'L2', impact: 490000 }
    ],
    'Scale': [
      { id: 'c5', name: 'Self-Service Portal', stage: 'Scale', impact: 850000 }
    ]
  }
};

// View descriptions
const VIEW_OPTIONS: { id: DemoView; title: string; description: string }[] = [
  {
    id: 'pnl-tree',
    title: 'P&L Impact Tree',
    description: 'Visualize how initiatives impact your P&L structure with drill-down capabilities'
  },
  {
    id: 'financial-outlook',
    title: 'Financial Outlook',
    description: 'Track actuals vs plan with initiative-level breakdown on click'
  },
  {
    id: 'stage-gate',
    title: 'Stage-Gate Pipeline',
    description: 'Monitor initiative progression across stage gates by workstream'
  }
];

// Formatters
const formatCurrency = (value: number, compact = true) => {
  if (compact) {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
};

const formatDelta = (baseline: number, withInit: number) => {
  const delta = withInit - baseline;
  const pct = baseline !== 0 ? ((delta / Math.abs(baseline)) * 100).toFixed(1) : '0';
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${pct}%`;
};

interface ReportingDemoProps {
  className?: string;
}

export const ReportingDemo = ({ className }: ReportingDemoProps) => {
  const [activeView, setActiveView] = useState<DemoView>('pnl-tree');
  const [selectedWorkstream, setSelectedWorkstream] = useState<WorkstreamId>('digital');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['net-profit', 'revenue']));
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(true);

  // P&L Tree rendering
  const renderTreeNode = useCallback((node: TreeNodeData, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const delta = node.withInitiatives - node.baseline;
    const deltaPercent = node.baseline !== 0 ? (delta / Math.abs(node.baseline)) * 100 : 0;
    const isPositive = delta >= 0;

    const maxValue = Math.max(Math.abs(node.baseline), Math.abs(node.withInitiatives));
    const baselineWidth = (Math.abs(node.baseline) / maxValue) * 100;
    const initiativeWidth = (Math.abs(node.withInitiatives) / maxValue) * 100;

    return (
      <div key={node.id} className={styles.treeNodeWrapper}>
        <div
          className={`${styles.treeNode} ${level === 0 ? styles.rootNode : ''}`}
          style={{ marginLeft: level * 24 }}
          onClick={() => {
            if (hasChildren) {
              setExpandedNodes(prev => {
                const next = new Set(prev);
                if (next.has(node.id)) {
                  next.delete(node.id);
                } else {
                  next.add(node.id);
                }
                return next;
              });
            }
          }}
        >
          <div className={styles.treeNodeHeader}>
            {hasChildren && (
              <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M4 2l4 4-4 4V2z" />
                </svg>
              </span>
            )}
            <span className={styles.nodeCode}>{node.code}</span>
            <span className={styles.nodeLabel}>{node.label}</span>
            <span className={`${styles.nodeDelta} ${isPositive ? styles.positive : styles.negative}`}>
              {formatDelta(node.baseline, node.withInitiatives)}
            </span>
          </div>
          <div className={styles.nodeChart}>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Baseline</span>
              <div className={styles.barContainer}>
                <div
                  className={styles.baselineBar}
                  style={{ width: `${baselineWidth}%` }}
                />
              </div>
              <span className={styles.barValue}>{formatCurrency(node.baseline)}</span>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>With Init.</span>
              <div className={styles.barContainer}>
                <div
                  className={`${styles.initiativeBar} ${isPositive ? styles.positive : styles.negative}`}
                  style={{ width: `${initiativeWidth}%` }}
                />
              </div>
              <span className={styles.barValue}>{formatCurrency(node.withInitiatives)}</span>
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className={styles.treeChildren}>
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [expandedNodes]);

  // Financial Outlook rendering
  const outlookData = useMemo(() => FINANCIAL_OUTLOOK_DATA[selectedWorkstream], [selectedWorkstream]);
  const maxActual = useMemo(() => Math.max(...outlookData.map(d => d.actual)), [outlookData]);

  const renderFinancialOutlook = () => {
    return (
      <div className={styles.outlookContainer}>
        <div className={styles.outlookHeader}>
          <div className={styles.outlookLegend}>
            <span className={styles.legendItem}>
              <span className={styles.legendLine} />
              Plan
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendBar} style={{ background: WORKSTREAMS.find(w => w.id === selectedWorkstream)?.color }} />
              Actual
            </span>
          </div>
          <div className={styles.workstreamSelector}>
            {WORKSTREAMS.map(ws => (
              <button
                key={ws.id}
                className={`${styles.workstreamBtn} ${selectedWorkstream === ws.id ? styles.active : ''}`}
                onClick={() => {
                  setSelectedWorkstream(ws.id);
                  setSelectedBarIndex(null);
                }}
                style={{ '--ws-color': ws.color } as React.CSSProperties}
              >
                {ws.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.chartArea}>
          {/* Y-axis */}
          <div className={styles.yAxis}>
            {[500, 400, 300, 200, 100, 0].map(val => (
              <span key={val} className={styles.yTick}>${val}K</span>
            ))}
          </div>

          {/* Chart */}
          <div className={styles.barsWrapper}>
            {/* Grid lines */}
            <div className={styles.gridLines}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className={styles.gridLine} />
              ))}
            </div>

            {/* Plan line */}
            <svg className={styles.planLine} viewBox={`0 0 ${outlookData.length * 60} 200`} preserveAspectRatio="none">
              <polyline
                points={outlookData.map((d, i) => `${i * 60 + 30},${200 - (d.plan / 500) * 200}`).join(' ')}
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              {outlookData.map((d, i) => (
                <circle
                  key={i}
                  cx={i * 60 + 30}
                  cy={200 - (d.plan / 500) * 200}
                  r="4"
                  fill="rgba(255,255,255,0.8)"
                />
              ))}
            </svg>

            {/* Bars */}
            <div className={styles.bars}>
              {outlookData.map((d, idx) => (
                <div key={idx} className={styles.barGroup}>
                  <div
                    className={`${styles.stackedBar} ${selectedBarIndex === idx ? styles.selected : ''}`}
                    style={{ height: `${(d.actual / 500) * 100}%` }}
                    onClick={() => setSelectedBarIndex(selectedBarIndex === idx ? null : idx)}
                  >
                    {d.segments.map((seg, segIdx) => (
                      <div
                        key={segIdx}
                        className={styles.barSegment}
                        style={{
                          height: `${(seg.value / d.actual) * 100}%`,
                          background: seg.color
                        }}
                      />
                    ))}
                  </div>
                  <span className={styles.monthLabel}>{d.month}</span>
                </div>
              ))}
            </div>

            {/* Breakdown popup */}
            {selectedBarIndex !== null && (
              <div
                className={styles.breakdownPopup}
                style={{
                  left: `${selectedBarIndex * 60 + 30}px`
                }}
              >
                <div className={styles.popupHeader}>
                  <span>{outlookData[selectedBarIndex].month} Breakdown</span>
                  <button onClick={() => setSelectedBarIndex(null)} className={styles.popupClose}>×</button>
                </div>
                <div className={styles.popupContent}>
                  {outlookData[selectedBarIndex].segments.map((seg, i) => (
                    <div key={i} className={styles.popupRow}>
                      <span className={styles.popupDot} style={{ background: seg.color }} />
                      <span className={styles.popupName}>{seg.initiative}</span>
                      <span className={styles.popupValue}>${seg.value}K</span>
                    </div>
                  ))}
                  <div className={styles.popupTotal}>
                    <span>Total</span>
                    <span>${outlookData[selectedBarIndex].actual}K</span>
                  </div>
                  <div className={styles.popupVsPlan}>
                    <span>vs Plan</span>
                    <span className={outlookData[selectedBarIndex].actual >= outlookData[selectedBarIndex].plan ? styles.positive : styles.negative}>
                      {outlookData[selectedBarIndex].actual >= outlookData[selectedBarIndex].plan ? '+' : ''}
                      {outlookData[selectedBarIndex].actual - outlookData[selectedBarIndex].plan}K
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Stage-Gate Pipeline rendering
  const stageGateData = useMemo(() => STAGE_GATE_DATA[selectedWorkstream], [selectedWorkstream]);

  const renderStageGatePipeline = () => {
    return (
      <div className={styles.pipelineContainer}>
        <div className={styles.pipelineHeader}>
          <div className={styles.pipelineLegend}>
            <span className={styles.legendItem}>
              <span className={styles.legendCircle} style={{ background: '#22c55e' }} />
              High Impact
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendCircle} style={{ background: '#f59e0b' }} />
              Medium
            </span>
          </div>
          <div className={styles.workstreamSelector}>
            {WORKSTREAMS.map(ws => (
              <button
                key={ws.id}
                className={`${styles.workstreamBtn} ${selectedWorkstream === ws.id ? styles.active : ''}`}
                onClick={() => setSelectedWorkstream(ws.id)}
                style={{ '--ws-color': ws.color } as React.CSSProperties}
              >
                {ws.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.pipelineTable}>
          {/* Header */}
          <div className={styles.pipelineRow}>
            <div className={styles.pipelineCell} style={{ background: 'transparent' }} />
            {STAGE_COLUMNS.map(stage => (
              <div key={stage} className={`${styles.pipelineCell} ${styles.headerCell}`}>
                {stage}
              </div>
            ))}
          </div>

          {/* Data row */}
          <div className={styles.pipelineRow}>
            <div className={`${styles.pipelineCell} ${styles.wsCell}`}>
              <span
                className={styles.wsDot}
                style={{ background: WORKSTREAMS.find(w => w.id === selectedWorkstream)?.color }}
              />
              {WORKSTREAMS.find(w => w.id === selectedWorkstream)?.name}
            </div>
            {STAGE_COLUMNS.map(stage => {
              const initiatives = stageGateData[stage] || [];
              const totalImpact = initiatives.reduce((sum, i) => sum + i.impact, 0);

              return (
                <div key={stage} className={styles.pipelineCell}>
                  {initiatives.length > 0 ? (
                    <div className={styles.stageContent}>
                      <div className={styles.initiativeCount}>{initiatives.length}</div>
                      <div className={styles.impactBadge}>
                        {formatCurrency(totalImpact)}
                      </div>
                      <div className={styles.initiativeList}>
                        {initiatives.map(init => (
                          <div
                            key={init.id}
                            className={styles.initiativeChip}
                            style={{
                              borderColor: init.impact >= 800000 ? '#22c55e' : '#f59e0b'
                            }}
                          >
                            <span className={styles.chipName}>{init.name}</span>
                            <span className={styles.chipImpact}>{formatCurrency(init.impact)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className={styles.emptyCell}>—</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <div className={`${styles.pipelineRow} ${styles.summaryRow}`}>
            <div className={`${styles.pipelineCell} ${styles.wsCell}`}>
              Total Pipeline
            </div>
            {STAGE_COLUMNS.map(stage => {
              const initiatives = stageGateData[stage] || [];
              const totalImpact = initiatives.reduce((sum, i) => sum + i.impact, 0);
              return (
                <div key={stage} className={`${styles.pipelineCell} ${styles.summaryCell}`}>
                  {totalImpact > 0 ? formatCurrency(totalImpact) : '—'}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Hint for current view
  const getHintText = () => {
    switch (activeView) {
      case 'pnl-tree':
        return 'Click on nodes to expand/collapse the P&L hierarchy';
      case 'financial-outlook':
        return 'Click on bars to see initiative breakdown';
      case 'stage-gate':
        return 'Switch workstreams to explore different pipelines';
    }
  };

  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      {/* Hint overlay */}
      {showHint && (
        <div className={styles.hintOverlay}>
          <div className={styles.hintContent}>
            <div className={styles.hintIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <div className={styles.hintText}>
              <span className={styles.hintTitle}>Interactive Demo</span>
              <span className={styles.hintDesc}>{getHintText()}</span>
            </div>
            <button className={styles.hintDismiss} onClick={() => setShowHint(false)}>Got it</button>
          </div>
        </div>
      )}

      {/* Window chrome */}
      <div className={styles.windowChrome}>
        <div className={styles.windowControls}>
          <span className={styles.windowDot} data-color="red" />
          <span className={styles.windowDot} data-color="yellow" />
          <span className={styles.windowDot} data-color="green" />
        </div>
        <div className={styles.windowTitle}>LaikaPro</div>
        <button
          className={styles.resetBtn}
          onClick={() => {
            setExpandedNodes(new Set(['net-profit', 'revenue']));
            setSelectedBarIndex(null);
            setSelectedWorkstream('digital');
            setShowHint(true);
          }}
          title="Reset Demo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Reset
        </button>
      </div>

      {/* App content */}
      <div className={styles.appContent}>
        {/* Navigation sidebar */}
        <div className={styles.navSidebar}>
          {VIEW_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`${styles.navItem} ${activeView === opt.id ? styles.active : ''}`}
              onClick={() => {
                setActiveView(opt.id);
                setShowHint(true);
              }}
            >
              <span className={styles.navTitle}>{opt.title}</span>
              <span className={styles.navDesc}>{opt.description}</span>
              <svg className={styles.navArrow} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 3l5 5-5 5V3z" />
              </svg>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className={styles.mainContent}>
          {activeView === 'pnl-tree' && (
            <div className={styles.treeContainer}>
              <div className={styles.viewHeader}>
                <h3>P&L Impact Analysis</h3>
                <span className={styles.viewSubtitle}>FY2025 Projection</span>
              </div>
              {renderTreeNode(PNL_TREE_DATA)}
            </div>
          )}

          {activeView === 'financial-outlook' && renderFinancialOutlook()}

          {activeView === 'stage-gate' && renderStageGatePipeline()}
        </div>
      </div>
    </div>
  );
};
