import { useCallback, useMemo, useState } from 'react';
import styles from '../../styles/CandidatesScreen.module.css';
import { CandidateModal } from './components/CandidateModal';
import { CandidateTable, CandidateTableRow, CandidateSortKey } from './components/CandidateTable';
import { useCandidatesState } from '../../app/state/AppStateContext';
import { CandidateProfile, CandidateResume } from '../../shared/types/candidate';

type Banner = { type: 'info' | 'error'; text: string } | null;

export const CandidatesScreen = () => {
  const { list, saveProfile, removeProfile } = useCandidatesState();
  const [banner, setBanner] = useState<Banner>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCandidate, setModalCandidate] = useState<CandidateProfile | null>(null);
  const [modalBanner, setModalBanner] = useState<Banner>(null);
  const [sortKey, setSortKey] = useState<CandidateSortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const getGenderLabel = (value?: string) => {
    switch (value) {
      case 'female':
        return 'Female';
      case 'male':
        return 'Male';
      case 'non-binary':
        return 'Non-binary';
      case 'prefer-not-to-say':
        return 'Prefer not to say';
      default:
        return 'Not specified';
    }
  };

  const sortedCandidates = useMemo(() => {
    const copy = [...list];

    const compareStrings = (a?: string | null, b?: string | null) => {
      const normalizedA = a?.trim();
      const normalizedB = b?.trim();
      const hasA = Boolean(normalizedA);
      const hasB = Boolean(normalizedB);

      if (hasA && hasB) {
        return normalizedA!.localeCompare(normalizedB!, 'en-US', { sensitivity: 'base' });
      }
      if (hasA) {
        return -1;
      }
      if (hasB) {
        return 1;
      }
      return 0;
    };

    const compareNumbers = (a?: number | null, b?: number | null) => {
      if (a != null && b != null) {
        return a - b;
      }
      if (a != null) {
        return -1;
      }
      if (b != null) {
        return 1;
      }
      return 0;
    };

    copy.sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case 'firstName':
          result = compareStrings(a.firstName, b.firstName);
          break;
        case 'lastName':
          result = compareStrings(a.lastName, b.lastName);
          break;
        case 'gender':
          result = compareStrings(getGenderLabel(a.gender), getGenderLabel(b.gender));
          break;
        case 'age':
          result = compareNumbers(a.age, b.age);
          break;
        case 'city':
          result = compareStrings(a.city, b.city);
          break;
        case 'desiredPosition':
          result = compareStrings(a.desiredPosition, b.desiredPosition);
          break;
        case 'targetPractice':
          result = compareStrings(a.targetPractice, b.targetPractice);
          break;
        case 'targetOffice':
          result = compareStrings(a.targetOffice, b.targetOffice);
          break;
        case 'phone':
          result = compareStrings(a.phone, b.phone);
          break;
        case 'email':
          result = compareStrings(a.email, b.email);
          break;
        case 'updatedAt':
          result = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          result = 0;
      }

      if (result === 0) {
        result = compareStrings(`${a.lastName}${a.firstName}`, `${b.lastName}${b.firstName}`);
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return copy;
  }, [list, sortDirection, sortKey]);

  const handleSortChange = (key: CandidateSortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setSortDirection(key === 'updatedAt' ? 'desc' : 'asc');
      return key;
    });
  };

  const formatText = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : '—';
  };

  const downloadResumeFile = useCallback((resume: CandidateResume) => {
    const link = document.createElement('a');
    link.href = resume.dataUrl;
    link.download = resume.fileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleCreate = () => {
    setModalCandidate(null);
    setModalBanner(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalCandidate(null);
    setModalBanner(null);
  };

  const openCandidate = useCallback((candidate: CandidateProfile) => {
    setModalCandidate(candidate);
    setModalBanner(null);
    setIsModalOpen(true);
  }, []);

  const tableRows = useMemo<CandidateTableRow[]>(
    () =>
      sortedCandidates.map((candidate) => {
        const resume = candidate.resume;
        return {
          id: candidate.id,
          firstName: formatText(candidate.firstName),
          lastName: formatText(candidate.lastName),
          gender: getGenderLabel(candidate.gender),
          age: candidate.age != null ? String(candidate.age) : '—',
          city: formatText(candidate.city),
          desiredPosition: formatText(candidate.desiredPosition),
          targetPractice: formatText(candidate.targetPractice),
          targetOffice: formatText(candidate.targetOffice),
          phone: formatText(candidate.phone),
          email: formatText(candidate.email),
          updatedAt: candidate.updatedAt,
          hasResume: Boolean(resume),
          onOpen: () => openCandidate(candidate),
          onDownloadResume: resume ? () => downloadResumeFile(resume) : undefined
        };
      }),
    [downloadResumeFile, openCandidate, sortedCandidates]
  );

  const handleSave = async (
    profile: CandidateProfile,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => {
    setModalBanner(null);

    const trimmedFirstName = profile.firstName.trim();
    const trimmedLastName = profile.lastName.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      setModalBanner({ type: 'error', text: 'Fill in the required fields: First name and Last name.' });
      return;
    }

    const normalizedProfile: CandidateProfile = {
      ...profile,
      firstName: trimmedFirstName,
      lastName: trimmedLastName
    };

    const result = await saveProfile(normalizedProfile, options.expectedVersion);
    if (!result.ok) {
      if (result.error === 'version-conflict') {
        setModalBanner({
          type: 'error',
          text: 'Could not save: the profile was updated in another session. Refresh the list and try again.'
        });
      } else {
        setModalBanner({
          type: 'error',
          text: 'Failed to save changes. Check the required fields and try again.'
        });
      }
      return;
    }

    setBanner({ type: 'info', text: 'Candidate card saved.' });

    if (options.closeAfterSave) {
      closeModal();
    } else {
      setModalCandidate(result.data);
      setModalBanner({ type: 'info', text: 'Changes saved.' });
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete the candidate card permanently?');
    if (!confirmed) {
      return;
    }
    const result = await removeProfile(id);
    if (!result.ok) {
      setBanner({ type: 'error', text: 'Failed to delete the candidate.' });
      return;
    }
    setBanner({ type: 'info', text: 'Candidate card deleted.' });
    closeModal();
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Candidate database</h1>
          <p className={styles.subtitle}>Create and edit candidate profiles with AI assistance.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={handleCreate}>
            Create profile
          </button>
        </div>
      </header>

      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
      )}

      <CandidateTable
        rows={tableRows}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {isModalOpen && (
        <CandidateModal
          initialProfile={modalCandidate}
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
