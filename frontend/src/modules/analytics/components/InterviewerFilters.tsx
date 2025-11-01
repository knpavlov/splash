import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../styles/AnalyticsScreen.module.css';
import type { InterviewerDescriptor } from '../types/analytics';
import type { InterviewerSeniority } from '../../../shared/types/account';

const ROLE_OPTIONS: InterviewerSeniority[] = ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'];

interface InterviewerFiltersProps {
  interviewers: InterviewerDescriptor[];
  selectedInterviewers: string[];
  onInterviewerChange: (ids: string[]) => void;
  selectedRoles: InterviewerSeniority[];
  onRoleChange: (roles: InterviewerSeniority[]) => void;
  disabled?: boolean;
  onDropdownOpenChange?: (open: boolean) => void;
}

export const InterviewerFilters = ({
  interviewers,
  selectedInterviewers,
  onInterviewerChange,
  selectedRoles,
  onRoleChange,
  disabled = false,
  onDropdownOpenChange
}: InterviewerFiltersProps) => {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  const interviewerSet = useMemo(
    () => new Set(selectedInterviewers.map((id) => id.toLowerCase())),
    [selectedInterviewers]
  );
  const roleSet = useMemo(() => new Set(selectedRoles), [selectedRoles]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setSelectorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    onDropdownOpenChange?.(selectorOpen);
  }, [selectorOpen, onDropdownOpenChange]);

  useEffect(() => {
    if (disabled) {
      setSelectorOpen(false);
    }
  }, [disabled]);

  const toggleInterviewer = (id: string) => {
    const normalized = id.toLowerCase();
    onInterviewerChange(
      interviewerSet.has(normalized)
        ? selectedInterviewers.filter((value) => value.toLowerCase() !== normalized)
        : [...selectedInterviewers, id]
    );
  };

  const handleSelectAll = () => {
    if (disabled) {
      return;
    }
    onInterviewerChange(interviewers.map((item) => item.id));
    setSelectorOpen(false);
  };

  const handleReset = () => {
    onInterviewerChange([]);
    setSelectorOpen(false);
  };

  const handleRoleToggle = (role: InterviewerSeniority) => {
    if (disabled) {
      return;
    }
    if (roleSet.has(role)) {
      onRoleChange(selectedRoles.filter((value) => value !== role));
    } else {
      onRoleChange([...selectedRoles, role]);
    }
  };

  const handleRoleReset = () => {
    if (disabled) {
      return;
    }
    onRoleChange([]);
  };

  const selectedCount = selectedInterviewers.length;
  const selectorLabel = selectedCount ? `${selectedCount} selected` : 'All interviewers';

  const wrapperClassName = selectorOpen
    ? `${styles.dropdownWrapper} ${styles.dropdownWrapperOpen}`
    : styles.dropdownWrapper;

  return (
    <div className={styles.interviewerFilters}>
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>Interviewer filter</label>
        <div className={wrapperClassName} ref={selectorRef}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => !disabled && setSelectorOpen((state) => !state)}
            disabled={disabled}
          >
            {selectorLabel}
          </button>
          {selectorOpen ? (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownActions}>
                <button type="button" onClick={handleSelectAll} disabled={!interviewers.length}>
                  Select all
                </button>
                <button type="button" onClick={handleReset} disabled={!selectedInterviewers.length}>
                  Clear
                </button>
              </div>
              <div className={styles.dropdownList}>
                {interviewers.length ? (
                  interviewers.map((interviewer) => {
                    const isChecked = interviewerSet.has(interviewer.id.toLowerCase());
                    return (
                      <label key={interviewer.id} className={styles.dropdownOption}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleInterviewer(interviewer.id)}
                        />
                        <span className={styles.dropdownLabel}>
                          {interviewer.name}
                          {interviewer.role ? (
                            <span className={styles.roleBadge}>{interviewer.role}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <span>No interviewers available.</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>Role filter</label>
        <div className={styles.roleToggleGroup}>
          {ROLE_OPTIONS.map((role) => {
            const active = roleSet.has(role);
            return (
              <button
                key={role}
                type="button"
                className={`${styles.roleToggle} ${active ? styles.roleToggleActive : ''}`}
                onClick={() => handleRoleToggle(role)}
                disabled={disabled}
              >
                {role}
              </button>
            );
          })}
          <button
            type="button"
            className={styles.roleReset}
            onClick={handleRoleReset}
            disabled={!selectedRoles.length || disabled}
          >
            Clear roles
          </button>
        </div>
      </div>
    </div>
  );
};
