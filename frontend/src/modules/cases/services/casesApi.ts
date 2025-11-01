import { apiRequest } from '../../../shared/api/httpClient';
import { CaseFileRecord, CaseFileUploadDto, CaseFolder } from '../../../shared/types/caseLibrary';

type CaseFolderPayload = Partial<CaseFolder> & {
  id?: unknown;
  version?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  files?: unknown;
  evaluationCriteria?: unknown;
};

type CaseFilePayload = Partial<CaseFileRecord> & {
  id?: unknown;
  size?: unknown;
  dataUrl?: unknown;
  uploadedAt?: unknown;
};

const normalizeIso = (value: unknown): string | null => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  return null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const normalizeFile = (payload: unknown): CaseFileRecord | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as CaseFilePayload;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
  const fileName = typeof record.fileName === 'string' && record.fileName.trim() ? record.fileName : null;
  const mimeType = typeof record.mimeType === 'string' && record.mimeType.trim() ? record.mimeType : 'application/octet-stream';
  const size = normalizeNumber(record.size) ?? 0;
  const uploadedAt = normalizeIso(record.uploadedAt);
  const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl : '';

  if (!id || !fileName || !uploadedAt) {
    return null;
  }

  return {
    id,
    fileName,
    mimeType,
    size,
    uploadedAt,
    dataUrl
  };
};

const normalizeFolder = (payload: unknown): CaseFolder | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as CaseFolderPayload;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name : null;
  const version = normalizeNumber(record.version);
  const createdAt = normalizeIso(record.createdAt);
  const updatedAt = normalizeIso(record.updatedAt);

  const filesSource = Array.isArray(record.files) ? record.files : [];
  const files = filesSource
    .map((file) => normalizeFile(file))
    .filter((item): item is CaseFileRecord => Boolean(item));

  const criteriaSource = Array.isArray(record.evaluationCriteria) ? record.evaluationCriteria : [];
  const evaluationCriteria = criteriaSource
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const criterion = entry as Partial<CaseFolder['evaluationCriteria'][number]> & { id?: unknown };
      const criterionId = typeof criterion.id === 'string' && criterion.id.trim() ? criterion.id : null;
      const title = typeof criterion.title === 'string' && criterion.title.trim() ? criterion.title : null;
      if (!criterionId || !title) {
        return null;
      }
      const ratings: CaseFolder['evaluationCriteria'][number]['ratings'] = {};
      const sourceRatings = (criterion.ratings ?? {}) as Record<string, unknown>;
      for (const score of [1, 2, 3, 4, 5] as const) {
        const value = sourceRatings[String(score)];
        if (typeof value === 'string' && value.trim()) {
          ratings[score] = value.trim();
        }
      }
      return { id: criterionId, title, ratings };
    })
    .filter((item): item is CaseFolder['evaluationCriteria'][number] => Boolean(item));

  if (!id || !name || version === null || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    name,
    version,
    createdAt,
    updatedAt,
    files,
    evaluationCriteria
  };
};

const ensureFolderList = (value: unknown): CaseFolder[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeFolder(item))
    .filter((folder): folder is CaseFolder => Boolean(folder));
};

const ensureFolder = (value: unknown): CaseFolder => {
  const folder = normalizeFolder(value);
  if (!folder) {
    throw new Error('Failed to parse the folder payload.');
  }
  return folder;
};

export const casesApi = {
  list: async () => ensureFolderList(await apiRequest<unknown>('/cases')),
  create: async (name: string) =>
    ensureFolder(
      await apiRequest<unknown>('/cases', {
        method: 'POST',
        body: { name }
      })
    ),
  rename: async (id: string, name: string, expectedVersion: number) =>
    ensureFolder(
      await apiRequest<unknown>(`/cases/${id}`, {
        method: 'PATCH',
        body: { name, expectedVersion }
      })
    ),
  remove: (id: string) =>
    apiRequest<{ id?: unknown }>(`/cases/${id}`, {
      method: 'DELETE'
    }).then((result) => {
      const identifier = typeof result.id === 'string' ? result.id : id;
      return { id: identifier };
    }),
  uploadFiles: async (id: string, files: CaseFileUploadDto[], expectedVersion: number) =>
    ensureFolder(
      await apiRequest<unknown>(`/cases/${id}/files`, {
        method: 'POST',
        body: { files, expectedVersion }
      })
    ),
  removeFile: async (folderId: string, fileId: string, expectedVersion: number) =>
    ensureFolder(
      await apiRequest<unknown>(`/cases/${folderId}/files/${fileId}`, {
        method: 'DELETE',
        body: { expectedVersion }
      })
    )
};
