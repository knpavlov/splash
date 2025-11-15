import { apiRequest } from '../../../shared/api/httpClient';
import { Participant, ParticipantPayload, ParticipantUpdatePayload } from '../../../shared/types/participant';

const normalizeIso = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

const normalizeParticipant = (value: unknown): Participant | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    displayName?: unknown;
    email?: unknown;
    role?: unknown;
    hierarchyLevel1?: unknown;
    hierarchyLevel2?: unknown;
    hierarchyLevel3?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  const id = normalizeString(payload.id);
  const displayName = normalizeString(payload.displayName);
  const createdAt = normalizeIso(payload.createdAt);
  const updatedAt = normalizeIso(payload.updatedAt);
  if (!id || !displayName || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    displayName,
    email: normalizeString(payload.email),
    role: normalizeString(payload.role),
    hierarchyLevel1: normalizeString(payload.hierarchyLevel1),
    hierarchyLevel2: normalizeString(payload.hierarchyLevel2),
    hierarchyLevel3: normalizeString(payload.hierarchyLevel3),
    createdAt,
    updatedAt
  };
};

const ensureParticipantList = (value: unknown): Participant[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeParticipant(item)).filter((item): item is Participant => Boolean(item));
};

const ensureParticipant = (value: unknown): Participant => {
  const participant = normalizeParticipant(value);
  if (!participant) {
    throw new Error('Failed to parse participant payload.');
  }
  return participant;
};

export const participantsApi = {
  list: async (): Promise<Participant[]> => ensureParticipantList(await apiRequest<unknown>('/participants')),
  create: async (payload: ParticipantPayload): Promise<Participant> =>
    ensureParticipant(
      await apiRequest<unknown>('/participants', {
        method: 'POST',
        body: payload
      })
    ),
  update: async (id: string, payload: ParticipantUpdatePayload): Promise<Participant> =>
    ensureParticipant(
      await apiRequest<unknown>(`/participants/${id}`, {
        method: 'PATCH',
        body: payload
      })
    ),
  remove: async (id: string): Promise<string> => {
    await apiRequest<unknown>(`/participants/${id}`, {
      method: 'DELETE'
    });
    return id;
  }
};
