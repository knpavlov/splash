import { useEffect, useRef, useState } from 'react';
import {
  CandidateProfile,
  CandidateResume,
  CandidateTargetPractice
} from '../../../shared/types/candidate';
import styles from '../../../styles/CandidateModal.module.css';
import { generateId } from '../../../shared/ui/generateId';
import { convertFileToResume } from '../services/resumeAdapter';
import { formatDate } from '../../../shared/utils/date';

type UploadState = { status: 'idle' | 'processing' | 'done'; progress: number };

interface CandidateModalProps {
  initialProfile: CandidateProfile | null;
  onSave: (
    profile: CandidateProfile,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  feedback: { type: 'info' | 'error'; text: string } | null;
  onFeedbackClear: () => void;
}

const TARGET_PRACTICE_OPTIONS: CandidateTargetPractice[] = [
  'PI',
  'PEPI',
  'ET',
  'Tax',
  'Restructuring'
];

const createEmptyProfile = (): CandidateProfile => ({
  id: generateId(),
  version: 1,
  firstName: '',
  lastName: '',
  gender: undefined,
  age: undefined,
  city: '',
  desiredPosition: '',
  targetPractice: undefined,
  targetOffice: '',
  phone: '',
  email: '',
  experienceSummary: '',
  totalExperienceYears: undefined,
  consultingExperienceYears: undefined,
  consultingCompanies: '',
  lastCompany: '',
  lastPosition: '',
  lastDuration: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export const CandidateModal = ({
  initialProfile,
  onSave,
  onDelete,
  onClose,
  feedback,
  onFeedbackClear
}: CandidateModalProps) => {
  const [profile, setProfile] = useState<CandidateProfile>(createEmptyProfile());
  const [resume, setResume] = useState<CandidateResume | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0 });
  const hideProgressTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (initialProfile) {
      setProfile({ ...initialProfile, targetOffice: initialProfile.targetOffice ?? '' });
      setResume(initialProfile.resume);
    } else {
      const empty = createEmptyProfile();
      setProfile(empty);
      setResume(undefined);
    }
  }, [initialProfile]);

  useEffect(() => {
    return () => {
      if (hideProgressTimeout.current) {
        window.clearTimeout(hideProgressTimeout.current);
        hideProgressTimeout.current = null;
      }
    };
  }, []);

  const expectedVersion = initialProfile ? initialProfile.version : null;

  const scheduleHideProgress = () => {
    if (hideProgressTimeout.current) {
      window.clearTimeout(hideProgressTimeout.current);
    }
    hideProgressTimeout.current = window.setTimeout(() => {
      setUploadState({ status: 'idle', progress: 0 });
      hideProgressTimeout.current = null;
    }, 1200);
  };

  const handleChange = (field: keyof CandidateProfile, value: string | number | undefined) => {
    onFeedbackClear();
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleResumeSelection = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) {
      return;
    }
    const file = list[0];
    if (hideProgressTimeout.current) {
      window.clearTimeout(hideProgressTimeout.current);
      hideProgressTimeout.current = null;
    }
    setUploadState({ status: 'processing', progress: 0 });
    setIsDragActive(false);
    onFeedbackClear();
    try {
      const converted = await convertFileToResume(file, (value) => {
        setUploadState((previous) => ({
          status: 'processing',
          progress: Math.max(previous.progress, value)
        }));
      });
      setResume(converted);
      setProfile((prev) => ({ ...prev, resume: converted }));
      setUploadState({ status: 'done', progress: 1 });
      scheduleHideProgress();
    } catch (error) {
      setUploadState({ status: 'idle', progress: 0 });
    }
  };

  const handleResumeRemoval = () => {
    setResume(undefined);
    setProfile((prev) => ({ ...prev, resume: undefined }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFeedbackClear();
    setUploadState({ status: 'idle', progress: 0 });
  };

  const trimmedProfile: CandidateProfile = {
    ...profile,
    firstName: profile.firstName.trim(),
    lastName: profile.lastName.trim()
  };

  const isProfileValid = Boolean(trimmedProfile.firstName && trimmedProfile.lastName);

  const submitSave = (closeAfterSave: boolean) => {
    setProfile(trimmedProfile);
    void onSave({ ...trimmedProfile, resume }, { closeAfterSave, expectedVersion });
  };

  const handleDelete = () => {
    if (!initialProfile) {
      onClose();
      return;
    }
    onFeedbackClear();
    void onDelete(initialProfile.id);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2>{initialProfile ? 'Edit candidate' : 'New candidate'}</h2>
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

        <section
          className={styles.uploadSection}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!event.dataTransfer.types?.includes('Files')) {
              return;
            }
            dragCounterRef.current += 1;
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
            if (dragCounterRef.current === 0) {
              setIsDragActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragCounterRef.current = 0;
            setIsDragActive(false);
            void handleResumeSelection(event.dataTransfer.files);
          }}
        >
          <div className={`${styles.uploadZone} ${isDragActive ? styles.uploadZoneActive : ''}`}>
            {resume ? (
              <>
                <a
                  className={styles.resumeLink}
                  href={resume.dataUrl}
                  download={resume.fileName}
                  rel="noopener noreferrer"
                >
                  <p className={styles.resumeName}>{resume.fileName}</p>
                </a>
                <p className={styles.resumeMeta}>
                  Uploaded {formatDate(resume.uploadedAt)} · {(resume.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <p>Drag a resume here or pick a file</p>
            )}
          </div>
          {uploadState.status !== 'idle' ? (
            <div className={styles.uploadStatus}>
              <div className={styles.uploadStatusRow}>
                <span className={styles.uploadStatusLabel}>
                  {uploadState.status === 'processing' ? 'Processing file' : 'File ready'}
                </span>
                <span className={styles.uploadStatusValue}>{Math.round(uploadState.progress * 100)}%</span>
              </div>
              <div className={styles.uploadProgressTrack}>
                <div
                  className={styles.uploadProgressValue}
                  style={{ width: `${Math.round(uploadState.progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          <div className={styles.uploadActions}>
            <button className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>
              Choose file
            </button>
            <button
              className={styles.dangerButton}
              onClick={handleResumeRemoval}
              disabled={!resume}
            >
              Delete resume
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className={styles.hiddenInput}
              onChange={(event) => {
                const input = event.target;
                if (!input.files) {
                  return;
                }
                void handleResumeSelection(input.files).finally(() => {
                  input.value = '';
                });
              }}
            />
          </div>
        </section>

        <div className={styles.formGrid}>
          <label>
            <span className={styles.labelText}>
              First name<span className={styles.requiredMark}>*</span>
            </span>
            <input value={profile.firstName} onChange={(e) => handleChange('firstName', e.target.value)} />
          </label>
          <label>
            <span className={styles.labelText}>
              Last name<span className={styles.requiredMark}>*</span>
            </span>
            <input value={profile.lastName} onChange={(e) => handleChange('lastName', e.target.value)} />
          </label>
          <label>
            <span>Gender</span>
            <select
              value={profile.gender ?? ''}
              onChange={(e) => handleChange('gender', e.target.value ? e.target.value : undefined)}
            >
              <option value="">Not specified</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non-binary">Non-binary</option>
              <option value="prefer-not-to-say">Prefer not to say</option>
            </select>
          </label>
          <label>
            <span>Age</span>
            <input
              value={profile.age ?? ''}
              onChange={(e) => handleChange('age', e.target.value ? Number(e.target.value) : undefined)}
              type="number"
              min={0}
            />
          </label>
          <label>
            <span>City</span>
            <input value={profile.city} onChange={(e) => handleChange('city', e.target.value)} />
          </label>
          <label>
            <span>Desired position</span>
            <input value={profile.desiredPosition} onChange={(e) => handleChange('desiredPosition', e.target.value)} />
          </label>
          <label>
            <span>Target practice</span>
            <select
              value={profile.targetPractice ?? ''}
              onChange={(e) =>
                handleChange('targetPractice', e.target.value ? (e.target.value as CandidateTargetPractice) : undefined)
              }
            >
              <option value="">Not selected</option>
              {TARGET_PRACTICE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Target office</span>
            <input value={profile.targetOffice} onChange={(e) => handleChange('targetOffice', e.target.value)} />
          </label>
          <label>
            <span>Phone</span>
            <input value={profile.phone} onChange={(e) => handleChange('phone', e.target.value)} />
          </label>
          <label>
            <span>Email</span>
            <input value={profile.email} onChange={(e) => handleChange('email', e.target.value)} />
          </label>
          <label className={styles.fullWidth}>
            <span>Professional experience summary</span>
            <textarea
              value={profile.experienceSummary}
              onChange={(e) => handleChange('experienceSummary', e.target.value)}
            />
          </label>
          <label>
            <span>Total years of experience</span>
            <input
              value={profile.totalExperienceYears ?? ''}
              onChange={(e) =>
                handleChange('totalExperienceYears', e.target.value ? Number(e.target.value) : undefined)
              }
              type="number"
              min={0}
            />
          </label>
          <label>
            <span>Years in consulting</span>
            <input
              value={profile.consultingExperienceYears ?? ''}
              onChange={(e) =>
                handleChange(
                  'consultingExperienceYears',
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              type="number"
              min={0}
            />
          </label>
          <label className={styles.fullWidth}>
            <span>Consulting firms</span>
            <input
              value={profile.consultingCompanies}
              onChange={(e) => handleChange('consultingCompanies', e.target.value)}
              placeholder="Comma-separated"
            />
          </label>
          <label>
            <span>Most recent company</span>
            <input value={profile.lastCompany} onChange={(e) => handleChange('lastCompany', e.target.value)} />
          </label>
          <label>
            <span>Most recent position</span>
            <input value={profile.lastPosition} onChange={(e) => handleChange('lastPosition', e.target.value)} />
          </label>
          <label>
            <span>Duration at last job</span>
            <input value={profile.lastDuration} onChange={(e) => handleChange('lastDuration', e.target.value)} />
          </label>
        </div>

        <footer className={styles.footer}>
          <button className={styles.dangerButton} onClick={handleDelete} disabled={!initialProfile}>
            Delete profile
          </button>
          <div className={styles.footerActions}>
            <button className={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <button className={styles.secondaryButton} onClick={() => submitSave(false)} disabled={!isProfileValid}>
              Save
            </button>
            <button className={styles.primaryButton} onClick={() => submitSave(true)} disabled={!isProfileValid}>
              Save and close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
