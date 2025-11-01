import { apiRequest } from '../../../shared/api/httpClient';
import { CaseCriterion } from '../../../shared/types/caseCriteria';

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
    return trimmed ? trimmed : null;
  }
  return null;
};

const normalizeCriterion = (value: unknown): CaseCriterion | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as {
    id?: unknown;
    title?: unknown;
    ratings?: unknown;
    version?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  const id = normalizeString(payload.id);
  const title = normalizeString(payload.title);
  const version = typeof payload.version === 'number' ? payload.version : Number(payload.version);
  const createdAt = normalizeIso(payload.createdAt);
  const updatedAt = normalizeIso(payload.updatedAt);

  if (!id || !title || !Number.isInteger(version) || !createdAt || !updatedAt) {
    return null;
  }

  const ratingsSource =
    payload.ratings && typeof payload.ratings === 'object'
      ? (payload.ratings as Record<string, unknown>)
      : {};

  const ratings: CaseCriterion['ratings'] = {};
  for (const score of [1, 2, 3, 4, 5] as const) {
    const ratingValue = normalizeString(ratingsSource[String(score)]);
    if (ratingValue) {
      ratings[score] = ratingValue;
    }
  }

  return {
    id,
    title,
    ratings,
    version: Number(version),
    createdAt,
    updatedAt
  };
};

const ensureCriterion = (value: unknown): CaseCriterion => {
  const criterion = normalizeCriterion(value);
  if (!criterion) {
    throw new Error('Failed to parse the case criterion payload.');
  }
  return criterion;
};

const ensureCriterionList = (value: unknown): CaseCriterion[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeCriterion(item))
    .filter((criterion): criterion is CaseCriterion => Boolean(criterion));
};

const serializeCriterion = (criterion: CaseCriterion) => ({
  ...criterion,
  ratings: {
    1: criterion.ratings[1] ?? null,
    2: criterion.ratings[2] ?? null,
    3: criterion.ratings[3] ?? null,
    4: criterion.ratings[4] ?? null,
    5: criterion.ratings[5] ?? null
  }
});

export const caseCriteriaApi = {
  list: async () => ensureCriterionList(await apiRequest<unknown>('/case-criteria')),
  create: async (criterion: CaseCriterion) =>
    ensureCriterion(
      await apiRequest<unknown>('/case-criteria', {
        method: 'POST',
        body: { criterion: serializeCriterion(criterion) }
      })
    ),
  update: async (id: string, criterion: CaseCriterion, expectedVersion: number) =>
    ensureCriterion(
      await apiRequest<unknown>(`/case-criteria/${id}`, {
        method: 'PUT',
        body: { criterion: serializeCriterion(criterion), expectedVersion }
      })
    ),
  remove: async (id: string) =>
    apiRequest<{ id?: unknown }>(`/case-criteria/${id}`, { method: 'DELETE' }).then((result) => {
      const identifier = typeof result.id === 'string' ? result.id : id;
      return identifier;
    })
};
