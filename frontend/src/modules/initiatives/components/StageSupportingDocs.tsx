import { useRef, useState } from 'react';
import styles from '../../../styles/StageSupportingDocs.module.css';
import { InitiativeStageData, InitiativeSupportingDocument } from '../../../shared/types/initiative';
import { convertFilesToRecords } from '../../cases/services/fileAdapter';
import { generateId } from '../../../shared/ui/generateId';

interface StageSupportingDocsProps {
  stage: InitiativeStageData;
  disabled: boolean;
  onChange: (next: InitiativeStageData) => void;
}

export const StageSupportingDocs = ({ stage, disabled, onChange }: StageSupportingDocsProps) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const [status, setStatus] = useState<{ state: 'idle' | 'uploading' | 'error'; message: string | null }>({
    state: 'idle',
    message: null
  });

  const updateDocs = (updater: (docs: InitiativeSupportingDocument[]) => InitiativeSupportingDocument[]) => {
    onChange({ ...stage, supportingDocs: updater(stage.supportingDocs ?? []) });
  };

  const handleFiles = async (files: File[]) => {
    if (!files.length || disabled) {
      return;
    }
    setStatus({ state: 'uploading', message: null });
    try {
      const records = await convertFilesToRecords(files);
      const now = new Date().toISOString();
      const mapped: InitiativeSupportingDocument[] = records.map((record) => ({
        id: generateId(),
        fileName: record.fileName,
        mimeType: record.mimeType || null,
        size: record.size ?? 0,
        dataUrl: record.dataUrl,
        uploadedAt: now,
        comment: ''
      }));
      updateDocs((docs) => [...docs, ...mapped]);
      setStatus({ state: 'idle', message: null });
    } catch (error) {
      setStatus({ state: 'error', message: (error as Error).message });
    } finally {
      setDragActive(false);
      dragCounter.current = 0;
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    await handleFiles(files);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.types?.includes('Files')) {
      return;
    }
    dragCounter.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setDragActive(false);
    }
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h3>Supporting documentation</h3>
          <p>Attach references and add a short note for reviewers.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={() => inputRef.current?.click()} disabled={disabled}>
            Upload files
          </button>
          <input
            type="file"
            multiple
            ref={inputRef}
            style={{ display: 'none' }}
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              void handleFiles(files);
              event.target.value = '';
            }}
            disabled={disabled}
          />
        </div>
      </header>

      <div
        className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={(event) => void handleDrop(event)}
      >
        <p>Drag & drop supporting documents here</p>
        <p className={styles.helper}>PDFs, images, slides — anything that clarifies the KPI/initiative context.</p>
      </div>
      {status.state === 'error' && status.message && <p className={styles.error}>{status.message}</p>}

      {(stage.supportingDocs ?? []).length === 0 ? (
        <p className={styles.placeholder}>No supporting documents yet.</p>
      ) : (
        <ul className={styles.list}>
          {(stage.supportingDocs ?? []).map((doc) => (
            <li key={doc.id} className={styles.item}>
              <div className={styles.itemMeta}>
                <p className={styles.itemName}>{doc.fileName}</p>
                <p className={styles.itemMetaText}>
                  {Math.max(1, Math.round(doc.size / 1024))} KB · {new Date(doc.uploadedAt).toLocaleString()}
                </p>
              </div>
              <div className={styles.itemComment}>
                <input
                  type="text"
                  value={doc.comment}
                  disabled={disabled}
                  onChange={(event) =>
                    updateDocs((docs) =>
                      docs.map((item) => (item.id === doc.id ? { ...item, comment: event.target.value } : item))
                    )
                  }
                  placeholder="What is this document about?"
                />
                <div className={styles.itemActions}>
                  <a className={styles.secondaryButton} href={doc.dataUrl} download={doc.fileName}>
                    Download
                  </a>
                  <button
                    className={styles.removeButton}
                    type="button"
                    disabled={disabled}
                    onClick={() => updateDocs((docs) => docs.filter((item) => item.id !== doc.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
