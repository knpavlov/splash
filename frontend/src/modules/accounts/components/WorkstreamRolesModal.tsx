import { useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/WorkstreamRolesModal.module.css';
import { AccountRecord } from '../../../shared/types/account';
import { DomainResult } from '../../../shared/types/results';
import {
  Workstream,
  WorkstreamRole,
  WorkstreamRoleAssignment,
  WorkstreamRoleOption,
  WorkstreamRoleSelection
} from '../../../shared/types/workstream';

type Banner = { type: 'info' | 'error'; text: string } | null;

interface WorkstreamRolesModalProps {
  account: AccountRecord;
  workstreams: Workstream[];
  roleOptions: WorkstreamRoleOption[];
  onClose: () => void;
  loadAssignments: (accountId: string) => Promise<DomainResult<WorkstreamRoleAssignment[]>>;
  saveAssignments: (
    accountId: string,
    roles: WorkstreamRoleSelection[]
  ) => Promise<DomainResult<WorkstreamRoleAssignment[]>>;
}

const toMap = (assignments: WorkstreamRoleAssignment[]) => {
  const map = new Map<string, WorkstreamRole>();
  for (const assignment of assignments) {
    map.set(assignment.workstreamId, assignment.role);
  }
  return map;
};

export const WorkstreamRolesModal = ({
  account,
  workstreams,
  roleOptions,
  onClose,
  loadAssignments,
  saveAssignments
}: WorkstreamRolesModalProps) => {
  const [banner, setBanner] = useState<Banner>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectionMap, setSelectionMap] = useState<Map<string, WorkstreamRole>>(new Map());
  const [bulkRole, setBulkRole] = useState<WorkstreamRole | ''>('');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setBanner(null);
    setSelectionMap(new Map());
    void loadAssignments(account.id).then((result) => {
      if (!isMounted) {
        return;
      }
      if (!result.ok) {
        setBanner({
          type: 'error',
          text:
            result.error === 'not-found'
              ? 'Account no longer exists.'
              : 'Failed to load current assignments.'
        });
      } else {
        setSelectionMap(toMap(result.data));
      }
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [account.id, loadAssignments]);

  const assignedRoles = useMemo(() => selectionMap, [selectionMap]);

  const resolveRoleValue = (workstreamId: string): WorkstreamRole | null => {
    const value = assignedRoles.get(workstreamId);
    return value ?? null;
  };

  const handleRoleChange = (workstreamId: string, value: string) => {
    setSelectionMap((prev) => {
      const next = new Map(prev);
      if (!value) {
        next.delete(workstreamId);
      } else {
        next.set(workstreamId, value as WorkstreamRole);
      }
      return next;
    });
  };

  const handleApplyAll = (value: string) => {
    const normalized = (value as WorkstreamRole | '') ?? '';
    setBulkRole(normalized);
    setSelectionMap((prev) => {
      if (!normalized) {
        return new Map();
      }
      const next = new Map(prev);
      for (const workstream of workstreams) {
        next.set(workstream.id, normalized);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setBanner(null);
    const payload: WorkstreamRoleSelection[] = workstreams.map((workstream) => ({
      workstreamId: workstream.id,
      role: resolveRoleValue(workstream.id)
    }));
    const result = await saveAssignments(account.id, payload);
    setIsSaving(false);
    if (!result.ok) {
      const message =
        result.error === 'not-found'
          ? 'Account or workstream no longer exists.'
          : result.error === 'invalid-input'
            ? 'Please select valid roles.'
            : 'Failed to save assignments.';
      setBanner({ type: 'error', text: message });
      return;
    }
    setBanner({ type: 'info', text: 'Roles updated successfully.' });
  };

  const accountLabel = account.name || account.email;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2>Assign workstream roles</h2>
            <p className={styles.subtitle}>{accountLabel}</p>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </header>

        {banner && (
          <div
            className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}
            role={banner.type === 'error' ? 'alert' : 'status'}
          >
            {banner.text}
          </div>
        )}

        <div className={styles.content}>
          <label className={styles.bulkRow}>
            <span>Apply role to all workstreams</span>
            <select
              value={bulkRole}
              onChange={(event) => handleApplyAll(event.target.value)}
              disabled={isLoading || workstreams.length === 0}
            >
              <option value="">No bulk role</option>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {isLoading ? (
            <p className={styles.placeholder}>Loading workstreams…</p>
          ) : workstreams.length === 0 ? (
            <p className={styles.placeholder}>No workstreams available yet.</p>
          ) : (
            <div className={styles.workstreamList}>
              {workstreams.map((workstream) => {
                const currentRole = resolveRoleValue(workstream.id) ?? '';
                return (
                  <div key={workstream.id} className={styles.workstreamRow}>
                    <div className={styles.workstreamInfo}>
                      <p className={styles.workstreamName}>{workstream.name}</p>
                      <p className={styles.workstreamDescription}>
                        {workstream.description || 'No description yet.'}
                      </p>
                    </div>
                    <select
                      className={styles.roleSelect}
                      value={currentRole}
                      onChange={(event) => handleRoleChange(workstream.id, event.target.value)}
                    >
                      <option value="">No role assigned</option>
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      {currentRole &&
                        !roleOptions.some((option) => option.value === currentRole) && (
                          <option value={currentRole}>{currentRole}</option>
                        )}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.secondaryButton} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className={styles.primaryButton} onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </div>
    </div>
  );
};
