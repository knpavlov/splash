import { useMemo, useState } from 'react';
import styles from '../../styles/WorkstreamsScreen.module.css';
import { Workstream } from '../../shared/types/workstream';
import { WorkstreamCard } from './components/WorkstreamCard';
import { WorkstreamModal } from './components/WorkstreamModal';
import { useWorkstreamsState } from '../../app/state/AppStateContext';

type Banner = { type: 'info' | 'error'; text: string } | null;

export const WorkstreamsScreen = () => {
  const { list, saveWorkstream, removeWorkstream, roleOptions } = useWorkstreamsState();
  const [banner, setBanner] = useState<Banner>(null);
  const [modalBanner, setModalBanner] = useState<Banner>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalWorkstream, setModalWorkstream] = useState<Workstream | null>(null);

  const sortedWorkstreams = useMemo(
    () =>
      [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [list]
  );

  const openCreateModal = () => {
    setModalWorkstream(null);
    setModalBanner(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalWorkstream(null);
    setModalBanner(null);
  };

  const handleSave = async (
    workstream: Workstream,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => {
    setModalBanner(null);

    if (!workstream.name.trim()) {
      setModalBanner({ type: 'error', text: 'Workstream name is required.' });
      return;
    }

    const result = await saveWorkstream(workstream, options.expectedVersion);
    if (!result.ok) {
      const message =
        result.error === 'version-conflict'
          ? 'Could not save: the workstream was updated elsewhere. Refresh and try again.'
          : result.error === 'invalid-input'
            ? 'Please fill in the required fields.'
            : result.error === 'not-found'
              ? 'Workstream not found. Close the modal and try again.'
              : 'Failed to save workstream. Please retry.';
      setModalBanner({ type: 'error', text: message });
      return;
    }

    setBanner({ type: 'info', text: 'Workstream saved.' });
    if (options.closeAfterSave) {
      closeModal();
    } else {
      setModalWorkstream(result.data);
      setModalBanner({ type: 'info', text: 'Changes saved.' });
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this workstream permanently?');
    if (!confirmed) {
      return;
    }
    const result = await removeWorkstream(id);
    if (!result.ok) {
      const message =
        result.error === 'not-found'
          ? 'Workstream no longer exists.'
          : 'Failed to delete the workstream. Try again.';
      setBanner({ type: 'error', text: message });
      return;
    }
    setBanner({ type: 'info', text: 'Workstream deleted.' });
    closeModal();
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Workstreams</h1>
          <p className={styles.subtitle}>Configure gate approvals and link them to account roles.</p>
        </div>
        <button className={styles.primaryButton} onClick={openCreateModal}>
          Create new workstream
        </button>
      </header>

      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
      )}

      <div className={styles.cardsGrid}>
        {sortedWorkstreams.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No workstreams yet</h2>
            <p>Use the “Create new workstream” button to add the first one.</p>
          </div>
        ) : (
          sortedWorkstreams.map((workstream) => (
            <WorkstreamCard
              key={workstream.id}
              workstream={workstream}
              onOpen={() => {
                setModalWorkstream(workstream);
                setModalBanner(null);
                setIsModalOpen(true);
              }}
            />
          ))
        )}
      </div>

      {isModalOpen && (
        <WorkstreamModal
          initialWorkstream={modalWorkstream}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          feedback={modalBanner}
          onFeedbackClear={() => setModalBanner(null)}
          roleOptions={roleOptions}
        />
      )}
    </section>
  );
};
