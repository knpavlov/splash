import { useMemo, useState } from 'react';
import styles from '../../styles/FitQuestionsScreen.module.css';
import { useFitQuestionsState } from '../../app/state/AppStateContext';
import { FitQuestion } from '../../shared/types/fitQuestion';
import { FitQuestionModal } from './components/FitQuestionModal';
import { FitQuestionCard } from './components/FitQuestionCard';

type Banner = { type: 'info' | 'error'; text: string } | null;

export const FitQuestionsScreen = () => {
  const { list, saveQuestion, removeQuestion } = useFitQuestionsState();
  const [banner, setBanner] = useState<Banner>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalQuestion, setModalQuestion] = useState<FitQuestion | null>(null);
  const [modalBanner, setModalBanner] = useState<Banner>(null);

  const sortedQuestions = useMemo(
    () =>
      [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [list]
  );

  const handleCreate = () => {
    setModalQuestion(null);
    setModalBanner(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalQuestion(null);
    setModalBanner(null);
  };

  const handleSave = async (
    question: FitQuestion,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => {
    setModalBanner(null);

    const trimmedTitle = question.shortTitle.trim();
    const trimmedContent = question.content.trim();

    if (!trimmedTitle || !trimmedContent) {
      setModalBanner({
        type: 'error',
        text: 'Fill in the required fields: short title and question content.'
      });
      return;
    }

    const normalizedCriteria = question.criteria.map((item) => ({
      ...item,
      title: item.title.trim()
    }));

    if (normalizedCriteria.some((item) => !item.title)) {
      setModalBanner({
        type: 'error',
        text: 'Provide titles for all evaluation criteria or remove unnecessary ones.'
      });
      return;
    }

    const normalizedQuestion: FitQuestion = {
      ...question,
      shortTitle: trimmedTitle,
      content: trimmedContent,
      criteria: normalizedCriteria
    };

    const result = await saveQuestion(normalizedQuestion, options.expectedVersion);
    if (!result.ok) {
      if (result.error === 'version-conflict') {
        setModalBanner({
          type: 'error',
          text: 'Could not save: the question was updated elsewhere. Refresh the list and try again.'
        });
      } else if (result.error === 'invalid-input') {
        setModalBanner({
          type: 'error',
          text: 'Invalid data. Check the fields and try again.'
        });
      } else {
        setModalBanner({
          type: 'error',
          text: 'Failed to save changes. Please retry.'
        });
      }
      return;
    }

    setBanner({ type: 'info', text: 'Fit question saved.' });

    if (options.closeAfterSave) {
      closeModal();
    } else {
      setModalQuestion(result.data);
      setModalBanner({ type: 'info', text: 'Changes saved.' });
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this fit question permanently?');
    if (!confirmed) {
      return;
    }
    const result = await removeQuestion(id);
    if (!result.ok) {
      setBanner({ type: 'error', text: 'Failed to delete the question.' });
      return;
    }
    setBanner({ type: 'info', text: 'Fit question deleted.' });
    closeModal();
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Fit questions</h1>
          <p className={styles.subtitle}>
            Create, store and edit fit interview questions with evaluation criteria.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={handleCreate}>
          New fit question
        </button>
      </header>

      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>
          {banner.text}
        </div>
      )}

      <div className={styles.cardsGrid}>
        {sortedQuestions.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No fit questions yet</h2>
            <p>Use the “New fit question” button to add the first one.</p>
          </div>
        ) : (
          sortedQuestions.map((question) => (
            <FitQuestionCard
              key={question.id}
              question={question}
              onOpen={() => {
                setModalQuestion(question);
                setModalBanner(null);
                setIsModalOpen(true);
              }}
            />
          ))
        )}
      </div>

      {isModalOpen && (
        <FitQuestionModal
          initialQuestion={modalQuestion}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          feedback={modalBanner}
          onFeedbackClear={() => setModalBanner(null)}
        />
      )}
    </section>
  );
};
