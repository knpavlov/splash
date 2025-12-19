import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../styles/RiskDashboardScreen.module.css';
import { useInitiativesState, usePlanSettingsState, useWorkstreamsState } from '../../app/state/AppStateContext';
import type { Initiative, InitiativeRisk, InitiativeRiskComment } from '../../shared/types/initiative';
import type { ProgramSnapshotDetail, ProgramSnapshotSummary } from '../../shared/types/snapshot';
import { snapshotsApi } from '../snapshots/services/snapshotsApi';
import { initiativesApi } from '../initiatives/services/initiativesApi';
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
  baseline?: { severity: number; likelihood: number; score: number } | null;
};

type RiskSortKey =
  | 'score'
  | 'risk'
  | 'description'
  | 'type'
  | 'initiative'
  | 'workstream'
  | 'owner'
  | 'stage'
  | 'movement'
  | 'severity'
  | 'likelihood'
  | 'mitigation'
  | 'comments';

const defaultSortDirectionForKey = (key: RiskSortKey): 'asc' | 'desc' => {
  if (
    key === 'risk' ||
    key === 'description' ||
    key === 'type' ||
    key === 'initiative' ||
    key === 'workstream' ||
    key === 'owner'
  ) {
    return 'asc';
  }
  return 'desc';
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
  return {
    x: Math.max(0.12, Math.min(0.88, base.x + jitterX)),
    y: Math.max(0.12, Math.min(0.88, base.y + jitterY))
  };
};

export const RiskDashboardScreen = () => {
  const { list: initiatives, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const { riskCategories } = usePlanSettingsState();
  const { session } = useAuth();

  const [snapshotList, setSnapshotList] = useState<ProgramSnapshotSummary[]>([]);
  const [snapshotListLoading, setSnapshotListLoading] = useState(false);
  const [snapshotListError, setSnapshotListError] = useState('');
  const [snapshotCache, setSnapshotCache] = useState<
    Record<string, { status: 'loading' } | { status: 'error' } | { status: 'ready'; detail: ProgramSnapshotDetail }>
  >({});

  const [fromSource, setFromSource] = useState<'none' | 'live' | string>('none');
  const [toSource, setToSource] = useState<'live' | string>('live');
  const [showConnectors, setShowConnectors] = useState(true);

  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<StageColumnKey | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set());
  const [selectedCell, setSelectedCell] = useState<{ severity: number; likelihood: number } | null>(null);

  const [riskCommentsCache, setRiskCommentsCache] = useState<Record<string, InitiativeRiskComment[]>>({});
  const [riskCommentsLoading, setRiskCommentsLoading] = useState<Record<string, boolean>>({});
  const [riskCommentsError, setRiskCommentsError] = useState<Record<string, string>>({});
  const [expandedCommentsKeys, setExpandedCommentsKeys] = useState<Set<string>>(() => new Set());
  const [composerKey, setComposerKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');

  const [sort, setSort] = useState<{ key: RiskSortKey; direction: 'asc' | 'desc' }>({
    key: 'score',
    direction: 'desc'
  });

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
      .then((detail) => setSnapshotCache((prev) => ({ ...prev, [id]: { status: 'ready', detail } })))
      .catch((error) => {
        console.error('Failed to load snapshot', error);
        setSnapshotCache((prev) => ({ ...prev, [id]: { status: 'error' } }));
      });
  }, []);

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
        .then((comments) => setRiskCommentsCache((prev) => ({ ...prev, [initiativeId]: comments })))
        .catch((error) => {
          console.error('Failed to load risk comments', error);
          setRiskCommentsError((prev) => ({ ...prev, [initiativeId]: 'load_failed' }));
        })
        .finally(() => setRiskCommentsLoading((prev) => ({ ...prev, [initiativeId]: false })));
    },
    [riskCommentsCache, riskCommentsLoading]
  );

  const upsertRiskComment = useCallback((comment: InitiativeRiskComment) => {
    setRiskCommentsCache((prev) => {
      const list = prev[comment.initiativeId] ?? [];
      const next = [...list.filter((item) => item.id !== comment.id), comment].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      return { ...prev, [comment.initiativeId]: next };
    });
  }, []);

  const handleResolveRiskComment = useCallback(
    async (initiativeId: string, commentId: string, resolved: boolean) => {
      const updated = await initiativesApi.setRiskCommentResolution(initiativeId, commentId, resolved, actor);
      upsertRiskComment(updated);
    },
    [actor, upsertRiskComment]
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
      setComposerKey(null);
    },
    [actor, commentDraft, toSource, upsertRiskComment]
  );

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
    return (toSnapshot?.payload?.initiatives ?? []) as unknown as Initiative[];
  }, [initiatives, toSnapshot, toSource]);

  const fromInitiatives = useMemo(() => {
    if (fromSource === 'none') {
      return null;
    }
    if (fromSource === 'live') {
      return initiatives;
    }
    return (fromSnapshot?.payload?.initiatives ?? []) as unknown as Initiative[];
  }, [fromSnapshot, fromSource, initiatives]);

  const initiativeOptions = useMemo(() => {
    const candidates =
      workstreamFilter === 'all'
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
    const map = new Map<string, { severity: number; likelihood: number; score: number }>();
    if (!fromInitiatives) {
      return map;
    }
    fromInitiatives.forEach((initiative) => {
      (initiative.risks ?? []).forEach((risk) => {
        const severity = clampScore(risk.severity);
        const likelihood = clampScore(risk.likelihood);
        map.set(`${initiative.id}:${risk.id}`, { severity, likelihood, score: severity * likelihood });
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
          baseline: baselineByKey.get(`${initiative.id}:${risk.id}`) ?? null
        });
      });
    });
    return rows;
  }, [baselineByKey, toInitiatives, workstreams]);

  const totalRiskCount = allRiskRows.length;

  const getRowComments = useCallback(
    (row: RiskRow) => {
      const comments = riskCommentsCache[row.initiativeId] ?? [];
      const riskComments = comments.filter((comment) => comment.riskId === row.risk.id);
      riskComments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const openCount = riskComments.reduce((acc, comment) => acc + (comment.resolvedAt ? 0 : 1), 0);
      const latestAt = riskComments.length ? riskComments[0].createdAt : null;
      return { riskComments, openCount, latestAt };
    },
    [riskCommentsCache]
  );

  const isRowVisibleForFilters = useCallback(
    (row: RiskRow, includeCell: boolean) => {
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
          return false;
        }
      }
      if (includeCell && selectedCell) {
        return row.severity === selectedCell.severity && row.likelihood === selectedCell.likelihood;
      }
      return true;
    },
    [initiativeFilter, query, selectedCell, selectedCategories, stageFilter, workstreamFilter]
  );

  const filteredRiskRows = useMemo(
    () => allRiskRows.filter((row) => isRowVisibleForFilters(row, true)),
    [allRiskRows, isRowVisibleForFilters]
  );

  const sortedRiskRows = useMemo(() => {
    const directionFactor = sort.direction === 'asc' ? 1 : -1;
    const stageIndex = (value: StageColumnKey) => stageColumnKeys.indexOf(value);
    const safeText = (value: string | null | undefined) => (typeof value === 'string' ? value : '');
    const compareText = (a: string, b: string) => a.localeCompare(b) * directionFactor;
    const compareNumber = (a: number, b: number) => (a - b) * directionFactor;

    const compare = (a: RiskRow, b: RiskRow) => {
      switch (sort.key) {
        case 'score':
          return compareNumber(a.score, b.score) || compareText(safeText(a.risk.title), safeText(b.risk.title));
        case 'risk':
          return compareText(safeText(a.risk.title), safeText(b.risk.title)) || compareNumber(b.score, a.score) * directionFactor;
        case 'description':
          return compareText(safeText(a.risk.description), safeText(b.risk.description));
        case 'type':
          return compareText(safeText(a.risk.category), safeText(b.risk.category)) || compareNumber(b.score, a.score) * directionFactor;
        case 'initiative':
          return compareText(a.initiativeName, b.initiativeName) || compareNumber(b.score, a.score) * directionFactor;
        case 'workstream':
          return compareText(a.workstreamName, b.workstreamName) || compareNumber(b.score, a.score) * directionFactor;
        case 'owner':
          return compareText(safeText(a.ownerName), safeText(b.ownerName)) || compareNumber(b.score, a.score) * directionFactor;
        case 'stage':
          return compareNumber(stageIndex(a.stageColumn), stageIndex(b.stageColumn)) || compareNumber(b.score, a.score) * directionFactor;
        case 'movement': {
          const aDelta = a.baseline ? a.score - a.baseline.score : Number.NEGATIVE_INFINITY;
          const bDelta = b.baseline ? b.score - b.baseline.score : Number.NEGATIVE_INFINITY;
          return compareNumber(aDelta, bDelta) || compareNumber(b.score, a.score) * directionFactor;
        }
        case 'severity':
          return (
            compareNumber(a.severity, b.severity) ||
            compareNumber(a.likelihood, b.likelihood) ||
            compareNumber(b.score, a.score) * directionFactor
          );
        case 'likelihood':
          return (
            compareNumber(a.likelihood, b.likelihood) ||
            compareNumber(a.severity, b.severity) ||
            compareNumber(b.score, a.score) * directionFactor
          );
        case 'mitigation':
          return compareText(safeText(a.risk.mitigation), safeText(b.risk.mitigation)) || compareNumber(b.score, a.score) * directionFactor;
        case 'comments': {
          const aMeta = getRowComments(a);
          const bMeta = getRowComments(b);
          const aRank = aMeta.latestAt ?? '';
          const bRank = bMeta.latestAt ?? '';
          return compareText(aRank, bRank) || compareNumber(aMeta.openCount, bMeta.openCount) || compareNumber(b.score, a.score) * directionFactor;
        }
        default:
          return 0;
      }
    };

    const rows = [...filteredRiskRows];
    rows.sort((a, b) => compare(a, b));
    return rows;
  }, [filteredRiskRows, getRowComments, sort.direction, sort.key]);

  const visibleInitiativeIds = useMemo(() => {
    const ids = new Set<string>();
    sortedRiskRows.slice(0, 200).forEach((row) => ids.add(row.initiativeId));
    return Array.from(ids);
  }, [sortedRiskRows]);

  useEffect(() => {
    visibleInitiativeIds.forEach((initiativeId) => ensureRiskCommentsLoaded(initiativeId));
  }, [ensureRiskCommentsLoaded, visibleInitiativeIds]);

  const toggleSort = useCallback((key: RiskSortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: defaultSortDirectionForKey(key) };
    });
  }, []);

  const toggleExpandedComments = useCallback((key: string) => {
    setExpandedCommentsKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const renderSortLabel = useCallback(
    (label: string, key: RiskSortKey) => `${label}${sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}`,
    [sort.direction, sort.key]
  );

  const handleCellClick = useCallback((severity: number, likelihood: number) => {
    setSelectedCell((prev) => {
      if (prev && prev.severity === severity && prev.likelihood === likelihood) {
        return null;
      }
      return { severity, likelihood };
    });
  }, []);

  const clearCellSelection = useCallback(() => setSelectedCell(null), []);

  const matrixRows = useMemo(() => {
    const map = new Map<string, RiskRow[]>();
    allRiskRows.forEach((row) => {
      if (!isRowVisibleForFilters(row, false)) {
        return;
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
  }, [allRiskRows, isRowVisibleForFilters]);

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
      if (!isRowVisibleForFilters(row, false)) {
        return;
      }
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
  }, [allRiskRows, fromInitiatives, isRowVisibleForFilters, showConnectors]);

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

  const connectorPaths = useMemo(() => {
    const gap = 10;
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
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Risk matrix</h1>
          <p className={styles.subtitle}>Portfolio-wide view of initiative risks across severity and likelihood.</p>
          <div className={styles.metaRow}>
            <span className={styles.metaBadge}>
              {sortedRiskRows.length} shown / {totalRiskCount} total
            </span>
            {selectedCell && (
              <span className={styles.metaBadge}>
                Cell: S{selectedCell.severity} x L{selectedCell.likelihood}{' '}
                <button type="button" className={styles.inlineLink} onClick={clearCellSelection}>
                  Clear
                </button>
              </span>
            )}
            {fromSource !== 'none' && (
              <span className={styles.metaBadge}>
                Movement: {showConnectors ? 'on' : 'off'}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className={styles.controlsCard}>
        <div className={styles.controlsGrid}>
          <div className={styles.fieldGroup}>
            <label>From (baseline)</label>
            <select value={fromSource} onChange={(e) => setFromSource(e.target.value as any)}>
              <option value="none">None</option>
              <option value="live">Live</option>
              {sourceOptions.map((option) => (
                <option key={`from-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>To (current)</label>
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
          </div>

          <label className={styles.checkboxControl}>
            <input
              type="checkbox"
              checked={showConnectors}
              onChange={(e) => setShowConnectors(e.target.checked)}
              disabled={fromSource === 'none'}
            />
            <span>Show movement</span>
          </label>

          <div className={styles.statusText}>
            {snapshotListError ? 'Snapshots unavailable' : snapshotListLoading ? 'Loading snapshots...' : ''}
          </div>
        </div>

        <div className={styles.controlsGrid}>
          <div className={styles.fieldGroup}>
            <label>Workstream</label>
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
          </div>

          <div className={styles.fieldGroup}>
            <label>Initiative</label>
            <select
              value={initiativeFilter}
              onChange={(e) => setInitiativeFilter(e.target.value)}
              disabled={!initiativeOptions.length}
            >
              <option value="all">All</option>
              {initiativeOptions.map((initiative) => (
                <option key={initiative.id} value={initiative.id}>
                  {initiative.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label>Stage / gate</label>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as StageColumnKey | 'all')}>
              <option value="all">All</option>
              {stageColumnKeys.map((key) => (
                <option key={key} value={key}>
                  {stageColumnLabel[key]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroupWide}>
            <label>Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Risk title, mitigation, initiative, owner..."
            />
          </div>
        </div>

        <div className={styles.pillHeader}>
          <span>Risk type</span>
          {selectedCategories.size > 0 && (
            <button type="button" className={styles.inlineLink} onClick={clearCategories}>
              Clear
            </button>
          )}
        </div>
        <div className={styles.pillRow}>
          {allRiskCategories.map((category) => {
            const normalized = category.toLowerCase();
            const active = selectedCategories.has(normalized);
            return (
              <button
                key={category}
                type="button"
                className={`${styles.pill} ${active ? styles.pillActive : ''}`}
                onClick={() => toggleCategory(category)}
              >
                {category}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>5x5 matrix</h3>
            <p className={styles.helper}>Click a cell to filter the table. Each dot is a risk.</p>
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendLow}`} /> Low
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendMedium}`} /> Medium
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendHigh}`} /> High
            </span>
          </div>
        </div>

        <div className={styles.matrixOuter}>
          <div className={styles.matrixAxisY}>Severity</div>
          <div className={styles.matrixAxisX}>Likelihood</div>
          <div className={styles.matrixCanvas} ref={matrixRef}>
            {connectorPaths.length > 0 && fromSource !== 'none' && (
              <svg className={styles.matrixOverlay} viewBox={`0 0 ${matrixSize.width} ${matrixSize.height}`} aria-hidden="true">
                <defs>
                  <marker
                    id="risk-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(15, 23, 42, 0.35)" />
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
                  const score = severity * likelihood;
                  const cellTone = getRiskTone(score);
                  const items = matrixRows.get(cellKey) ?? [];
                  const active = selectedCell?.severity === severity && selectedCell?.likelihood === likelihood;
                  const rendered = items.slice(0, 9);
                  return (
                    <button
                      key={cellKey}
                      type="button"
                      className={`${styles.matrixCell} ${active ? styles.matrixCellActive : ''} ${
                        cellTone === 'high'
                          ? styles.matrixCellHigh
                          : cellTone === 'medium'
                            ? styles.matrixCellMedium
                            : styles.matrixCellLow
                      }`}
                      onClick={() => handleCellClick(severity, likelihood)}
                      aria-label={`Severity ${severity}, Likelihood ${likelihood}. ${items.length} risks.`}
                    >
                      <span className={styles.matrixCellMeta}>
                        S{severity} x L{likelihood}
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
                            title={`${item.risk.title}\n${item.initiativeName} - ${item.workstreamName}\nS${item.severity} x L${item.likelihood} = ${item.score}`}
                          />
                        );
                      })}
                      {items.length > 0 && (
                        <span className={styles.cellCount} title={`${items.length} risks in this cell`}>
                          {items.length}
                        </span>
                      )}
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

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>Risks</h3>
            <p className={styles.helper}>
              {sortedRiskRows.length} rows {sortedRiskRows.length > 200 ? '(showing first 200)' : ''}
            </p>
          </div>
        </div>

        {!loaded ? (
          <div className={styles.emptyState}>Loading...</div>
        ) : sortedRiskRows.length === 0 ? (
          <div className={styles.emptyState}>No risks match the current filters.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('score')}>
                      {renderSortLabel('Score', 'score')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('risk')}>
                      {renderSortLabel('Risk', 'risk')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('description')}>
                      {renderSortLabel('Description', 'description')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('type')}>
                      {renderSortLabel('Type', 'type')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('initiative')}>
                      {renderSortLabel('Initiative', 'initiative')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('workstream')}>
                      {renderSortLabel('Workstream', 'workstream')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('owner')}>
                      {renderSortLabel('Owner', 'owner')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('stage')}>
                      {renderSortLabel('Stage', 'stage')}
                    </button>
                  </th>
                  {fromSource !== 'none' && (
                    <th className={styles.sortableHeader}>
                      <button type="button" onClick={() => toggleSort('movement')}>
                        {renderSortLabel('Movement', 'movement')}
                      </button>
                    </th>
                  )}
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('severity')}>
                      {renderSortLabel('Sev', 'severity')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('likelihood')}>
                      {renderSortLabel('Likelihood', 'likelihood')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('mitigation')}>
                      {renderSortLabel('Mitigation', 'mitigation')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader}>
                    <button type="button" onClick={() => toggleSort('comments')}>
                      {renderSortLabel('Comments', 'comments')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRiskRows.slice(0, 200).map((row) => {
                  const { riskComments, openCount } = getRowComments(row);
                  const isExpanded = expandedCommentsKeys.has(row.key);
                  const visibleComments = isExpanded ? riskComments : riskComments.slice(0, 2);
                  const commentStatus = riskCommentsLoading[row.initiativeId]
                    ? 'loading'
                    : riskCommentsError[row.initiativeId]
                      ? 'error'
                      : 'ready';
                  const showComposer = composerKey === row.key;

                  return (
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
                      <td className={styles.riskTitleCell} title={row.risk.title}>
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
                      <td>{row.ownerName ?? '--'}</td>
                      <td>{stageColumnLabel[row.stageColumn]}</td>
                      {fromSource !== 'none' && (
                        <td className={styles.movementCell}>
                          {row.baseline
                            ? `S${row.baseline.severity}xL${row.baseline.likelihood} -> S${row.severity}xL${row.likelihood}`
                            : '--'}
                        </td>
                      )}
                      <td>{row.severity}</td>
                      <td>{row.likelihood}</td>
                      <td className={styles.mitigationCell} title={row.risk.mitigation}>
                        {row.risk.mitigation}
                      </td>
                      <td className={styles.commentsCell}>
                        <div className={styles.commentsHeader}>
                          <span className={styles.commentsMeta}>
                            {openCount ? `${openCount} open` : riskComments.length ? 'All resolved' : 'No comments'}
                          </span>
                          {riskComments.length > 2 && (
                            <button type="button" className={styles.inlineLink} onClick={() => toggleExpandedComments(row.key)}>
                              {isExpanded ? 'Show less' : `Show all (${riskComments.length})`}
                            </button>
                          )}
                        </div>

                        {commentStatus === 'loading' ? (
                          <div className={styles.commentHint}>Loading...</div>
                        ) : commentStatus === 'error' ? (
                          <div className={styles.commentHint}>Failed to load.</div>
                        ) : visibleComments.length === 0 ? (
                          <div className={styles.commentHint}>--</div>
                        ) : (
                          <div className={styles.commentList}>
                            {visibleComments.map((comment) => (
                              <div key={comment.id} className={styles.commentBubble}>
                                <div className={styles.commentBody}>{comment.body}</div>
                                <div className={styles.commentMetaRow}>
                                  <span className={styles.commentMetaText}>
                                    {(comment.authorName ?? 'Unknown') +
                                      ' - ' +
                                      new Date(comment.createdAt).toLocaleString('en-US', {
                                        dateStyle: 'short',
                                        timeStyle: 'short'
                                      })}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.inlineLink}
                                    onClick={() => handleResolveRiskComment(row.initiativeId, comment.id, !comment.resolvedAt)}
                                  >
                                    {comment.resolvedAt ? 'Reopen' : 'Resolve'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {session && (
                          <div className={styles.commentActions}>
                            <button
                              type="button"
                              className={styles.smallButton}
                              onClick={() => {
                                setComposerKey((prev) => (prev === row.key ? null : row.key));
                                setCommentDraft('');
                              }}
                            >
                              {showComposer ? 'Cancel' : 'Add'}
                            </button>
                          </div>
                        )}

                        {session && showComposer && (
                          <div className={styles.composer}>
                            <textarea
                              rows={2}
                              value={commentDraft}
                              onChange={(e) => setCommentDraft(e.target.value)}
                              placeholder="Leave a review comment..."
                            />
                            <div className={styles.composerRow}>
                              <button
                                type="button"
                                className={styles.primaryButton}
                                onClick={() => void handleSubmitRiskComment(row)}
                                disabled={!commentDraft.trim()}
                              >
                                Post
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedRiskRows.length > 200 && <div className={styles.tableHint}>Showing first 200 risks.</div>}
          </div>
        )}
      </section>
    </div>
  );
};
