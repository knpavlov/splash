import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/InitiativesList.module.css';
import { Initiative, initiativeStageLabels } from '../../../shared/types/initiative';
import { Workstream } from '../../../shared/types/workstream';
import { InitiativesDashboard } from './InitiativesDashboard';
import { ChevronIcon } from '../../../components/icons/ChevronIcon';
import { useAuth } from '../../auth/AuthContext';
import { accountsApi } from '../../accounts/services/accountsApi';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const formatCurrency = (value: number) => currency.format(value || 0);

const formatDate = (value: string | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
};

const stageLabel = (key: string) => initiativeStageLabels[key as keyof typeof initiativeStageLabels] ?? key.toUpperCase();

type SortKey =
  | 'name'
  | 'owner'
  | 'stage'
  | 'recBenefits'
  | 'recCosts'
  | 'recImpact'
  | 'oneoffBenefits'
  | 'oneoffCosts'
  | 'l4Date'
  | 'status';

interface ColumnDef {
  key: SortKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Initiative name', defaultWidth: 200, minWidth: 120 },
  { key: 'owner', label: 'Initiative owner', defaultWidth: 130, minWidth: 80 },
  { key: 'stage', label: 'Stage gate', defaultWidth: 80, minWidth: 60 },
  { key: 'recBenefits', label: 'Recurring benefits', defaultWidth: 110, minWidth: 80 },
  { key: 'recCosts', label: 'Recurring costs', defaultWidth: 100, minWidth: 80 },
  { key: 'recImpact', label: 'Recurring impact', defaultWidth: 110, minWidth: 80 },
  { key: 'oneoffBenefits', label: 'One-off benefits', defaultWidth: 100, minWidth: 80 },
  { key: 'oneoffCosts', label: 'One-off costs', defaultWidth: 90, minWidth: 80 },
  { key: 'l4Date', label: 'L4 date', defaultWidth: 90, minWidth: 70 },
  { key: 'status', label: 'Current status', defaultWidth: 100, minWidth: 70 }
];

const getDefaultColumnWidths = (): Record<string, number> =>
  COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {});

const UI_PREFS_KEY = 'initiativesTableColumns';
const UI_PREFS_ORDER_KEY = 'initiativesTableColumnOrder';

interface InitiativesListProps {
  initiatives: Initiative[];
  workstreams: Workstream[];
  selectedWorkstreamId: string | null;
  onSelectWorkstream: (workstreamId: string | null) => void;
  onCreate: (workstreamId: string | null) => void;
  onOpen: (initiativeId: string) => void;
}

export const InitiativesList = ({
  initiatives,
  workstreams,
  selectedWorkstreamId,
  onSelectWorkstream,
  onCreate,
  onOpen
}: InitiativesListProps) => {
  const { session } = useAuth();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [initiativesCollapsed, setInitiativesCollapsed] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(getDefaultColumnWidths);
  const [columnOrder, setColumnOrder] = useState<SortKey[]>(() => COLUMNS.map((col) => col.key));
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<SortKey | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartWidthRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const columnWidthsRef = useRef<Record<string, number>>(columnWidths);
  const columnOrderRef = useRef<SortKey[]>(columnOrder);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    columnOrderRef.current = columnOrder;
  }, [columnOrder]);

  // Load preferences on mount
  useEffect(() => {
    if (!session?.accountId) return;
    accountsApi.getUiPreferences(session.accountId).then((prefs) => {
      const widthsValue = prefs[UI_PREFS_KEY];
      if (widthsValue && typeof widthsValue === 'object' && !Array.isArray(widthsValue)) {
        setColumnWidths((prev) => ({ ...prev, ...(widthsValue as Record<string, number>) }));
      }
      const orderValue = prefs[UI_PREFS_ORDER_KEY];
      if (Array.isArray(orderValue)) {
        const allowed = new Set(COLUMNS.map((col) => col.key));
        const normalized = (orderValue as unknown[])
          .filter((key): key is SortKey => typeof key === 'string' && allowed.has(key as SortKey))
          .filter((key, index, arr) => arr.indexOf(key) === index);
        const missing = COLUMNS.map((col) => col.key).filter((key) => !normalized.includes(key));
        setColumnOrder([...normalized, ...missing]);
      }
    }).catch(() => {});
  }, [session?.accountId]);

  const savePreferences = useCallback((patch?: { widths?: Record<string, number>; order?: SortKey[] }) => {
    if (!session?.accountId) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      const widths = patch?.widths ?? columnWidthsRef.current;
      const order = patch?.order ?? columnOrderRef.current;
      accountsApi.getUiPreferences(session.accountId).then((prefs) => {
        return accountsApi.updateUiPreferences(session.accountId, {
          ...prefs,
          [UI_PREFS_KEY]: widths,
          [UI_PREFS_ORDER_KEY]: order
        });
      }).catch(() => {});
    }, 500);
  }, [session?.accountId]);

  const saveWidthsPreferences = useCallback((widths: Record<string, number>) => savePreferences({ widths }), [savePreferences]);
  const saveOrderPreferences = useCallback((order: SortKey[]) => savePreferences({ order }), [savePreferences]);

  const handleResizeStart = useCallback((colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colKey);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = columnWidths[colKey] ?? 100;
  }, [columnWidths]);

  useEffect(() => {
    if (!resizingColumn) return;
    const col = COLUMNS.find((c) => c.key === resizingColumn);
    const minWidth = col?.minWidth ?? 50;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(minWidth, resizeStartWidthRef.current + delta);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setColumnWidths((prev) => {
        saveWidthsPreferences(prev);
        return prev;
      });
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, saveWidthsPreferences]);

  const orderedColumns = useMemo(() => {
    const byKey = new Map<SortKey, ColumnDef>(COLUMNS.map((col) => [col.key, col]));
    return columnOrder.map((key) => byKey.get(key)).filter((col): col is ColumnDef => Boolean(col));
  }, [columnOrder]);

  const moveColumn = useCallback(
    (source: SortKey, target: SortKey) => {
      if (source === target) {
        return;
      }
      setColumnOrder((prev) => {
        const next = prev.filter((key) => key !== source);
        const targetIndex = next.indexOf(target);
        if (targetIndex === -1) {
          return prev;
        }
        next.splice(targetIndex, 0, source);
        saveOrderPreferences(next);
        return next;
      });
    },
    [saveOrderPreferences]
  );

  const renderCell = (initiative: Initiative, key: SortKey) => {
    switch (key) {
      case 'name': {
        const value = initiative.name ?? '';
        return { value, content: value };
      }
      case 'owner': {
        const value = initiative.ownerName || '—';
        return { value, content: value };
      }
      case 'stage': {
        const value = stageLabel(initiative.activeStage);
        return { value, content: value };
      }
      case 'recBenefits': {
        const value = formatCurrency(initiative.totals.recurringBenefits);
        return { value, content: value };
      }
      case 'recCosts': {
        const value = formatCurrency(initiative.totals.recurringCosts);
        return { value, content: value };
      }
      case 'recImpact': {
        const value = formatCurrency(initiative.totals.recurringImpact);
        return { value, content: <span className={styles.impact}>{value}</span> };
      }
      case 'oneoffBenefits': {
        const value = formatCurrency(initiative.totals.oneoffBenefits);
        return { value, content: value };
      }
      case 'oneoffCosts': {
        const value = formatCurrency(initiative.totals.oneoffCosts);
        return { value, content: value };
      }
      case 'l4Date': {
        const value = formatDate(initiative.l4Date);
        return { value, content: value };
      }
      case 'status': {
        const value = initiative.currentStatus || '—';
        return { value, content: value };
      }
      default: {
        return { value: '', content: '' };
      }
    }
  };

  const filtered = useMemo(() => {
    if (!selectedWorkstreamId) {
      return initiatives;
    }
    return initiatives.filter((item) => item.workstreamId === selectedWorkstreamId);
  }, [initiatives, selectedWorkstreamId]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const totalsA = a.totals;
      const totalsB = b.totals;
      const ownerA = a.ownerName?.toLowerCase() ?? '';
      const ownerB = b.ownerName?.toLowerCase() ?? '';
      const statusA = a.currentStatus.toLowerCase();
      const statusB = b.currentStatus.toLowerCase();
      const dateA = a.l4Date ? new Date(a.l4Date).getTime() : 0;
      const dateB = b.l4Date ? new Date(b.l4Date).getTime() : 0;
      switch (sortKey) {
        case 'name':
          return direction * a.name.localeCompare(b.name, 'en');
        case 'owner':
          return direction * ownerA.localeCompare(ownerB, 'en');
        case 'stage':
          return direction * a.activeStage.localeCompare(b.activeStage, 'en');
        case 'recBenefits':
          return direction * (totalsA.recurringBenefits - totalsB.recurringBenefits);
        case 'recCosts':
          return direction * (totalsA.recurringCosts - totalsB.recurringCosts);
        case 'recImpact':
          return direction * (totalsA.recurringImpact - totalsB.recurringImpact);
        case 'oneoffBenefits':
          return direction * (totalsA.oneoffBenefits - totalsB.oneoffBenefits);
        case 'oneoffCosts':
          return direction * (totalsA.oneoffCosts - totalsB.oneoffCosts);
        case 'l4Date':
          return direction * (dateA - dateB);
        case 'status':
          return direction * statusA.localeCompare(statusB, 'en');
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        return current;
      }
      setSortDirection('asc');
      return key;
    });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return null;
    }
    return <span className={styles.sortIcon}>{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const workstreamTabs = [
    { id: null as string | null, name: 'All workstreams' },
    ...workstreams.map((ws) => ({ id: ws.id, name: ws.name }))
  ];

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Initiatives</h1>
          <p className={styles.subtitle}>Track impact, owners, and stage-gate progress per workstream.</p>
        </div>
        <button className={styles.primaryButton} onClick={() => onCreate(selectedWorkstreamId)}>
          Create initiative
        </button>
      </header>

      <div className={styles.tabs}>
        {workstreamTabs.map((tab) => (
          <button
            key={tab.id ?? 'all'}
            className={tab.id === selectedWorkstreamId ? styles.activeTab : styles.tab}
            onClick={() => onSelectWorkstream(tab.id)}
            type="button"
          >
            {tab.name}
          </button>
        ))}
      </div>

      <InitiativesDashboard
        initiatives={initiatives}
        workstreams={workstreams}
        selectedWorkstreamId={selectedWorkstreamId}
      />

      <div className={styles.sectionHeader}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => setInitiativesCollapsed((prev) => !prev)}
          aria-expanded={!initiativesCollapsed}
          aria-label={initiativesCollapsed ? 'Expand initiatives' : 'Collapse initiatives'}
        >
          <ChevronIcon direction={initiativesCollapsed ? 'right' : 'down'} size={14} />
        </button>
        <span className={styles.sectionLabel}>Initiatives</span>
        <span className={styles.sectionCount}>{sorted.length} items</span>
      </div>

      {!initiativesCollapsed && <div className={styles.tableWrapper}>
        {sorted.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No initiatives yet</h2>
            <p>Create the first initiative to start tracking this workstream.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {orderedColumns.map((col) => (
                  <th
                    key={col.key}
                    style={{ width: columnWidths[col.key] }}
                    onDragEnter={() => setDropTargetColumn(col.key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const source = event.dataTransfer.getData('text/plain') as SortKey;
                      if (source) {
                        moveColumn(source, col.key);
                      }
                      setDropTargetColumn(null);
                    }}
                    className={dropTargetColumn === col.key ? styles.dropTarget : undefined}
                  >
                    <div className={styles.headerContent}>
                      <button className={styles.sortButton} onClick={() => handleSort(col.key)} type="button">
                        {col.label} {renderSortIcon(col.key)}
                      </button>
                      <span
                        className={styles.dragHandle}
                        title="Drag to reorder"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', col.key);
                          event.dataTransfer.effectAllowed = 'move';
                          setDropTargetColumn(null);
                        }}
                        onDragEnd={() => {
                          setDropTargetColumn(null);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        ⋮⋮
                      </span>
                    </div>
                    <div
                      className={`${styles.resizeHandle} ${resizingColumn === col.key ? styles.resizing : ''}`}
                      onMouseDown={(e) => handleResizeStart(col.key, e)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((initiative) => (
                <tr key={initiative.id} onClick={() => onOpen(initiative.id)} className={styles.row}>
                  {orderedColumns.map((col) => {
                    const { value, content } = renderCell(initiative, col.key);
                    return (
                      <td key={`${initiative.id}:${col.key}`} style={{ width: columnWidths[col.key] }} title={value}>
                        <span className={styles.cell}>{content}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
    </section>
  );
};
