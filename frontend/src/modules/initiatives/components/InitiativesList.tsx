import { useMemo, useState } from 'react';
import styles from '../../../styles/InitiativesList.module.css';
import { Initiative, initiativeStageLabels } from '../../../shared/types/initiative';
import { Workstream } from '../../../shared/types/workstream';
import { InitiativesDashboard } from './InitiativesDashboard';

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
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

      <div className={styles.tableWrapper}>
        {sorted.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No initiatives yet</h2>
            <p>Create the first initiative to start tracking this workstream.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('name')} type="button">
                    Initiative name {renderSortIcon('name')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('owner')} type="button">
                    Initiative owner {renderSortIcon('owner')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('stage')} type="button">
                    Stage gate {renderSortIcon('stage')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('recBenefits')} type="button">
                    Recurring benefits {renderSortIcon('recBenefits')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('recCosts')} type="button">
                    Recurring costs {renderSortIcon('recCosts')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('recImpact')} type="button">
                    Recurring impact {renderSortIcon('recImpact')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('oneoffBenefits')} type="button">
                    One-off benefits {renderSortIcon('oneoffBenefits')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('oneoffCosts')} type="button">
                    One-off costs {renderSortIcon('oneoffCosts')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('l4Date')} type="button">
                    L4 date {renderSortIcon('l4Date')}
                  </button>
                </th>
                <th>
                  <button className={styles.sortButton} onClick={() => handleSort('status')} type="button">
                    Current status {renderSortIcon('status')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((initiative) => (
                <tr key={initiative.id} onClick={() => onOpen(initiative.id)} className={styles.row}>
                  <td>{initiative.name}</td>
                  <td>{initiative.ownerName || '—'}</td>
                  <td>{stageLabel(initiative.activeStage)}</td>
                  <td>{formatCurrency(initiative.totals.recurringBenefits)}</td>
                  <td>{formatCurrency(initiative.totals.recurringCosts)}</td>
                  <td className={styles.impact}>{formatCurrency(initiative.totals.recurringImpact)}</td>
                  <td>{formatCurrency(initiative.totals.oneoffBenefits)}</td>
                  <td>{formatCurrency(initiative.totals.oneoffCosts)}</td>
                  <td>{formatDate(initiative.l4Date)}</td>
                  <td>{initiative.currentStatus || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
