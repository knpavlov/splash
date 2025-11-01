import { useEffect, useState } from 'react';
import { FitQuestion, FitQuestionCriterion } from '../../../shared/types/fitQuestion';
import styles from '../../../styles/FitQuestionModal.module.css';
import { generateId } from '../../../shared/ui/generateId';
import { FitQuestionCriterionEditor } from './FitQuestionCriterionEditor';

interface FitQuestionModalProps {
  initialQuestion: FitQuestion | null;
  onSave: (
    question: FitQuestion,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  feedback: { type: 'info' | 'error'; text: string } | null;
  onFeedbackClear: () => void;
}

const createEmptyQuestion = (): FitQuestion => ({
  id: generateId(),
  shortTitle: '',
  content: '',
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  criteria: []
});

export const FitQuestionModal = ({
  initialQuestion,
  onSave,
  onDelete,
  onClose,
  feedback,
  onFeedbackClear
}: FitQuestionModalProps) => {
  const [question, setQuestion] = useState<FitQuestion>(createEmptyQuestion());

  useEffect(() => {
    if (initialQuestion) {
      setQuestion(initialQuestion);
    } else {
      setQuestion(createEmptyQuestion());
    }
  }, [initialQuestion]);

  const expectedVersion = initialQuestion ? initialQuestion.version : null;

  // Обновление полей вопроса по ключу
  const handleFieldChange = (field: 'shortTitle' | 'content', value: string) => {
    onFeedbackClear();
    setQuestion((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddCriterion = () => {
    onFeedbackClear();
    const newCriterion: FitQuestionCriterion = {
      id: generateId(),
      title: '',
      ratings: {}
    };
    setQuestion((prev) => ({ ...prev, criteria: [...prev.criteria, newCriterion] }));
  };

  const handleCriterionChange = (id: string, next: FitQuestionCriterion) => {
    onFeedbackClear();
    setQuestion((prev) => ({
      ...prev,
      criteria: prev.criteria.map((item) => (item.id === id ? next : item))
    }));
  };

  const handleCriterionRemove = (id: string) => {
    onFeedbackClear();
    setQuestion((prev) => ({
      ...prev,
      criteria: prev.criteria.filter((item) => item.id !== id)
    }));
  };

  const normalizedQuestion: FitQuestion = {
    ...question,
    shortTitle: question.shortTitle.trim(),
    content: question.content.trim(),
    criteria: question.criteria.map((criterion) => ({
      ...criterion,
      title: criterion.title.trim()
    }))
  };

  const submitSave = (closeAfterSave: boolean) => {
    setQuestion(normalizedQuestion);
    void onSave(normalizedQuestion, { closeAfterSave, expectedVersion });
  };

  const handleDelete = () => {
    if (!initialQuestion) {
      onClose();
      return;
    }
    onFeedbackClear();
    void onDelete(initialQuestion.id);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2>{initialQuestion ? 'Edit fit question' : 'New fit question'}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </header>

        {feedback && (
          <div
            className={feedback.type === 'info' ? styles.feedbackInfo : styles.feedbackError}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.text}
          </div>
        )}

        <div className={styles.content}>
          <label className={styles.fieldGroup}>
            <span>Short title</span>
            <input
              type="text"
              value={question.shortTitle}
              onChange={(event) => handleFieldChange('shortTitle', event.target.value)}
              placeholder="Enter short title"
            />
          </label>

          <label className={styles.fieldGroup}>
            <span>Question content</span>
            <textarea
              value={question.content}
              onChange={(event) => handleFieldChange('content', event.target.value)}
              placeholder="Describe the question"
              rows={6}
            />
          </label>

          <div className={styles.criteriaHeader}>
            <h3>Evaluation criteria</h3>
            <button className={styles.secondaryButton} onClick={handleAddCriterion}>
              Add criterion
            </button>
          </div>

          {question.criteria.length === 0 ? (
            <p className={styles.placeholder}>No criteria yet. Use the button above to add the first one.</p>
          ) : (
            question.criteria.map((criterion) => (
              <FitQuestionCriterionEditor
                key={criterion.id}
                criterion={criterion}
                onChange={(next) => handleCriterionChange(criterion.id, next)}
                onRemove={() => handleCriterionRemove(criterion.id)}
              />
            ))
          )}
        </div>

        <footer className={styles.footer}>
          <button className={styles.linkButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.dangerButton} onClick={handleDelete} disabled={!initialQuestion}>
            Delete question
          </button>
          <button className={styles.secondaryButton} onClick={() => submitSave(false)}>
            Save
          </button>
          <button className={styles.primaryButton} onClick={() => submitSave(true)}>
            Save and close
          </button>
        </footer>
      </div>
    </div>
  );
};
