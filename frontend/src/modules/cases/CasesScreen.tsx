import { useMemo, useState } from 'react';
import styles from '../../styles/CasesScreen.module.css';
import { useCasesState } from '../../app/state/AppStateContext';
import { CaseFolderCard } from './components/CaseFolderCard';
import type { CaseFileUploadDto } from '../../shared/types/caseLibrary';

export const CasesScreen = () => {
  const { folders, createFolder, renameFolder, deleteFolder, registerFiles, removeFile } = useCasesState();
  const [newFolderName, setNewFolderName] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, 'en-US')),
    [folders]
  );

  const handleCreateFolder = async () => {
    const result = await createFolder(newFolderName);
    if (!result.ok) {
      const message =
        result.error === 'duplicate'
          ? 'A folder with this name already exists.'
          : result.error === 'invalid-input'
            ? 'Enter a valid name.'
            : 'Failed to create the folder. Try again later.';
      setErrorMessage(message);
      setInfoMessage(null);
      return;
    }
    setInfoMessage(`Folder "${result.data.name}" created.`);
    setErrorMessage(null);
    setNewFolderName('');
  };

  const handleRename = async (folderId: string, folderVersion: number, name: string) => {
    const result = await renameFolder(folderId, name, folderVersion);
    if (!result.ok) {
      if (result.error === 'version-conflict') {
        throw new Error('The folder was updated by another user. Refresh the page.');
      }
      if (result.error === 'duplicate') {
        throw new Error('A folder with this name already exists.');
      }
      if (result.error === 'invalid-input') {
        throw new Error('Enter a valid name.');
      }
      if (result.error === 'not-found') {
        throw new Error('Folder not found. Refresh the page.');
      }
      throw new Error('Failed to rename the folder.');
    }
    setInfoMessage(`Folder renamed to "${result.data.name}".`);
    setErrorMessage(null);
  };

  const handleDelete = async (folderId: string) => {
    const result = await deleteFolder(folderId);
    if (!result.ok) {
      setErrorMessage('Failed to delete the folder.');
      if (result.error === 'not-found') {
        throw new Error('The folder was already deleted.');
      }
      throw new Error('Failed to delete the folder.');
    }
    setInfoMessage('Folder deleted.');
    setErrorMessage(null);
  };

  const handleUpload = async (
    folderId: string,
    folderVersion: number,
    records: CaseFileUploadDto[]
  ) => {
    const result = await registerFiles(folderId, records, folderVersion);
    if (!result.ok) {
      if (result.error === 'version-conflict') {
        throw new Error('Files were not saved: the folder was updated by another user.');
      }
      if (result.error === 'invalid-input') {
        throw new Error('Select at least one file to upload.');
      }
      if (result.error === 'not-found') {
        throw new Error('Folder not found. Refresh the page.');
      }
      throw new Error('Failed to upload files.');
    }
    setInfoMessage(`Files uploaded: ${records.length}.`);
    setErrorMessage(null);
  };

  const handleRemoveFile = async (folderId: string, folderVersion: number, fileId: string) => {
    const result = await removeFile(folderId, fileId, folderVersion);
    if (!result.ok) {
      if (result.error === 'version-conflict') {
        throw new Error('The file was not removed: the folder already has newer changes.');
      }
      if (result.error === 'not-found') {
        throw new Error('File not found. Refresh the page.');
      }
      throw new Error('Failed to delete the file.');
    }
    setInfoMessage('File deleted.');
    setErrorMessage(null);
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Case library</h1>
          <p className={styles.subtitle}>Manage case structures and quick access to materials.</p>
        </div>
        <div className={styles.createBlock}>
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="New folder name"
          />
          <button className={styles.primaryButton} onClick={() => void handleCreateFolder()}>
            Create folder
          </button>
        </div>
      </header>

      {(infoMessage || errorMessage) && (
        <div className={infoMessage ? styles.infoBanner : styles.errorBanner}>
          {infoMessage ?? errorMessage}
        </div>
      )}

      <div className={styles.foldersArea}>
        {sortedFolders.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No folders yet</h2>
            <p>Add your first folder to populate the case library.</p>
          </div>
        ) : (
          <div className={styles.foldersGrid}>
            {sortedFolders.map((folder) => (
              <CaseFolderCard
                key={folder.id}
                folder={folder}
                onRename={(name) => handleRename(folder.id, folder.version, name)}
                onDelete={() => handleDelete(folder.id)}
                onUpload={(files) => handleUpload(folder.id, folder.version, files)}
                onRemoveFile={(fileId) => handleRemoveFile(folder.id, folder.version, fileId)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
