import { CandidateResume } from '../../../shared/types/candidate';
import { generateId } from '../../../shared/ui/generateId';

type ProgressListener = (value: number) => void;

const clampProgress = (value: number) => Math.max(0, Math.min(1, value));

const readFileAsDataUrl = (file: File, onProgress?: ProgressListener) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const emitProgress = (loaded: number) => {
      if (!onProgress) {
        return;
      }
      const total = Math.max(file.size, 1);
      onProgress(clampProgress(loaded / total));
    };

    reader.onload = () => {
      emitProgress(file.size);
      resolve(String(reader.result));
    };
    reader.onerror = () => reject(reader.error);
    reader.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      emitProgress(event.loaded);
    };
    reader.readAsDataURL(file);
  });

const readFileAsText = (file: File, onProgress?: ProgressListener) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(1);
      resolve(String(reader.result));
    };
    reader.onerror = () => reject(reader.error);
    reader.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      const total = Math.max(file.size, 1);
      onProgress?.(clampProgress(event.loaded / total));
    };
    reader.readAsText(file);
  });

const isTextLikeFile = (file: File) => {
  if (file.type.startsWith('text/')) {
    return true;
  }
  const lowercaseName = file.name.toLowerCase();
  return lowercaseName.endsWith('.txt') || lowercaseName.endsWith('.md') || lowercaseName.endsWith('.json');
};

export const convertFileToResume = async (
  file: File,
  onProgress?: ProgressListener
): Promise<CandidateResume> => {
  const updateProgress = (value: number) => {
    onProgress?.(clampProgress(value));
  };

  updateProgress(0);

  const dataUrl = await readFileAsDataUrl(file, (value) => {
    updateProgress(value * 0.85);
  });

  let textContent: string | undefined;
  if (isTextLikeFile(file)) {
    try {
      textContent = await readFileAsText(file, (value) => {
        updateProgress(0.85 + value * 0.15);
      });
    } catch (error) {
      textContent = undefined;
    }
  }

  updateProgress(1);

  return {
    id: generateId(),
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    dataUrl,
    textContent
  } satisfies CandidateResume;
};
