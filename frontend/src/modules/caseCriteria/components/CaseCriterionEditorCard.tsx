import { useEffect, useMemo, useRef, useState } from 'react';
import { CaseCriterion } from '../../../shared/types/caseCriteria';
import styles from '../../../styles/CaseCriterionEditorCard.module.css';
import { EditIcon } from '../../../components/icons/EditIcon';
import { CheckIcon } from '../../../components/icons/CheckIcon';
import { CloseIcon } from '../../../components/icons/CloseIcon';

interface CaseCriterionEditorCardProps {
  criterion: CaseCriterion;
  mode: 'existing' | 'new';
  onSave: (
    criterion: CaseCriterion,
    meta: { expectedVersion: number | null }
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancelNew?: (id: string) => void;
  onInteraction?: () => void;
}

const sanitizeCriterion = (draft: CaseCriterion): CaseCriterion => {
  const ratings: CaseCriterion['ratings'] = {};
  (['1', '2', '3', '4', '5'] as const).forEach((scoreKey) => {
    const score = Number(scoreKey) as 1 | 2 | 3 | 4 | 5;
    const value = draft.ratings[score];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        ratings[score] = trimmed;
      }
    }
  });
  return {
    ...draft,
    title: draft.title.trim(),
    ratings
  };
};

export const CaseCriterionEditorCard = ({
  criterion,
  mode,
  onSave,
  onDelete,
  onCancelNew,
  onInteraction
}: CaseCriterionEditorCardProps) => {
  const [draft, setDraft] = useState<CaseCriterion>(criterion);
  const [saving, setSaving] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(mode === 'new' && !criterion.title.trim());
  const titleBackupRef = useRef(criterion.title);

  useEffect(() => {
    // Сбрасываем локальное состояние, если пришла новая версия критерия
    setDraft(criterion);
    titleBackupRef.current = criterion.title;
    setIsEditingTitle(mode === 'new' && !criterion.title.trim());
  }, [criterion]);

  const hasChanges = useMemo(() => {
    const sanitized = sanitizeCriterion(draft);
    const original = sanitizeCriterion(criterion);
    return JSON.stringify(sanitized) !== JSON.stringify(original);
  }, [draft, criterion]);

  const handleTitleChange = (value: string) => {
    onInteraction?.();
    setDraft((prev) => ({ ...prev, title: value }));
  };

  const startTitleEditing = () => {
    titleBackupRef.current = draft.title;
    setIsEditingTitle(true);
  };

  const confirmTitleEditing = () => {
    onInteraction?.();
    titleBackupRef.current = draft.title.trim();
    setDraft((prev) => ({ ...prev, title: prev.title.trim() }));
    setIsEditingTitle(false);
  };

  const cancelTitleEditing = () => {
    onInteraction?.();
    setDraft((prev) => ({ ...prev, title: titleBackupRef.current }));
    setIsEditingTitle(false);
  };

  const handleRatingChange = (score: 1 | 2 | 3 | 4 | 5, value: string) => {
    onInteraction?.();
    setDraft((prev) => ({
      ...prev,
      ratings: { ...prev.ratings, [score]: value }
    }));
  };

  const handleSave = async () => {
    const normalized = sanitizeCriterion(draft);
    if (!normalized.title) {
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized, {
        expectedVersion: mode === 'existing' ? criterion.version : null
      });
      setDraft(normalized);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }
    setSaving(true);
    try {
      await onDelete(criterion.id);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNew = () => {
    onCancelNew?.(criterion.id);
  };

  const trimmedTitle = draft.title.trim();
  const titleToDisplay = trimmedTitle || 'Untitled criterion';
  const hasTitle = Boolean(trimmedTitle);

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titleColumn}>
          {isEditingTitle ? (
            <div className={styles.titleEditor}>
              <input
                className={styles.titleInput}
                value={draft.title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="Enter criterion title"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmTitleEditing();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTitleEditing();
                  }
                }}
              />
              <div className={styles.titleEditorActions}>
                <button
                  type="button"
                  className={styles.iconButtonPositive}
                  onClick={confirmTitleEditing}
                  aria-label="Save title"
                  disabled={saving}
                >
                  <CheckIcon width={16} height={16} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={cancelTitleEditing}
                  aria-label="Cancel title editing"
                  disabled={saving}
                >
                  <CloseIcon width={16} height={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.titleDisplay}>
              <h3 className={`${styles.titleText} ${hasTitle ? '' : styles.titlePlaceholder}`}>
                {titleToDisplay}
              </h3>
              <button
                type="button"
                className={styles.iconButton}
                onClick={startTitleEditing}
                aria-label="Edit title"
                disabled={saving}
              >
                <EditIcon width={18} height={18} />
              </button>
            </div>
          )}
        </div>
        <div className={styles.headerActions}>
          {mode === 'existing' ? (
            <button
              className={styles.dangerButton}
              onClick={() => void handleDelete()}
              disabled={saving}
              type="button"
            >
              Delete
            </button>
          ) : (
            <button
              className={styles.secondaryButton}
              onClick={handleCancelNew}
              disabled={saving}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      </header>

      <div className={styles.ratingsGrid}>
        {[1, 2, 3, 4, 5].map((score) => (
          <label key={score} className={styles.ratingBlock}>
            <span className={styles.ratingLabel}>Score {score}</span>
            <textarea
              value={draft.ratings[score as 1 | 2 | 3 | 4 | 5] ?? ''}
              onChange={(event) => handleRatingChange(score as 1 | 2 | 3 | 4 | 5, event.target.value)}
              placeholder="Optional description"
              rows={4}
            />
          </label>
        ))}
      </div>

      <footer className={styles.footer}>
        <button
          className={styles.primaryButton}
          onClick={() => void handleSave()}
          disabled={saving || !draft.title.trim() || !hasChanges}
          type="button"
        >
          Save changes
        </button>
        {mode === 'existing' && hasChanges && (
          <button
            className={styles.secondaryButton}
            onClick={() => {
              onInteraction?.();
              setDraft(criterion);
            }}
            disabled={saving}
            type="button"
          >
            Reset
          </button>
        )}
      </footer>
    </div>
  );
};
