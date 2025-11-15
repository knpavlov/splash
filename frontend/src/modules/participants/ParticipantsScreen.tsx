import { useMemo, useRef, useState } from 'react';
import styles from '../../styles/ParticipantsScreen.module.css';
import { useInitiativesState, useParticipantsState } from '../../app/state/AppStateContext';
import { Participant, ParticipantUpdatePayload } from '../../shared/types/participant';
import { parseParticipantExcelFile, ParticipantExcelRow } from './services/participantExcelParser';

type Feedback = { kind: 'success' | 'error' | 'info'; text: string } | null;
type ParticipantUsage = { tasks: number; initiatives: number };

const emptyForm = {
  displayName: '',
  email: '',
  role: '',
  hierarchyLevel1: '',
  hierarchyLevel2: '',
  hierarchyLevel3: ''
};

type ParticipantField =
  | 'displayName'
  | 'email'
  | 'role'
  | 'hierarchyLevel1'
  | 'hierarchyLevel2'
  | 'hierarchyLevel3';

const buildParticipantKey = (name: string, email?: string | null) => {
  const normalizedName = name.trim().toLowerCase();
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  return `${normalizedName}::${normalizedEmail}`;
};

export const ParticipantsScreen = () => {
  const { list, createParticipant, updateParticipant, removeParticipant } = useParticipantsState();
  const { list: initiatives } = useInitiativesState();
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [globalFeedback, setGlobalFeedback] = useState<Feedback>(null);
  const [importFeedback, setImportFeedback] = useState<Feedback>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ role: 'all', level1: 'all', level2: 'all', level3: 'all' });
  const [removeInProgress, setRemoveInProgress] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ field: ParticipantField; direction: 'asc' | 'desc' }>({
    field: 'displayName',
    direction: 'asc'
  });
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedParticipants = useMemo(() => {
    const extract = (participant: Participant, field: ParticipantField) => {
      const value = participant[field];
      if (typeof value === 'string' && value) {
        return value.toLowerCase();
      }
      return '';
    };
    const { field, direction } = sortConfig;
    return [...list].sort((a, b) => {
      const left = extract(a, field);
      const right = extract(b, field);
      if (left === right) {
        return 0;
      }
      if (left > right) {
        return direction === 'asc' ? 1 : -1;
      }
      return direction === 'asc' ? -1 : 1;
    });
  }, [list, sortConfig]);

  const toggleSort = (field: ParticipantField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
  };

  const participantUsageMap = useMemo(() => {
    const usage = new Map<string, ParticipantUsage>();
    initiatives.forEach((initiative) => {
      const seenInInitiative = new Set<string>();
      initiative.plan.tasks.forEach((task) => {
        const responsible = task.responsible?.trim();
        if (!responsible) {
          return;
        }
        const key = responsible.toLowerCase();
        const entry = usage.get(key) ?? { tasks: 0, initiatives: 0 };
        entry.tasks += 1;
        if (!seenInInitiative.has(key)) {
          entry.initiatives += 1;
          seenInInitiative.add(key);
        }
        usage.set(key, entry);
      });
    });
    return usage;
  }, [initiatives]);

  const filterOptions = useMemo(() => {
    const roles = new Set<string>();
    const level1 = new Set<string>();
    const level2 = new Set<string>();
    const level3 = new Set<string>();
    sortedParticipants.forEach((participant) => {
      if (participant.role) {
        roles.add(participant.role);
      }
      if (participant.hierarchyLevel1) {
        level1.add(participant.hierarchyLevel1);
      }
      if (participant.hierarchyLevel2) {
        level2.add(participant.hierarchyLevel2);
      }
      if (participant.hierarchyLevel3) {
        level3.add(participant.hierarchyLevel3);
      }
    });
    const toList = (set: Set<string>) => Array.from(set).sort((a, b) => a.localeCompare(b));
    return {
      roles: toList(roles),
      level1: toList(level1),
      level2: toList(level2),
      level3: toList(level3)
    };
  }, [sortedParticipants]);

  const filteredParticipants = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return sortedParticipants.filter((participant) => {
      const matchesSearch =
        !search ||
        [
          participant.displayName,
          participant.email,
          participant.role,
          participant.hierarchyLevel1,
          participant.hierarchyLevel2,
          participant.hierarchyLevel3
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(search));
      if (!matchesSearch) {
        return false;
      }
      if (filters.role !== 'all' && (participant.role ?? '') !== filters.role) {
        return false;
      }
      if (filters.level1 !== 'all' && (participant.hierarchyLevel1 ?? '') !== filters.level1) {
        return false;
      }
      if (filters.level2 !== 'all' && (participant.hierarchyLevel2 ?? '') !== filters.level2) {
        return false;
      }
      if (filters.level3 !== 'all' && (participant.hierarchyLevel3 ?? '') !== filters.level3) {
        return false;
      }
      return true;
    });
  }, [filters, searchQuery, sortedParticipants]);

  const handleNewInputChange = (field: ParticipantField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setGlobalFeedback(null);
  };

  const handleCreate = async () => {
    const trimmedName = form.displayName.trim();
    if (!trimmedName) {
      setGlobalFeedback({ kind: 'error', text: 'Enter participant name.' });
      return;
    }
    setIsSaving(true);
    setGlobalFeedback(null);
    const result = await createParticipant({
      displayName: trimmedName,
      email: form.email,
      role: form.role,
      hierarchyLevel1: form.hierarchyLevel1,
      hierarchyLevel2: form.hierarchyLevel2,
      hierarchyLevel3: form.hierarchyLevel3
    });
    setIsSaving(false);
    if (result.ok) {
      setForm(emptyForm);
      setGlobalFeedback({ kind: 'success', text: 'Participant added.' });
    } else {
      setGlobalFeedback({ kind: 'error', text: 'Failed to add participant.' });
    }
  };

  const handleNewKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleCreate();
    }
  };

  const handleFieldBlur = async (participant: Participant, field: ParticipantField, raw: string) => {
    const currentValue = participant[field] ?? '';
    const trimmed = raw.trim();
    if (field === 'displayName' && !trimmed) {
      return;
    }
    if ((currentValue || '') === (trimmed || '')) {
      return;
    }
    const payload: ParticipantUpdatePayload = { [field]: trimmed };
    await updateParticipant(participant.id, payload);
  };

  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  };

  const handleParticipantRemoval = async (participant: Participant, usage: ParticipantUsage | undefined) => {
    const usageText =
      usage && usage.tasks
        ? `They are referenced in ${usage.tasks} plan task${usage.tasks === 1 ? '' : 's'} across ${usage.initiatives} initiative${
            usage.initiatives === 1 ? '' : 's'
          }. Those references will keep the previous name as plain text.`
        : 'Existing assignments that referenced this person will simply keep the previous name as plain text.';
    const confirmed = window.confirm(`Remove ${participant.displayName}? ${usageText}`);
    if (!confirmed) {
      return;
    }
    setRemoveInProgress(participant.id);
    setGlobalFeedback(null);
    const result = await removeParticipant(participant.id);
    setRemoveInProgress(null);
    if (result.ok) {
      setGlobalFeedback({ kind: 'info', text: `${participant.displayName} removed.` });
    } else {
      setGlobalFeedback({ kind: 'error', text: 'Failed to remove participant.' });
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    void handleExcelImport(file);
  };

  const handleExcelImport = async (file: File) => {
    setIsImporting(true);
    setImportFeedback(null);
    try {
      const { rows, skippedRows } = await parseParticipantExcelFile(file);
      if (!rows.length) {
        setImportFeedback({
          kind: 'error',
          text:
            skippedRows > 0
              ? 'No participants were added. Make sure each row contains a name in the first column.'
              : 'Excel file is empty.'
        });
        return;
      }
      const existingKeys = new Set(sortedParticipants.map((participant) => buildParticipantKey(participant.displayName, participant.email)));
      const seenKeys = new Set<string>();
      const uniqueRows: ParticipantExcelRow[] = [];
      let duplicateCount = 0;
      rows.forEach((row) => {
        const key = buildParticipantKey(row.displayName, row.email);
        if (existingKeys.has(key) || seenKeys.has(key)) {
          duplicateCount += 1;
          return;
        }
        seenKeys.add(key);
        uniqueRows.push(row);
      });
      if (!uniqueRows.length) {
        setImportFeedback({
          kind: 'info',
          text: `Import finished: 0 new participants, ${duplicateCount} duplicates skipped${
            skippedRows ? `, ${skippedRows} incomplete rows ignored` : ''
          }.`
        });
        return;
      }
      let created = 0;
      let failed = 0;
      for (const row of uniqueRows) {
        const result = await createParticipant({
          displayName: row.displayName,
          email: row.email ?? undefined,
          role: row.role ?? undefined,
          hierarchyLevel1: row.hierarchyLevel1 ?? undefined,
          hierarchyLevel2: row.hierarchyLevel2 ?? undefined,
          hierarchyLevel3: row.hierarchyLevel3 ?? undefined
        });
        if (result.ok) {
          created += 1;
        } else {
          failed += 1;
        }
      }
      const messageParts = [
        `${created} new participant${created === 1 ? '' : 's'} added`,
        `${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped`
      ];
      if (skippedRows) {
        messageParts.push(`${skippedRows} row${skippedRows === 1 ? '' : 's'} without a name ignored`);
      }
      if (failed) {
        messageParts.push(`${failed} row${failed === 1 ? '' : 's'} failed to save`);
      }
      setImportFeedback({
        kind: failed ? 'info' : 'success',
        text: `Import complete: ${messageParts.join(', ')}.`
      });
    } catch (error) {
      console.error('Failed to import participants:', error);
      setImportFeedback({
        kind: 'error',
        text: 'Failed to process the Excel file. Make sure it is a .xlsx file saved from Excel or Google Sheets.'
      });
    } finally {
      setIsImporting(false);
      setIsDragActive(false);
      dragCounterRef.current = 0;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleExcelImport(file);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({ role: 'all', level1: 'all', level2: 'all', level3: 'all' });
  };

  const renderSortableHeader = (label: string, field: ParticipantField) => {
    const isActive = sortConfig.field === field;
    const indicator = isActive ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕';
    const ariaSort = isActive ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th aria-sort={ariaSort}>
        <button
          type="button"
          className={`${styles.sortButton} ${isActive ? styles.sortButtonActive : ''}`}
          onClick={() => toggleSort(field)}
        >
          {label}
          <span className={styles.sortIndicator}>{indicator}</span>
        </button>
      </th>
    );
  };

  const renderParticipantRow = (participant: Participant) => {
    const usage = participantUsageMap.get(participant.displayName.trim().toLowerCase());
    const usageTitle =
      usage && usage.tasks
        ? `${usage.tasks} task${usage.tasks === 1 ? '' : 's'} across ${usage.initiatives} initiative${
            usage.initiatives === 1 ? '' : 's'
          }`
        : 'Not referenced in initiative plans';
    return (
      <tr key={participant.id}>
        <td>
          <input
            defaultValue={participant.displayName}
            onBlur={(event) => handleFieldBlur(participant, 'displayName', event.target.value)}
            onKeyDown={handleFieldKeyDown}
          />
        </td>
        <td>
          <input
            defaultValue={participant.email ?? ''}
            placeholder="name@email.com"
            onBlur={(event) => handleFieldBlur(participant, 'email', event.target.value)}
            onKeyDown={handleFieldKeyDown}
          />
        </td>
        <td>
          <input
            defaultValue={participant.role ?? ''}
            placeholder="Role"
            onBlur={(event) => handleFieldBlur(participant, 'role', event.target.value)}
            onKeyDown={handleFieldKeyDown}
          />
        </td>
        <td>
          <input
            defaultValue={participant.hierarchyLevel1 ?? ''}
            placeholder="Level 1"
            onBlur={(event) => handleFieldBlur(participant, 'hierarchyLevel1', event.target.value)}
            onKeyDown={handleFieldKeyDown}
          />
        </td>
        <td>
          <input
            defaultValue={participant.hierarchyLevel2 ?? ''}
            placeholder="Level 2"
            onBlur={(event) => handleFieldBlur(participant, 'hierarchyLevel2', event.target.value)}
            onKeyDown={handleFieldKeyDown}
          />
        </td>
        <td>
          <input
            defaultValue={participant.hierarchyLevel3 ?? ''}
            placeholder="Level 3"
            onBlur={(event) => handleFieldBlur(participant, 'hierarchyLevel3', event.target.value)}
            onKeyDown={handleFieldKeyDown}
          />
        </td>
        <td className={styles.actionsCell}>
          <button
            type="button"
            className={styles.deleteButton}
            title={usageTitle}
            disabled={removeInProgress === participant.id}
            aria-label={`Remove ${participant.displayName}`}
            onClick={() => void handleParticipantRemoval(participant, usage)}
          >
            &times;
          </button>
        </td>
      </tr>
    );
  };

  return (
    <section className={styles.participantsScreen}>
      <header className={styles.header}>
        <div>
          <h1>Participants</h1>
          <p>Manage the people available for initiative plans and resource dashboards.</p>
        </div>
        {globalFeedback && (
          <span
            className={
              globalFeedback.kind === 'success'
                ? styles.success
                : globalFeedback.kind === 'error'
                ? styles.error
                : styles.info
            }
          >
            {globalFeedback.text}
          </span>
        )}
      </header>

      <div className={styles.card}>
        <div className={styles.quickAddRow}>
          <input
            placeholder="Full name *"
            value={form.displayName}
            onChange={(event) => handleNewInputChange('displayName', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(event) => handleNewInputChange('email', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Role"
            value={form.role}
            onChange={(event) => handleNewInputChange('role', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Hierarchy level 1"
            value={form.hierarchyLevel1}
            onChange={(event) => handleNewInputChange('hierarchyLevel1', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Hierarchy level 2"
            value={form.hierarchyLevel2}
            onChange={(event) => handleNewInputChange('hierarchyLevel2', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Hierarchy level 3"
            value={form.hierarchyLevel3}
            onChange={(event) => handleNewInputChange('hierarchyLevel3', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <button
            type="button"
            className={styles.addButton}
            disabled={isSaving}
            onClick={() => void handleCreate()}
          >
            {isSaving ? 'Adding...' : 'Add participant'}
          </button>
        </div>
      </div>

      <div className={`${styles.card} ${styles.importCard}`}>
        <div>
          <h2>Bulk upload via Excel</h2>
          <p>
            Use drag &amp; drop or upload a .xlsx file. Columns must be ordered as: Name, Email, Role,
            Hierarchy level 1, Hierarchy level 2, Hierarchy level 3.
          </p>
        </div>
        <label
          className={`${styles.dropZone} ${isDragActive ? styles.dropZoneActive : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className={styles.hiddenInput}
            onChange={handleFileSelection}
            disabled={isImporting}
          />
          <div>
            <strong>{isImporting ? 'Processing file...' : 'Drop Excel file here'}</strong>
            <p>or click to choose one</p>
          </div>
        </label>
        <ul className={styles.importDetails}>
          <li>Only the first sheet is processed. Header row is optional.</li>
          <li>Rows without a name are skipped automatically.</li>
          <li>Full duplicates (same name &amp; email) are ignored and reported after the upload.</li>
        </ul>
        {importFeedback && (
          <div
            className={
              importFeedback.kind === 'success'
                ? styles.success
                : importFeedback.kind === 'error'
                ? styles.error
                : styles.info
            }
          >
            {importFeedback.text}
          </div>
        )}
      </div>

      <div className={`${styles.card} ${styles.filtersCard}`}>
        <input
          className={styles.searchInput}
          placeholder="Search by name, email or role"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <select value={filters.role} onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}>
          <option value="all">All roles</option>
          {filterOptions.roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select value={filters.level1} onChange={(event) => setFilters((prev) => ({ ...prev, level1: event.target.value }))}>
          <option value="all">All level 1</option>
          {filterOptions.level1.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select value={filters.level2} onChange={(event) => setFilters((prev) => ({ ...prev, level2: event.target.value }))}>
          <option value="all">All level 2</option>
          {filterOptions.level2.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select value={filters.level3} onChange={(event) => setFilters((prev) => ({ ...prev, level3: event.target.value }))}>
          <option value="all">All level 3</option>
          {filterOptions.level3.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>
          Clear filters
        </button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {renderSortableHeader('Name', 'displayName')}
              {renderSortableHeader('Email', 'email')}
              {renderSortableHeader('Role', 'role')}
              {renderSortableHeader('Hierarchy level 1', 'hierarchyLevel1')}
              {renderSortableHeader('Hierarchy level 2', 'hierarchyLevel2')}
              {renderSortableHeader('Hierarchy level 3', 'hierarchyLevel3')}
              <th className={styles.actionsHeader}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {filteredParticipants.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyState}>
                  {sortedParticipants.length === 0
                    ? 'No participants yet. Add them above to start assigning tasks.'
                    : 'No participants match the current search or filters.'}
                </td>
              </tr>
            ) : (
              filteredParticipants.map((participant) => renderParticipantRow(participant))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
