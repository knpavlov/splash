import { useMemo, useState } from 'react';
import styles from '../../styles/CaseCriteriaScreen.module.css';
import { useCaseCriteriaState } from '../../app/state/AppStateContext';
import { CaseCriterion } from '../../shared/types/caseCriteria';
import { generateId } from '../../shared/ui/generateId';
import { CaseCriterionEditorCard } from './components/CaseCriterionEditorCard';

type Feedback = { type: 'info' | 'error'; text: string } | null;

const createEmptyCriterion = (): CaseCriterion => ({
  id: generateId(),
  title: '',
  ratings: {},
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export const CaseCriteriaScreen = () => {
  const { list, saveCriterion, removeCriterion } = useCaseCriteriaState();
  const [drafts, setDrafts] = useState<CaseCriterion[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const sortedExisting = useMemo(
    () =>
      [...list].sort((a, b) => {
        const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (updatedDiff !== 0) {
          return updatedDiff;
        }
        return a.title.localeCompare(b.title, 'en-US');
      }),
    [list]
  );

  const clearFeedback = () => setFeedback(null);

  const handleAddDraft = () => {
    clearFeedback();
    setDrafts((prev) => [...prev, createEmptyCriterion()]);
  };

  const handleRemoveDraft = (id: string) => {
    clearFeedback();
    setDrafts((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async (criterion: CaseCriterion, expectedVersion: number | null) => {
    clearFeedback();
    const result = await saveCriterion(criterion, expectedVersion);
    if (!result.ok) {
      if (result.error === 'invalid-input') {
        setFeedback({ type: 'error', text: 'Fill in the title before saving.' });
        return;
      }
      if (result.error === 'version-conflict') {
        setFeedback({ type: 'error', text: 'Version conflict. Refresh the page to see latest updates.' });
        return;
      }
      if (result.error === 'not-found') {
        setFeedback({ type: 'error', text: 'Criterion not found. It may have been removed.' });
        return;
      }
      setFeedback({ type: 'error', text: 'Failed to save the criterion. Try again later.' });
      return;
    }
    setFeedback({ type: 'info', text: 'Criterion saved.' });
    setDrafts((prev) => prev.filter((item) => item.id !== criterion.id));
  };

  const handleDelete = async (id: string) => {
    clearFeedback();
    const result = await removeCriterion(id);
    if (!result.ok) {
      if (result.error === 'not-found') {
        setFeedback({ type: 'error', text: 'Criterion already removed.' });
        return;
      }
      setFeedback({ type: 'error', text: 'Failed to delete the criterion. Try again later.' });
      return;
    }
    setFeedback({ type: 'info', text: 'Criterion deleted.' });
  };

  const existingCards = sortedExisting.map((criterion) => (
    <CaseCriterionEditorCard
      key={criterion.id}
      criterion={criterion}
      mode="existing"
      onSave={(next, meta) => handleSave(next, meta.expectedVersion)}
      onDelete={(id) => handleDelete(id)}
      onInteraction={clearFeedback}
    />
  ));

  const draftCards = drafts.map((draft) => (
    <CaseCriterionEditorCard
      key={draft.id}
      criterion={draft}
      mode="new"
      onSave={(next, meta) => handleSave(next, meta.expectedVersion)}
      onCancelNew={handleRemoveDraft}
      onInteraction={clearFeedback}
    />
  ));

  const hasItems = existingCards.length + draftCards.length > 0;

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Case criteria</h1>
          <p className={styles.subtitle}>
            Configure evaluation criteria for case interviews and keep descriptions in sync for all interviewers.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={handleAddDraft} type="button">
          Add criterion
        </button>
      </header>

      {feedback && (
        <div className={feedback.type === 'info' ? styles.infoBanner : styles.errorBanner}>{feedback.text}</div>
      )}

      <div className={styles.contentArea}>
        {hasItems ? (
          <div className={styles.criteriaList}>
            {existingCards}
            {draftCards}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h2>No criteria yet</h2>
            <p>Add your first criterion to standardize case interview evaluations.</p>
          </div>
        )}
      </div>
    </section>
  );
};
