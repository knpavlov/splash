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

interface InitiativeContribution {
  id: string;
  name: string;
  impact: number;
}

interface MonthData {
  month: string;
  baseline: number;
  initiatives: InitiativeContribution[];
  plan: number;
}

interface Initiative {
  id: string;
  name: string;
  impact: number;
}

// =============================================
// P&L TREE DATA - Starting from EBITDA, 4 levels
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
        {
          id: 'revenue',
          name: 'Revenue',
          baseValue: 12500,
          withInitiatives: 13800,
          children: [
            { id: 'product-sales', name: 'Product Sales', baseValue: 8200, withInitiatives: 9100, children: [] },
            { id: 'services', name: 'Services', baseValue: 3500, withInitiatives: 3800, children: [] },
            { id: 'licensing', name: 'Licensing', baseValue: 800, withInitiatives: 900, children: [] }
          ]
        },
        {
          id: 'cogs',
          name: 'COGS',
          baseValue: -6700,
          withInitiatives: -7400,
          children: [
            { id: 'materials', name: 'Materials', baseValue: -3800, withInitiatives: -4200, children: [] },
            { id: 'labor', name: 'Labor', baseValue: -2100, withInitiatives: -2300, children: [] },
            { id: 'overhead', name: 'Overhead', baseValue: -800, withInitiatives: -900, children: [] }
          ]
        }
      ]
    },
    {
      id: 'opex',
      name: 'OpEx',
      baseValue: -3400,
      withInitiatives: -3250,
      children: [
        { id: 'sales-marketing', name: 'S&M', baseValue: -1400, withInitiatives: -1350, children: [] },
        { id: 'rd', name: 'R&D', baseValue: -1200, withInitiatives: -1100, children: [] },
        { id: 'ga', name: 'G&A', baseValue: -800, withInitiatives: -800, children: [] }
      ]
    }
  ]
};

// =============================================
// FINANCIAL OUTLOOK DATA - Plan vs Actuals with initiative breakdown
// =============================================
interface WorkstreamOutlook {
  id: string;
  name: string;
  color: string;
  data: MonthData[];
}

const WORKSTREAM_OUTLOOKS: WorkstreamOutlook[] = [
  {
    id: 'all',
    name: 'All Workstreams',
    color: '#8b5cf6',
    data: [
      { month: 'Jan', baseline: 180, initiatives: [], plan: 200 },
      { month: 'Feb', baseline: 195, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 15 }
      ], plan: 220 },
      { month: 'Mar', baseline: 210, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 25 },
        { id: 'i2', name: 'Process Automation', impact: 20 }
      ], plan: 250 },
      { month: 'Apr', baseline: 200, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 30 },
        { id: 'i2', name: 'Process Automation', impact: 30 },
        { id: 'i3', name: 'Customer Portal', impact: 20 }
      ], plan: 270 },
      { month: 'May', baseline: 225, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 35 },
        { id: 'i2', name: 'Process Automation', impact: 35 },
        { id: 'i3', name: 'Customer Portal', impact: 25 }
      ], plan: 300 },
      { month: 'Jun', baseline: 240, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 40 },
        { id: 'i2', name: 'Process Automation', impact: 45 },
        { id: 'i3', name: 'Customer Portal', impact: 30 },
        { id: 'i4', name: 'AI Analytics', impact: 15 }
      ], plan: 340 },
      { month: 'Jul', baseline: 235, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 45 },
        { id: 'i2', name: 'Process Automation', impact: 50 },
        { id: 'i3', name: 'Customer Portal', impact: 40 },
        { id: 'i4', name: 'AI Analytics', impact: 30 }
      ], plan: 380 },
      { month: 'Aug', baseline: 250, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 50 },
        { id: 'i2', name: 'Process Automation', impact: 55 },
        { id: 'i3', name: 'Customer Portal', impact: 45 },
        { id: 'i4', name: 'AI Analytics', impact: 40 }
      ], plan: 410 },
      { month: 'Sep', baseline: 260, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 55 },
        { id: 'i2', name: 'Process Automation', impact: 60 },
        { id: 'i3', name: 'Customer Portal', impact: 55 },
        { id: 'i4', name: 'AI Analytics', impact: 50 }
      ], plan: 450 },
      { month: 'Oct', baseline: 275, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 60 },
        { id: 'i2', name: 'Process Automation', impact: 70 },
        { id: 'i3', name: 'Customer Portal', impact: 65 },
        { id: 'i4', name: 'AI Analytics', impact: 65 }
      ], plan: 500 },
      { month: 'Nov', baseline: 280, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 70 },
        { id: 'i2', name: 'Process Automation', impact: 80 },
        { id: 'i3', name: 'Customer Portal', impact: 75 },
        { id: 'i4', name: 'AI Analytics', impact: 75 }
      ], plan: 550 },
      { month: 'Dec', baseline: 290, initiatives: [
        { id: 'i1', name: 'Cloud Migration', impact: 80 },
        { id: 'i2', name: 'Process Automation', impact: 90 },
        { id: 'i3', name: 'Customer Portal', impact: 90 },
        { id: 'i4', name: 'AI Analytics', impact: 90 }
      ], plan: 600 }
    ]
  },
  {
    id: 'digital',
    name: 'Digital Transformation',
    color: '#8b5cf6',
    data: [
      { month: 'Jan', baseline: 80, initiatives: [], plan: 90 },
      { month: 'Feb', baseline: 85, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 10 }], plan: 100 },
      { month: 'Mar', baseline: 90, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 20 }], plan: 115 },
      { month: 'Apr', baseline: 85, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 30 }, { id: 'd2', name: 'API Platform', impact: 15 }], plan: 130 },
      { month: 'May', baseline: 95, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 35 }, { id: 'd2', name: 'API Platform', impact: 25 }], plan: 145 },
      { month: 'Jun', baseline: 100, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 40 }, { id: 'd2', name: 'API Platform', impact: 35 }], plan: 165 },
      { month: 'Jul', baseline: 95, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 45 }, { id: 'd2', name: 'API Platform', impact: 45 }], plan: 185 },
      { month: 'Aug', baseline: 105, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 50 }, { id: 'd2', name: 'API Platform', impact: 50 }], plan: 200 },
      { month: 'Sep', baseline: 110, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 55 }, { id: 'd2', name: 'API Platform', impact: 60 }], plan: 220 },
      { month: 'Oct', baseline: 115, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 60 }, { id: 'd2', name: 'API Platform', impact: 70 }], plan: 245 },
      { month: 'Nov', baseline: 120, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 70 }, { id: 'd2', name: 'API Platform', impact: 80 }], plan: 270 },
      { month: 'Dec', baseline: 125, initiatives: [{ id: 'd1', name: 'Cloud Migration', impact: 80 }, { id: 'd2', name: 'API Platform', impact: 90 }], plan: 295 }
    ]
  },
  {
    id: 'ops',
    name: 'Operational Excellence',
    color: '#3b82f6',
    data: [
      { month: 'Jan', baseline: 60, initiatives: [], plan: 65 },
      { month: 'Feb', baseline: 65, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 5 }], plan: 72 },
      { month: 'Mar', baseline: 70, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 15 }], plan: 80 },
      { month: 'Apr', baseline: 68, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 25 }, { id: 'o2', name: 'Supply Chain', impact: 10 }], plan: 88 },
      { month: 'May', baseline: 75, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 30 }, { id: 'o2', name: 'Supply Chain', impact: 20 }], plan: 96 },
      { month: 'Jun', baseline: 80, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 35 }, { id: 'o2', name: 'Supply Chain', impact: 30 }], plan: 108 },
      { month: 'Jul', baseline: 78, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 40 }, { id: 'o2', name: 'Supply Chain', impact: 40 }], plan: 120 },
      { month: 'Aug', baseline: 85, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 45 }, { id: 'o2', name: 'Supply Chain', impact: 50 }], plan: 130 },
      { month: 'Sep', baseline: 88, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 50 }, { id: 'o2', name: 'Supply Chain', impact: 55 }], plan: 142 },
      { month: 'Oct', baseline: 92, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 55 }, { id: 'o2', name: 'Supply Chain', impact: 60 }], plan: 155 },
      { month: 'Nov', baseline: 95, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 60 }, { id: 'o2', name: 'Supply Chain', impact: 70 }], plan: 170 },
      { month: 'Dec', baseline: 100, initiatives: [{ id: 'o1', name: 'Lean Manufacturing', impact: 70 }, { id: 'o2', name: 'Supply Chain', impact: 80 }], plan: 185 }
    ]
  },
  {
    id: 'cx',
    name: 'Customer Experience',
    color: '#22d3ee',
    data: [
      { month: 'Jan', baseline: 40, initiatives: [], plan: 45 },
      { month: 'Feb', baseline: 45, initiatives: [], plan: 48 },
      { month: 'Mar', baseline: 50, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 10 }], plan: 55 },
      { month: 'Apr', baseline: 47, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 20 }, { id: 'c2', name: 'Loyalty Program', impact: 5 }], plan: 62 },
      { month: 'May', baseline: 55, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 25 }, { id: 'c2', name: 'Loyalty Program', impact: 15 }], plan: 69 },
      { month: 'Jun', baseline: 60, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 30 }, { id: 'c2', name: 'Loyalty Program', impact: 25 }], plan: 77 },
      { month: 'Jul', baseline: 62, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 35 }, { id: 'c2', name: 'Loyalty Program', impact: 30 }], plan: 85 },
      { month: 'Aug', baseline: 60, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 40 }, { id: 'c2', name: 'Loyalty Program', impact: 40 }], plan: 90 },
      { month: 'Sep', baseline: 62, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 50 }, { id: 'c2', name: 'Loyalty Program', impact: 45 }], plan: 98 },
      { month: 'Oct', baseline: 68, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 55 }, { id: 'c2', name: 'Loyalty Program', impact: 50 }], plan: 110 },
      { month: 'Nov', baseline: 65, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 60 }, { id: 'c2', name: 'Loyalty Program', impact: 55 }], plan: 120 },
      { month: 'Dec', baseline: 65, initiatives: [{ id: 'c1', name: 'Customer Portal', impact: 70 }, { id: 'c2', name: 'Loyalty Program', impact: 65 }], plan: 130 }
    ]
  }
];

// =============================================
// STAGE-GATE PIPELINE DATA
// =============================================
const PIPELINE_COLUMNS: { label: string; key: string }[] = [
  { label: 'L0', key: 'L0' },
  { label: 'L1', key: 'L1 Gate' },
  { label: 'L2', key: 'L1' },
  { label: 'L3', key: 'L2 Gate' },
  { label: 'L4', key: 'L2' },
  { label: 'L5', key: 'L3' }
];

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
  // Stage-gate: start collapsed
  const [expandedWorkstreams, setExpandedWorkstreams] = useState<Set<string>>(new Set());
  const [selectedOutlookWorkstream, setSelectedOutlookWorkstream] = useState('all');
  const [clickedBar, setClickedBar] = useState<{ month: string; initiatives: InitiativeContribution[]; total: number } | null>(null);

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

  // Get current outlook data based on selected workstream
  const currentOutlookData = useMemo(() => {
    return WORKSTREAM_OUTLOOKS.find(w => w.id === selectedOutlookWorkstream)?.data || WORKSTREAM_OUTLOOKS[0].data;
  }, [selectedOutlookWorkstream]);

  const currentOutlookColor = useMemo(() => {
    return WORKSTREAM_OUTLOOKS.find(w => w.id === selectedOutlookWorkstream)?.color || '#8b5cf6';
  }, [selectedOutlookWorkstream]);

  // =============================================
  // P&L TREE LAYOUT - Full width (4 levels = 4 cards + 3 gaps)
  // Container ~860px, so: 4*cardWidth + 3*gap = 860
  // =============================================
  const treeLayout = useMemo(() => {
    const cardWidth = 155;
    const cardHeight = 38;
    const horizontalGap = 50;
    const verticalGap = 4;
    const positions = new Map<string, { x: number; y: number }>();
    const connectors: { id: string; path: string }[] = [];

    const countLeaves = (node: TreeNodeData): number => {
      if (node.children.length === 0) return 1;
      return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
    };
    const totalLeaves = countLeaves(PNL_TREE);

    let leafIndex = 0;
    const totalHeight = totalLeaves * (cardHeight + verticalGap) - verticalGap;

    const computePositions = (node: TreeNodeData, depth: number): { minY: number; maxY: number; centerY: number } => {
      const x = depth * (cardWidth + horizontalGap);

      if (node.children.length === 0) {
        const y = leafIndex * (cardHeight + verticalGap);
        leafIndex++;
        positions.set(node.id, { x, y });
        return { minY: y, maxY: y + cardHeight, centerY: y + cardHeight / 2 };
      }

      const childResults = node.children.map(child => computePositions(child, depth + 1));
      const minY = Math.min(...childResults.map(r => r.minY));
      const maxY = Math.max(...childResults.map(r => r.maxY));
      const centerY = (minY + maxY) / 2;
      const y = centerY - cardHeight / 2;

      positions.set(node.id, { x, y });

      node.children.forEach((child) => {
        const parentPos = positions.get(node.id)!;
        const childPos = positions.get(child.id)!;
        const startX = parentPos.x + cardWidth;
        const startY = parentPos.y + cardHeight / 2;
        const endX = childPos.x;
        const endY = childPos.y + cardHeight / 2;
        const midX = startX + horizontalGap / 2;

        connectors.push({
          id: `${node.id}-${child.id}`,
          path: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`
        });
      });

      return { minY, maxY, centerY };
    };

    computePositions(PNL_TREE, 0);

    const allPositions = Array.from(positions.values());
    const width = Math.max(...allPositions.map(p => p.x)) + cardWidth;
    const height = totalHeight;

    return { positions, connectors, width, height, cardWidth, cardHeight };
  }, []);

  // Calculate max values for charts
  const outlookMax = useMemo(() => {
    const maxActual = Math.max(...currentOutlookData.map(d => d.baseline + d.initiatives.reduce((s, i) => s + i.impact, 0)));
    const maxPlan = Math.max(...currentOutlookData.map(d => d.plan));
    return Math.max(maxActual, maxPlan) * 1.15;
  }, [currentOutlookData]);

  // Stage-gate totals
  const portfolioTotals = useMemo(() => {
    const totals: Record<string, { count: number; impact: number }> = {};
    PIPELINE_COLUMNS.forEach(({ label, key }) => {
      totals[label] = { count: 0, impact: 0 };
      WORKSTREAMS.forEach(ws => {
        totals[label].count += ws.stages[key]?.count || 0;
        totals[label].impact += ws.stages[key]?.impact || 0;
      });
    });
    return totals;
  }, []);

  const maxStageImpact = useMemo(() => {
    return Math.max(
      ...WORKSTREAMS.flatMap(ws => PIPELINE_COLUMNS.map(({ key }) => ws.stages[key]?.impact || 0)),
      ...Object.values(portfolioTotals).map(t => t.impact),
      1
    );
  }, [portfolioTotals]);

  const totalInitiatives = WORKSTREAMS.reduce((sum, ws) =>
    sum + PIPELINE_COLUMNS.reduce((s, { key }) => s + (ws.stages[key]?.count || 0), 0), 0
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
          height: treeLayout.cardHeight,
          left: pos.x,
          top: pos.y
        }}
      >
        <div className={styles.treeCardHeader}>
          <span className={styles.treeCardName}>{node.name}</span>
          <span className={`${styles.treeCardDelta} ${isPositiveDelta ? styles.positive : styles.negative}`}>
            {deltaPercent}
          </span>
        </div>
        <div className={styles.treeCardBars}>
          <div className={styles.treeBarRow}>
            <div className={styles.treeBarTrack}>
              <div
                className={`${styles.treeBarBase} ${isNegative ? styles.negativeBar : ''}`}
                style={{ width: `${baseWidth}%` }}
              />
            </div>
            <span className={styles.treeBarValue}>{formatCurrency(node.baseValue)}</span>
          </div>
          <div className={styles.treeBarRow}>
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
          {VIEW_OPTIONS.find(v => v.id === activeView)?.shortTitle || 'Laiten'}
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
            <div className={styles.treeCanvas}>
              <svg
                className={styles.treeSvg}
                width={treeLayout.width}
                height={treeLayout.height}
                style={{ width: treeLayout.width, height: treeLayout.height }}
              >
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
              <div className={styles.outlookTitleRow}>
                <h3>Plan vs Actuals</h3>
                <select
                  className={styles.workstreamSelect}
                  value={selectedOutlookWorkstream}
                  onChange={(e) => setSelectedOutlookWorkstream(e.target.value)}
                >
                  {WORKSTREAM_OUTLOOKS.map(ws => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.outlookLegend}>
                <span><span className={styles.legendBarBase} /> Baseline</span>
                <span><span className={styles.legendBarInit} style={{ background: currentOutlookColor }} /> Initiatives</span>
                <span><span className={styles.legendLine} /> Plan</span>
              </div>
            </div>

            <div className={styles.chartContainer}>
              {/* Y-axis labels */}
              <div className={styles.yAxisLabels}>
                {[...Array(5)].map((_, i) => {
                  const val = Math.round(outlookMax * (1 - i / 4));
                  return <span key={i}>${val}K</span>;
                })}
              </div>

              {/* Chart area */}
              <div className={styles.chartArea}>
                {/* Grid lines */}
                <div className={styles.gridLines}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={styles.gridLine} />
                  ))}
                </div>

                {/* Bars */}
                <div className={styles.barsContainer}>
                  {currentOutlookData.map((d) => {
                    const initTotal = d.initiatives.reduce((s, i) => s + i.impact, 0);
                    const actualTotal = d.baseline + initTotal;
                    const actualHeight = (actualTotal / outlookMax) * 100;
                    const baselineRatio = actualTotal > 0 ? (d.baseline / actualTotal) * 100 : 0;
                    const initiativesRatio = actualTotal > 0 ? (initTotal / actualTotal) * 100 : 0;

                    return (
                      <div key={d.month} className={styles.barColumn}>
                        <div
                          className={styles.stackedBar}
                          style={{ height: `${actualHeight}%` }}
                        >
                          {initTotal > 0 && (
                            <div
                              className={styles.barSegmentInit}
                              style={{
                                height: `${initiativesRatio}%`,
                                background: currentOutlookColor
                              }}
                              onClick={() => setClickedBar({
                                month: d.month,
                                initiatives: d.initiatives,
                                total: initTotal
                              })}
                            />
                          )}
                          <div
                            className={styles.barSegmentBase}
                            style={{ height: `${baselineRatio}%` }}
                          />
                        </div>
                        <span className={styles.monthLabel}>{d.month}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Plan line - using viewBox for proper scaling */}
                <svg className={styles.planLineSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    className={styles.planLine}
                    points={currentOutlookData.map((d, i) => {
                      const x = ((i + 0.5) / currentOutlookData.length) * 100;
                      const y = 100 - (d.plan / outlookMax) * 100;
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                </svg>
                {/* Plan dots - absolute positioned to avoid stretching */}
                <div className={styles.planDotsContainer}>
                  {currentOutlookData.map((d, i) => {
                    const left = ((i + 0.5) / currentOutlookData.length) * 100;
                    const bottom = (d.plan / outlookMax) * 100;
                    return (
                      <div
                        key={i}
                        className={styles.planDotWrapper}
                        style={{ left: `${left}%`, bottom: `${bottom}%` }}
                      >
                        <span className={styles.planDot} />
                      </div>
                    );
                  })}
                </div>

                {/* Initiative breakdown popup */}
                {clickedBar && (
                  <div className={styles.initiativePopup}>
                    <div className={styles.popupHeader}>
                      <strong>{clickedBar.month} - Initiative Breakdown</strong>
                      <button className={styles.popupClose} onClick={() => setClickedBar(null)}>×</button>
                    </div>
                    <div className={styles.popupContent}>
                      {clickedBar.initiatives.map(init => (
                        <div key={init.id} className={styles.popupItem}>
                          <span className={styles.popupInitName}>{init.name}</span>
                          <span className={styles.popupInitValue}>
                            ${init.impact}K
                            <span className={styles.popupInitPercent}>
                              ({Math.round((init.impact / clickedBar.total) * 100)}%)
                            </span>
                          </span>
                        </div>
                      ))}
                      <div className={styles.popupTotal}>
                        <span>Total Impact</span>
                        <span>${clickedBar.total}K</span>
                      </div>
                    </div>
                  </div>
                )}
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
                {PIPELINE_COLUMNS.map(col => (
                  <div key={col.label} className={styles.stageHeaderCell}>{col.label}</div>
                ))}
              </div>

              {/* Workstream rows */}
              {WORKSTREAMS.map(ws => {
                const isExpanded = expandedWorkstreams.has(ws.id);
                const wsTotal = PIPELINE_COLUMNS.reduce((sum, { key }) => sum + (ws.stages[key]?.impact || 0), 0);
                const wsCount = PIPELINE_COLUMNS.reduce((sum, { key }) => sum + (ws.stages[key]?.count || 0), 0);

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
                          <div className={styles.wsImpact}>{wsCount} initiatives • {formatCurrency(wsTotal * 1000)}</div>
                        </div>
                      </div>
                    </div>
                    {PIPELINE_COLUMNS.map(col => {
                      const data = ws.stages[col.key] ?? { count: 0, impact: 0, initiatives: [] };
                      const width = data.impact > 0 ? (data.impact / maxStageImpact) * 100 : 0;
                      return (
                        <div key={col.label} className={styles.stageCell}>
                          {data.count > 0 ? (
                            <div className={styles.stageContent}>
                              <div className={styles.stageBar}>
                                <div
                                  className={styles.stageBarFill}
                                  style={{ width: `${width}%`, background: ws.color }}
                                />
                                <span className={styles.stageBarValue}>{formatCurrency(data.impact * 1000)}</span>
                              </div>
                              <span className={styles.stageCount}>{data.count} init.</span>
                            </div>
                          ) : (
                            <span className={styles.stageEmpty}>—</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Expanded initiatives - displayed in table format */}
                    {isExpanded && (
                      <div className={styles.initiativesExpanded}>
                        {PIPELINE_COLUMNS.flatMap(stage =>
                          ws.stages[stage.key]?.initiatives.map(init => (
                            <div key={init.id} className={styles.initRow}>
                              <div className={styles.initNameCell}>
                                <span className={styles.initDot} style={{ background: ws.color }} />
                                {init.name}
                              </div>
                              {PIPELINE_COLUMNS.map(col => (
                                <div key={col.label} className={styles.initStageCell}>
                                  {col.key === stage.key && (
                                    <span className={styles.initImpactValue}>{formatCurrency(init.impact * 1000)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )) || []
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
                {PIPELINE_COLUMNS.map(col => {
                  const data = portfolioTotals[col.label];
                  const width = data.impact > 0 ? (data.impact / maxStageImpact) * 100 : 0;
                  return (
                    <div key={col.label} className={styles.stageCell}>
                      {data.count > 0 ? (
                        <div className={styles.stageContent}>
                          <div className={`${styles.stageBar} ${styles.totalStageBar}`}>
                            <div
                              className={styles.stageBarFill}
                              style={{ width: `${width}%` }}
                            />
                            <span className={styles.stageBarValue}>{formatCurrency(data.impact * 1000)}</span>
                          </div>
                          <span className={styles.stageCount}>{data.count} init.</span>
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
