import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EvaluationConfig } from '../../shared/types/evaluation';
import {
  useEvaluationsState,
  useCasesState,
  useFitQuestionsState,
  useAccountsState
} from '../../app/state/AppStateContext';
import { EvaluationEditorForm } from './components/EvaluationEditorForm';
import styles from '../../styles/EvaluationEditorForm.module.css';

interface RouteParams {
  id?: string;
}

type Banner = { type: 'info' | 'error'; text: string } | null;

export const EvaluationEditorPage = () => {
  const { id } = useParams<RouteParams>();
  const navigate = useNavigate();
  const { list, saveEvaluation, removeEvaluation } = useEvaluationsState();
  const { folders } = useCasesState();
  const { list: fitQuestions } = useFitQuestionsState();
  const { list: accounts } = useAccountsState();
  const [banner, setBanner] = useState<Banner>(null);
  const [notFound, setNotFound] = useState(false);

  const initialConfig = useMemo<EvaluationConfig | null>(() => {
    if (!id) {
      return null;
    }
    const found = list.find((evaluation) => evaluation.id === id);
    return found ?? null;
  }, [id, list]);

  useEffect(() => {
    if (id && !initialConfig) {
      setNotFound(true);
    } else {
      setNotFound(false);
    }
  }, [id, initialConfig]);

  const handleSave = async (
    config: EvaluationConfig,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => {
    setBanner(null);
    const result = await saveEvaluation(config, options.expectedVersion);
    if (!result.ok) {
      const message =
        result.error === 'version-conflict'
          ? 'Data version is outdated. Refresh the page and try again.'
          : result.error === 'invalid-input'
            ? 'Check the form data and try again.'
            : result.error === 'not-found'
              ? 'Evaluation not found. Refresh the page.'
              : 'Failed to save evaluation. Try again later.';
      setBanner({ type: 'error', text: message });
      return;
    }

    const saved = result.data;
    if (!id) {
      navigate(`/evaluations/${saved.id}`, { replace: !options.closeAfterSave });
    }
    if (options.closeAfterSave) {
      navigate('/evaluations');
      return;
    }
    setBanner({ type: 'info', text: 'Changes saved.' });
  };

  const handleDelete = async (targetId: string) => {
    setBanner(null);
    const confirmed = window.confirm('Delete the evaluation setup and all related interviews?');
    if (!confirmed) {
      return;
    }
    const result = await removeEvaluation(targetId);
    if (!result.ok) {
      const message =
        result.error === 'not-found'
          ? 'Evaluation was already removed or unavailable.'
          : 'Failed to delete evaluation.';
      setBanner({ type: 'error', text: message });
      return;
    }
    navigate('/evaluations');
  };

  if (notFound) {
    return (
      <div className={styles.pageContainer}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Evaluation not found</h1>
            <p className={styles.pageSubtitle}>Select another evaluation from the list.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.cancelButton} onClick={() => navigate('/evaluations')}>
              Back to list
            </button>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {banner && (
        <div
          className={`${styles.banner} ${banner.type === 'info' ? styles.bannerInfo : styles.bannerError}`}
        >
          {banner.text}
        </div>
      )}

      <EvaluationEditorForm
        initialConfig={initialConfig}
        onSave={handleSave}
        onDelete={initialConfig ? handleDelete : undefined}
        onCancel={() => navigate('/evaluations')}
        folders={folders}
        fitQuestions={fitQuestions}
        accounts={accounts}
      />
    </div>
  );
};
