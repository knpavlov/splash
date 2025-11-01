import { CaseFileUploadDto } from '../../../shared/types/caseLibrary';

type ProgressListener = (value: number) => void;

const readFileAsDataUrl = (file: File, onProgress?: ProgressListener) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const updateProgress = (loaded: number) => {
      if (!onProgress) {
        return;
      }
      onProgress(Math.max(0, Math.min(1, loaded / Math.max(file.size, 1))));
    };

    reader.onload = () => {
      updateProgress(file.size);
      resolve(String(reader.result));
    };
    reader.onerror = () => reject(reader.error);
    reader.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      updateProgress(event.loaded);
    };
    reader.readAsDataURL(file);
  });

export const convertFilesToRecords = async (
  files: File[],
  onProgress?: (percentage: number) => void
): Promise<CaseFileUploadDto[]> => {
  if (!files.length) {
    return [];
  }

  const perFileProgress = new Map<File, number>();

  const emitProgress = () => {
    if (!onProgress) {
      return;
    }
    const totalBytes = files.reduce((sum, current) => sum + current.size, 0);
    if (totalBytes === 0) {
      onProgress(1);
      return;
    }
    const loadedBytes = Array.from(perFileProgress.values()).reduce((sum, value) => sum + value, 0);
    onProgress(Math.max(0, Math.min(1, loadedBytes / totalBytes)));
  };

  const records = await Promise.all(
    files.map(async (file) => {
      perFileProgress.set(file, 0);
      const dataUrl = await readFileAsDataUrl(file, (value) => {
        perFileProgress.set(file, value * file.size);
        emitProgress();
      });
      perFileProgress.set(file, file.size);
      emitProgress();
      return {
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl
      } satisfies CaseFileUploadDto;
    })
  );

  onProgress?.(1);
  return records;
};
