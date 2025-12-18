import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../styles/RiskDashboardScreen.module.css';
import { useInitiativesState, useWorkstreamsState, usePlanSettingsState } from '../../app/state/AppStateContext';
import type { Initiative, InitiativeRisk } from '../../shared/types/initiative';
import type { ProgramSnapshotDetail, ProgramSnapshotSummary } from '../../shared/types/snapshot';
import { snapshotsApi } from '../snapshots/services/snapshotsApi';
import { initiativesApi } from '../initiatives/services/initiativesApi';
import type { InitiativeRiskComment } from '../../shared/types/initiative';
import { useAuth } from '../auth/AuthContext';

type StageColumnKey =
  | 'l0'
  | 'l1-gate'
  | 'l1'
  | 'l2-gate'
  | 'l2'
  | 'l3-gate'
  | 'l3'
  | 'l4-gate'
  | 'l4'
  | 'l5-gate'
  | 'l5';

const stageColumnKeys: StageColumnKey[] = [
  'l0',
  'l1-gate',
  'l1',
  'l2-gate',
  'l2',
  'l3-gate',
  'l3',
  'l4-gate',
  'l4',
  'l5-gate',
  'l5'
];

const stageColumnLabel: Record<StageColumnKey, string> = {
  l0: 'L0',
  'l1-gate': 'L1 Gate',
  l1: 'L1',
  'l2-gate': 'L2 Gate',
  l2: 'L2',
  'l3-gate': 'L3 Gate',
  l3: 'L3',
  'l4-gate': 'L4 Gate',
  l4: 'L4',
  'l5-gate': 'L5 Gate',
  l5: 'L5'
};

const clampScore = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.max(1, Math.min(5, Math.round(numeric)));
};

const resolveStageColumn = (initiative: Pick<Initiative, 'activeStage' | 'stageState'>): StageColumnKey => {
  const stage = initiative.activeStage;
  if (stage === 'l0') {
    return 'l0';
  }
  const status = initiative.stageState?.[stage]?.status ?? 'draft';
  if (status === 'approved') {
    return stage as StageColumnKey;
  }
  return `${stage}-gate` as StageColumnKey;
};

type RiskTone = 'low' | 'medium' | 'high';
const getRiskTone = (score: number): RiskTone => {
  if (score >= 16) {
    return 'high';
  }
  if (score >= 8) {
    return 'medium';
  }
  return 'low';
};

type RiskRow = {
  key: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  ownerName: string | null;
  stageColumn: StageColumnKey;
  risk: InitiativeRisk;
  severity: number;
  likelihood: number;
  score: number;
  tone: RiskTone;
  baseline?: { severity: number; likelihood: number; score: number; tone: RiskTone; stageColumn: StageColumnKey } | null;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const positions = [
  { x: 0.25, y: 0.25 },
  { x: 0.75, y: 0.25 },
  { x: 0.25, y: 0.75 },
  { x: 0.75, y: 0.75 },
  { x: 0.5, y: 0.5 },
  { x: 0.25, y: 0.5 },
  { x: 0.75, y: 0.5 },
  { x: 0.5, y: 0.25 },
  { x: 0.5, y: 0.75 }
];

const resolveDotPosition = (key: string, slot: number) => {
  const hashed = hashString(key);
  const base = positions[(hashed + slot) % positions.length];
  const jitterX = ((hashed % 13) - 6) / 240;
  const jitterY = (((hashed >>> 4) % 13) - 6) / 240;
  return { x: Math.max(0.12, Math.min(0.88, base.x + jitterX)), y: Math.max(0.12, Math.min(0.88, base.y + jitterY)) };
};

export const RiskDashboardScreen = () => {
  const { list: initiatives, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const { riskCategories } = usePlanSettingsState();
  const { session } = useAuth();

  const [snapshotList, setSnapshotList] = useState<ProgramSnapshotSummary[]>([]);
  const [snapshotListLoading, setSnapshotListLoading] = useState(false);
  const [snapshotListError, setSnapshotListError] = useState<string>('');
  const [snapshotCache, setSnapshotCache] = useState<
    Record<string, { status: 'loading' } | { status: 'error' } | { status: 'ready'; detail: ProgramSnapshotDetail }>
  >({});

  const [fromSource, setFromSource] = useState<'none' | 'live' | string>('none');
  const [toSource, setToSource] = useState<'live' | string>('live');
  const [showConnectors, setShowConnectors] = useState(true);

  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<StageColumnKey | 'all'>('all');
  const [query, setQuery] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set());
  const [selectedCell, setSelectedCell] = useState<{ severity: number; likelihood: number } | null>(null);

  const [riskCommentsCache, setRiskCommentsCache] = useState<Record<string, InitiativeRiskComment[]>>({});
  const [riskCommentsLoading, setRiskCommentsLoading] = useState<Record<string, boolean>>({});
  const [riskCommentsError, setRiskCommentsError] = useState<Record<string, string>>({});
  const [expandedRiskKey, setExpandedRiskKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<string>('');

  useEffect(() => {
    if (snapshotListLoading || snapshotList.length) {
      return;
    }
    setSnapshotListLoading(true);
    setSnapshotListError('');
    void snapshotsApi
      .listProgramSnapshots({ limit: 90 })
      .then((list) => setSnapshotList(list))
      .catch((error) => {
        console.error('Failed to load snapshot list', error);
        setSnapshotListError('load_failed');
      })
      .finally(() => setSnapshotListLoading(false));
  }, [snapshotList.length, snapshotListLoading]);

  const requestSnapshot = useCallback((id: string) => {
    setSnapshotCache((prev) => {
      if (prev[id]) {
        return prev;
      }
      return { ...prev, [id]: { status: 'loading' } };
    });
    void snapshotsApi
      .getProgramSnapshot(id)
      .then((detail) => {
        setSnapshotCache((prev) => ({ ...prev, [id]: { status: 'ready', detail } }));
      })
      .catch((error) => {
        console.error('Failed to load snapshot', error);
        setSnapshotCache((prev) => ({ ...prev, [id]: { status: 'error' } }));
      });
  }, []);

  const actor = useMemo(
    () => (session ? { accountId: session.accountId, name: session.email } : undefined),
    [session]
  );

  const ensureRiskCommentsLoaded = useCallback(
    (initiativeId: string) => {
      if (riskCommentsCache[initiativeId] || riskCommentsLoading[initiativeId]) {
        return;
      }
      setRiskCommentsLoading((prev) => ({ ...prev, [initiativeId]: true }));
      setRiskCommentsError((prev) => ({ ...prev, [initiativeId]: '' }));
      void initiativesApi
        .listRiskComments(initiativeId)
        .then((comments) => {
          setRiskCommentsCache((prev) => ({ ...prev, [initiativeId]: comments }));
        })
        .catch((error) => {
          console.error('Failed to load risk comments', error);
          setRiskCommentsError((prev) => ({ ...prev, [initiativeId]: 'load_failed' }));
        })
        .finally(() => {
          setRiskCommentsLoading((prev) => ({ ...prev, [initiativeId]: false }));
        });
    },
    [riskCommentsCache, riskCommentsLoading]
  );

  const upsertRiskComment = useCallback((comment: InitiativeRiskComment) => {
    setRiskCommentsCache((prev) => {
      const list = prev[comment.initiativeId] ?? [];
      const next = [...list.filter((item) => item.id !== comment.id), comment].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      return { ...prev, [comment.initiativeId]: next };
    });
  }, []);

  const handleToggleRiskDetails = useCallback(
    (row: RiskRow) => {
      setExpandedRiskKey((prev) => {
        const next = prev === row.key ? null : row.key;
        return next;
      });
      setCommentDraft('');
      ensureRiskCommentsLoaded(row.initiativeId);
    },
    [ensureRiskCommentsLoaded]
  );

  const handleSubmitRiskComment = useCallback(
    async (row: RiskRow) => {
      const body = commentDraft.trim();
      if (!body) {
        return;
      }
      const snapshotId = toSource === 'live' ? null : toSource;
      const created = await initiativesApi.createRiskComment(
        row.initiativeId,
        { riskId: row.risk.id, body, snapshotId },
        actor
      );
      upsertRiskComment(created);
      setCommentDraft('');
    },
    [actor, commentDraft, toSource, upsertRiskComment]
  );

  const handleResolveRiskComment = useCallback(
    async (initiativeId: string, commentId: string, resolved: boolean) => {
      const updated = await initiativesApi.setRiskCommentResolution(initiativeId, commentId, resolved, actor);
      upsertRiskComment(updated);
    },
    [actor, upsertRiskComment]
  );

  useEffect(() => {
    if (toSource !== 'live') {
      requestSnapshot(toSource);
    }
  }, [requestSnapshot, toSource]);

  useEffect(() => {
    if (fromSource !== 'none' && fromSource !== 'live') {
      requestSnapshot(fromSource);
    }
  }, [fromSource, requestSnapshot]);

  const sourceOptions = useMemo(() => {
    const items = [...snapshotList].sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
    return items.map((snapshot) => ({
      id: snapshot.id,
      label: new Date(snapshot.capturedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    }));
  }, [snapshotList]);

  const resolveSnapshot = useCallback(
    (id: string) => {
      const entry = snapshotCache[id];
      if (!entry || entry.status !== 'ready') {
        return null;
      }
      return entry.detail;
    },
    [snapshotCache]
  );

  const toSnapshot = useMemo(() => (toSource === 'live' ? null : resolveSnapshot(toSource)), [resolveSnapshot, toSource]);
  const fromSnapshot = useMemo(() => {
    if (fromSource === 'none' || fromSource === 'live') {
      return null;
    }
    return resolveSnapshot(fromSource);
  }, [fromSource, resolveSnapshot]);

  const toInitiatives = useMemo(() => {
    if (toSource === 'live') {
      return initiatives;
    }
    const list = toSnapshot?.payload?.initiatives ?? [];
    return list as unknown as Initiative[];
  }, [initiatives, toSnapshot, toSource]);

  const fromInitiatives = useMemo(() => {
    if (fromSource === 'none') {
      return null;
    }
    if (fromSource === 'live') {
      return initiatives;
    }
    const list = fromSnapshot?.payload?.initiatives ?? [];
    return list as unknown as Initiative[];
  }, [fromSnapshot, fromSource, initiatives]);

  const initiativeOptions = useMemo(() => {
    const candidates = workstreamFilter === 'all'
      ? toInitiatives
      : toInitiatives.filter((initiative) => initiative.workstreamId === workstreamFilter);
    return [...candidates].sort((a, b) => a.name.localeCompare(b.name));
  }, [toInitiatives, workstreamFilter]);

  const allRiskCategories = useMemo(() => {
    const seen = new Map<string, string>();
    (riskCategories.length ? riskCategories : ['Uncategorized']).forEach((category) => {
      seen.set(category.toLowerCase(), category);
    });
    toInitiatives.forEach((initiative) => {
      (initiative.risks ?? []).forEach((risk) => {
        const raw = (risk.category ?? '').trim() || 'Uncategorized';
        const key = raw.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, raw);
        }
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [riskCategories, toInitiatives]);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const key = category.toLowerCase();
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const clearCategories = useCallback(() => setSelectedCategories(new Set()), []);

  const baselineByKey = useMemo(() => {
    if (!fromInitiatives) {
      return new Map<string, { severity: number; likelihood: number; score: number; tone: RiskTone; stageColumn: StageColumnKey }>();
    }
    const map = new Map<string, { severity: number; likelihood: number; score: number; tone: RiskTone; stageColumn: StageColumnKey }>();
    fromInitiatives.forEach((initiative) => {
      const stageColumn = resolveStageColumn(initiative);
      (initiative.risks ?? []).forEach((risk) => {
        const severity = clampScore(risk.severity);
        const likelihood = clampScore(risk.likelihood);
        const score = severity * likelihood;
        map.set(`${initiative.id}:${risk.id}`, { severity, likelihood, score, tone: getRiskTone(score), stageColumn });
      });
    });
    return map;
  }, [fromInitiatives]);

  const allRiskRows = useMemo<RiskRow[]>(() => {
    const workstreamNameById = new Map(workstreams.map((workstream) => [workstream.id, workstream.name]));
    const rows: RiskRow[] = [];
    toInitiatives.forEach((initiative) => {
      const stageColumn = resolveStageColumn(initiative);
      const workstreamName =
        (initiative as unknown as { workstreamName?: string | null }).workstreamName ??
        workstreamNameById.get(initiative.workstreamId) ??
        'Unassigned';
      const ownerName = (initiative as unknown as { ownerName?: string | null }).ownerName ?? null;
      (initiative.risks ?? []).forEach((risk) => {
        const severity = clampScore(risk.severity);
        const likelihood = clampScore(risk.likelihood);
        const score = severity * likelihood;
        const baseline = baselineByKey.get(`${initiative.id}:${risk.id}`) ?? null;
        rows.push({
          key: `${initiative.id}:${risk.id}`,
          initiativeId: initiative.id,
          initiativeName: initiative.name,
          workstreamId: initiative.workstreamId,
          workstreamName,
          ownerName,
          stageColumn,
          risk,
          severity,
          likelihood,
          score,
          tone: getRiskTone(score),
          baseline
        });
      });
    });
    rows.sort((a, b) => b.score - a.score || a.risk.title.localeCompare(b.risk.title));
    return rows;
  }, [baselineByKey, toInitiatives, workstreams]);

  const filteredRiskRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allRiskRows.filter((row) => {
      if (workstreamFilter !== 'all' && row.workstreamId !== workstreamFilter) {
        return false;
      }
      if (initiativeFilter !== 'all' && row.initiativeId !== initiativeFilter) {
        return false;
      }
      if (stageFilter !== 'all' && row.stageColumn !== stageFilter) {
        return false;
      }
      const normalizedCategory = (row.risk.category ?? '').trim().toLowerCase() || 'uncategorized';
      if (selectedCategories.size && !selectedCategories.has(normalizedCategory)) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = [
          row.risk.title,
          row.risk.description,
          row.risk.mitigation,
          row.risk.category,
          row.initiativeName,
          row.workstreamName,
          row.ownerName ?? ''
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }
      if (selectedCell) {
        if (row.severity !== selectedCell.severity || row.likelihood !== selectedCell.likelihood) {
          return false;
        }
      }
      return true;
    });
  }, [allRiskRows, initiativeFilter, query, selectedCell, selectedCategories, stageFilter, workstreamFilter]);

  const matrixRows = useMemo(() => {
    const map = new Map<string, RiskRow[]>();
    allRiskRows.forEach((row) => {
      if (workstreamFilter !== 'all' && row.workstreamId !== workstreamFilter) {
        return;
      }
      if (initiativeFilter !== 'all' && row.initiativeId !== initiativeFilter) {
        return;
      }
      if (stageFilter !== 'all' && row.stageColumn !== stageFilter) {
        return;
      }
      const normalizedCategory = (row.risk.category ?? '').trim().toLowerCase() || 'uncategorized';
      if (selectedCategories.size && !selectedCategories.has(normalizedCategory)) {
        return;
      }
      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery) {
        const haystack = [
          row.risk.title,
          row.risk.description,
          row.risk.mitigation,
          row.risk.category,
          row.initiativeName,
          row.workstreamName,
          row.ownerName ?? ''
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return;
        }
      }

      const key = `${row.severity}:${row.likelihood}`;
      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    });
    for (const bucket of map.values()) {
      bucket.sort((a, b) => b.score - a.score || a.initiativeName.localeCompare(b.initiativeName));
    }
    return map;
  }, [allRiskRows, initiativeFilter, query, selectedCategories, stageFilter, workstreamFilter]);

  const handleCellClick = useCallback((severity: number, likelihood: number) => {
    setSelectedCell((prev) => {
      if (prev && prev.severity === severity && prev.likelihood === likelihood) {
        return null;
      }
      return { severity, likelihood };
    });
  }, []);

  const clearCellSelection = useCallback(() => setSelectedCell(null), []);

  const totalRiskCount = allRiskRows.length;

  const matrixRef = useRef<HTMLDivElement | null>(null);
  const [matrixSize, setMatrixSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const element = matrixRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setMatrixSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    const rect = element.getBoundingClientRect();
    setMatrixSize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, []);

  const movementEdges = useMemo(() => {
    if (!fromInitiatives || !showConnectors) {
      return [];
    }
    const edges: Array<{
      key: string;
      from: { severity: number; likelihood: number; score: number };
      to: { severity: number; likelihood: number; score: number };
    }> = [];
    allRiskRows.forEach((row) => {
      if (!row.baseline) {
        return;
      }
      if (row.baseline.severity === row.severity && row.baseline.likelihood === row.likelihood) {
        return;
      }
      edges.push({
        key: row.key,
        from: { severity: row.baseline.severity, likelihood: row.baseline.likelihood, score: row.baseline.score },
        to: { severity: row.severity, likelihood: row.likelihood, score: row.score }
      });
    });
    return edges;
  }, [allRiskRows, fromInitiatives, showConnectors]);

  const connectorPaths = useMemo(() => {
    const gap = 8;
    const width = matrixSize.width;
    const height = matrixSize.height;
    if (!width || !height) {
      return [];
    }
    const cellWidth = (width - gap * 4) / 5;
    const cellHeight = (height - gap * 4) / 5;
    const coord = (severity: number, likelihood: number, pos: { x: number; y: number }) => {
      const row = 5 - severity;
      const col = likelihood - 1;
      const x = col * (cellWidth + gap) + pos.x * cellWidth;
      const y = row * (cellHeight + gap) + pos.y * cellHeight;
      return { x, y };
    };
    return movementEdges.map((edge) => {
      const startPos = resolveDotPosition(edge.key, 0);
      const endPos = resolveDotPosition(edge.key, 3);
      const from = coord(edge.from.severity, edge.from.likelihood, startPos);
      const to = coord(edge.to.severity, edge.to.likelihood, endPos);
      const delta = edge.to.score - edge.from.score;
      const tone: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      return { key: edge.key, from, to, tone };
    });
  }, [matrixSize.height, matrixSize.width, movementEdges]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2>Risk matrix</h2>
          <p className={styles.subtitle}>Portfolio-wide view of initiative risks across severity/likelihood.</p>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.snapshotControls}>
          <label className={styles.filterField}>
            <span>From (baseline)</span>
            <select value={fromSource} onChange={(e) => setFromSource(e.target.value as any)}>
              <option value="none">None</option>
              <option value="live">Live</option>
              {sourceOptions.map((option) => (
                <option key={`from-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterField}>
            <span>To (current)</span>
            <select
              value={toSource}
              onChange={(e) => {
                setToSource(e.target.value as any);
                setInitiativeFilter('all');
              }}
            >
              <option value="live">Live</option>
              {sourceOptions.map((option) => (
                <option key={`to-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={showConnectors}
              onChange={(e) => setShowConnectors(e.target.checked)}
              disabled={fromSource === 'none'}
            />
            <span>Show movement</span>
          </label>

          {snapshotListError && <div className={styles.filterHint}>Snapshots unavailable</div>}
          {snapshotListLoading && <div className={styles.filterHint}>Loading snapshots…</div>}
        </div>

        <label className={styles.filterField}>
          <span>Workstream</span>
          <select
            value={workstreamFilter}
            onChange={(e) => {
              setWorkstreamFilter(e.target.value);
              setInitiativeFilter('all');
            }}
          >
            <option value="all">All</option>
            {workstreams.map((workstream) => (
              <option key={workstream.id} value={workstream.id}>
                {workstream.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>Initiative</span>
          <select value={initiativeFilter} onChange={(e) => setInitiativeFilter(e.target.value)} disabled={!initiativeOptions.length}>
            <option value="all">All</option>
            {initiativeOptions.map((initiative) => (
              <option key={initiative.id} value={initiative.id}>
                {initiative.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>Stage / gate</span>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as StageColumnKey | 'all')}>
            <option value="all">All</option>
            {stageColumnKeys.map((key) => (
              <option key={key} value={key}>
                {stageColumnLabel[key]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.searchField}>
          <span>Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, mitigation, initiative…"
          />
        </label>

        <div className={styles.categoryFilter}>
          <div className={styles.categoryHeader}>
            <span>Risk type</span>
            {selectedCategories.size > 0 && (
              <button type="button" className={styles.linkButton} onClick={clearCategories}>
                Clear
              </button>
            )}
          </div>
          <div className={styles.categoryChips}>
            {allRiskCategories.map((category) => {
              const normalized = category.toLowerCase();
              const active = selectedCategories.has(normalized);
              return (
                <button
                  key={category}
                  type="button"
                  className={`${styles.categoryChip} ${active ? styles.categoryChipActive : ''}`}
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.filterHint}>
          {loaded ? `${totalRiskCount} risks • ${initiatives.length} initiatives` : 'Loading…'}
        </div>
        {selectedCell && (
          <div className={styles.filterHint}>
            Cell: S{selectedCell.severity} × L{selectedCell.likelihood}{' '}
            <button type="button" className={styles.linkButton} onClick={clearCellSelection}>
              Clear
            </button>
          </div>
        )}
      </div>

      <section className={styles.matrixSection}>
        <div className={styles.matrixHeader}>
          <h3>5×5 risk matrix</h3>
          <p>Click a cell to filter. Dots are individual risks.</p>
        </div>

        <div className={styles.matrixWrapper}>
          <div className={styles.matrixAxisY}>Severity</div>
          <div className={styles.matrixAxisX}>Likelihood</div>
          <div className={styles.matrixCanvas} ref={matrixRef}>
            {connectorPaths.length > 0 && fromSource !== 'none' && (
              <svg className={styles.matrixOverlay} viewBox={`0 0 ${matrixSize.width} ${matrixSize.height}`} aria-hidden="true">
                <defs>
                  <marker id="risk-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.55)" />
                  </marker>
                </defs>
                {connectorPaths.map((edge) => (
                  <line
                    key={`edge-${edge.key}`}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    markerEnd="url(#risk-arrow)"
                    className={
                      edge.tone === 'up'
                        ? styles.connectorUp
                        : edge.tone === 'down'
                          ? styles.connectorDown
                          : styles.connectorFlat
                    }
                  />
                ))}
              </svg>
            )}

            <div className={styles.matrixGrid} role="grid" aria-label="Risk matrix">
            {Array.from({ length: 5 }).map((_, rowIndex) => {
              const severity = 5 - rowIndex;
              return Array.from({ length: 5 }).map((__, colIndex) => {
                const likelihood = colIndex + 1;
                const cellKey = `${severity}:${likelihood}`;
                const items = matrixRows.get(cellKey) ?? [];
                const active = selectedCell?.severity === severity && selectedCell?.likelihood === likelihood;
                const rendered = items.slice(0, 9);
                return (
                  <button
                    key={cellKey}
                    type="button"
                    className={`${styles.matrixCell} ${active ? styles.matrixCellActive : ''}`}
                    onClick={() => handleCellClick(severity, likelihood)}
                    aria-label={`Severity ${severity}, Likelihood ${likelihood}. ${items.length} risks.`}
                  >
                    <span className={styles.matrixCellLabel}>
                      {severity}×{likelihood}
                    </span>
                    {rendered.map((item, index) => {
                      const pos = resolveDotPosition(item.key, index);
                      return (
                        <span
                          key={item.key}
                          className={`${styles.riskDot} ${
                            item.tone === 'high'
                              ? styles.riskDotHigh
                              : item.tone === 'medium'
                                ? styles.riskDotMedium
                                : styles.riskDotLow
                          }`}
                          style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                          title={`${item.risk.title}\n${item.initiativeName} • ${item.workstreamName}\nS${item.severity} × L${item.likelihood} = ${item.score}`}
                        />
                      );
                    })}
                    {items.length > rendered.length && (
                      <span className={styles.moreBadge} title={`${items.length} risks in this cell`}>
                        +{items.length - rendered.length}
                      </span>
                    )}
                  </button>
                );
              });
            })}
            </div>
          </div>

          <div className={styles.axisTicksY}>
            {[5, 4, 3, 2, 1].map((value) => (
              <div key={`y-${value}`} className={styles.axisTick}>
                {value}
              </div>
            ))}
          </div>
          <div className={styles.axisTicksX}>
            {[1, 2, 3, 4, 5].map((value) => (
              <div key={`x-${value}`} className={styles.axisTick}>
                {value}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3>Risks</h3>
          <p>{filteredRiskRows.length} shown</p>
        </div>

        {!loaded ? (
          <div className={styles.placeholder}>Loading…</div>
        ) : filteredRiskRows.length === 0 ? (
          <div className={styles.placeholder}>No risks match the current filters.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Risk</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Initiative</th>
                  <th>Workstream</th>
                  <th>Owner</th>
                  <th>Stage</th>
                  {fromSource !== 'none' && <th>Movement</th>}
                  <th>Severity</th>
                  <th>Likelihood</th>
                  <th>Mitigation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRiskRows.slice(0, 200).flatMap((row) => {
                  const comments = riskCommentsCache[row.initiativeId] ?? [];
                  const riskComments = comments.filter((comment) => comment.riskId === row.risk.id);
                  const openCount = riskComments.filter((comment) => !comment.resolvedAt).length;
                  const isExpanded = expandedRiskKey === row.key;
                  const colSpan = fromSource !== 'none' ? 13 : 12;
                  return [
                    (
                      <tr key={row.key}>
                        <td className={styles.scoreCell}>
                          <span
                            className={`${styles.scoreBadge} ${
                              row.tone === 'high'
                                ? styles.scoreHigh
                                : row.tone === 'medium'
                                  ? styles.scoreMedium
                                  : styles.scoreLow
                            }`}
                          >
                            {row.score}
                          </span>
                        </td>
                        <td className={styles.riskTitleCell} title={row.risk.description || row.risk.title}>
                          {row.risk.title || '(Untitled)'}
                        </td>
                        <td className={styles.descriptionCell} title={row.risk.description}>
                          {row.risk.description}
                        </td>
                        <td>{row.risk.category || 'Uncategorized'}</td>
                        <td>
                          <a className={styles.link} href={`#/initiatives/view/${row.initiativeId}`}>
                            {row.initiativeName}
                          </a>
                        </td>
                        <td>{row.workstreamName}</td>
                        <td>{row.ownerName ?? '—'}</td>
                        <td>{stageColumnLabel[row.stageColumn]}</td>
                        {fromSource !== 'none' && (
                          <td className={styles.movementCell}>
                            {row.baseline
                              ? `S${row.baseline.severity}×L${row.baseline.likelihood} → S${row.severity}×L${row.likelihood}`
                              : '—'}
                          </td>
                        )}
                        <td>{row.severity}</td>
                        <td>{row.likelihood}</td>
                        <td className={styles.mitigationCell}>{row.risk.mitigation}</td>
                        <td className={styles.actionCell}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => handleToggleRiskDetails(row)}
                          >
                            Comments{openCount ? ` (${openCount})` : ''}
                          </button>
                        </td>
                      </tr>
                    ),
                    isExpanded ? (
                      <tr key={`${row.key}:details`}>
                        <td colSpan={colSpan} className={styles.detailsCell}>
                          <div className={styles.commentPanel}>
                            <div className={styles.commentPanelHeader}>
                              <div>
                                <strong>{row.risk.title || '(Untitled)'}</strong>
                                <div className={styles.commentPanelMeta}>
                                  {row.initiativeName} • {row.workstreamName}
                                </div>
                              </div>
                              <button type="button" className={styles.linkButton} onClick={() => setExpandedRiskKey(null)}>
                                Close
                              </button>
                            </div>

                            {riskCommentsLoading[row.initiativeId] ? (
                              <div className={styles.commentPanelHint}>Loading comments…</div>
                            ) : riskCommentsError[row.initiativeId] ? (
                              <div className={styles.commentPanelHint}>Failed to load comments.</div>
                            ) : riskComments.length === 0 ? (
                              <div className={styles.commentPanelHint}>No comments yet.</div>
                            ) : (
                              <ul className={styles.commentList}>
                                {riskComments.map((comment) => (
                                  <li key={comment.id} className={styles.commentItem}>
                                    <div className={styles.commentBody}>{comment.body}</div>
                                    <div className={styles.commentMeta}>
                                      <span>
                                        {comment.authorName ?? 'Unknown'} •{' '}
                                        {new Date(comment.createdAt).toLocaleString('en-US', {
                                          dateStyle: 'medium',
                                          timeStyle: 'short'
                                        })}
                                      </span>
                                      <button
                                        type="button"
                                        className={styles.linkButton}
                                        onClick={() => handleResolveRiskComment(row.initiativeId, comment.id, !comment.resolvedAt)}
                                      >
                                        {comment.resolvedAt ? 'Reopen' : 'Resolve'}
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <div className={styles.commentComposer}>
                              <textarea
                                rows={3}
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                placeholder="Leave a review comment for the initiative owner…"
                              />
                              <div className={styles.commentComposerActions}>
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  onClick={() => void handleSubmitRiskComment(row)}
                                  disabled={!session || !commentDraft.trim()}
                                >
                                  Post comment
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null
                  ].filter(Boolean) as any;
                })}
              </tbody>
            </table>
            {filteredRiskRows.length > 200 && (
              <div className={styles.tableHint}>Showing first 200 risks. Narrow filters to see the rest.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
