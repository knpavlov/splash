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
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartWidthRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load preferences on mount
  useEffect(() => {
    if (!session?.accountId) return;
    accountsApi.getUiPreferences(session.accountId).then((prefs) => {
      if (prefs[UI_PREFS_KEY]) {
        setColumnWidths((prev) => ({ ...prev, ...prefs[UI_PREFS_KEY] }));
      }
    }).catch(() => {});
  }, [session?.accountId]);

  const savePreferences = useCallback((widths: Record<string, number>) => {
    if (!session?.accountId) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      accountsApi.getUiPreferences(session.accountId).then((prefs) => {
        return accountsApi.updateUiPreferences(session.accountId, {
          ...prefs,
          [UI_PREFS_KEY]: widths
        });
      }).catch(() => {});
    }, 500);
  }, [session?.accountId]);

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
        savePreferences(prev);
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
  }, [resizingColumn, savePreferences]);

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
                {COLUMNS.map((col) => (
                  <th key={col.key} style={{ width: columnWidths[col.key] }}>
                    <button className={styles.sortButton} onClick={() => handleSort(col.key)} type="button">
                      {col.label} {renderSortIcon(col.key)}
                    </button>
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
                  <td style={{ width: columnWidths.name }}>{initiative.name}</td>
                  <td style={{ width: columnWidths.owner }}>{initiative.ownerName || '—'}</td>
                  <td style={{ width: columnWidths.stage }}>{stageLabel(initiative.activeStage)}</td>
                  <td style={{ width: columnWidths.recBenefits }}>{formatCurrency(initiative.totals.recurringBenefits)}</td>
                  <td style={{ width: columnWidths.recCosts }}>{formatCurrency(initiative.totals.recurringCosts)}</td>
                  <td style={{ width: columnWidths.recImpact }} className={styles.impact}>{formatCurrency(initiative.totals.recurringImpact)}</td>
                  <td style={{ width: columnWidths.oneoffBenefits }}>{formatCurrency(initiative.totals.oneoffBenefits)}</td>
                  <td style={{ width: columnWidths.oneoffCosts }}>{formatCurrency(initiative.totals.oneoffCosts)}</td>
                  <td style={{ width: columnWidths.l4Date }}>{formatDate(initiative.l4Date)}</td>
                  <td style={{ width: columnWidths.status }}>{initiative.currentStatus || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
    </section>
  );
};
