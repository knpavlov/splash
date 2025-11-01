import { apiRequest } from '../../../shared/api/httpClient';
import { FitQuestion } from '../../../shared/types/fitQuestion';

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

const normalizeCriterion = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    title?: unknown;
    ratings?: unknown;
  };

  const id = normalizeString(payload.id);
  const title = normalizeString(payload.title);
  if (!id || !title) {
    return null;
  }

  const ratingsPayload =
    payload.ratings && typeof payload.ratings === 'object'
      ? (payload.ratings as Record<string, unknown>)
      : {};

  const ratings: FitQuestion['criteria'][number]['ratings'] = {};
  for (const score of [1, 2, 3, 4, 5] as const) {
    const ratingValue = normalizeString(ratingsPayload[String(score)]);
    if (ratingValue) {
      ratings[score] = ratingValue;
    }
  }

  return {
    id,
    title,
    ratings
  };
};

const normalizeQuestion = (value: unknown): FitQuestion | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as {
    id?: unknown;
    shortTitle?: unknown;
    content?: unknown;
    version?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    criteria?: unknown;
  };

  const id = normalizeString(payload.id);
  const shortTitle = normalizeString(payload.shortTitle);
  const content = normalizeString(payload.content);
  const version = typeof payload.version === 'number' ? payload.version : Number(payload.version);
  const createdAt = normalizeIso(payload.createdAt);
  const updatedAt = normalizeIso(payload.updatedAt);

  if (!id || !shortTitle || !content || !createdAt || !updatedAt || !Number.isInteger(version)) {
    return null;
  }

  const criteriaSource = Array.isArray(payload.criteria) ? payload.criteria : [];
  const criteria = criteriaSource
    .map((item) => normalizeCriterion(item))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    id,
    shortTitle,
    content,
    version: Number(version),
    createdAt,
    updatedAt,
    criteria
  };
};

const ensureQuestion = (value: unknown): FitQuestion => {
  const question = normalizeQuestion(value);
  if (!question) {
    throw new Error('Failed to parse the fit question payload.');
  }
  return question;
};

const ensureQuestionList = (value: unknown): FitQuestion[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeQuestion(item))
    .filter((question): question is FitQuestion => Boolean(question));
};

const serializeQuestion = (question: FitQuestion) => ({
  ...question,
  criteria: question.criteria.map((criterion) => ({
    ...criterion,
    ratings: {
      1: criterion.ratings[1] ?? null,
      2: criterion.ratings[2] ?? null,
      3: criterion.ratings[3] ?? null,
      4: criterion.ratings[4] ?? null,
      5: criterion.ratings[5] ?? null
    }
  }))
});

export const fitQuestionsApi = {
  list: async () => ensureQuestionList(await apiRequest<unknown>('/questions')),
  create: async (question: FitQuestion) =>
    ensureQuestion(
      await apiRequest<unknown>('/questions', {
        method: 'POST',
        body: { question: serializeQuestion(question) }
      })
    ),
  update: async (id: string, question: FitQuestion, expectedVersion: number) =>
    ensureQuestion(
      await apiRequest<unknown>(`/questions/${id}`, {
        method: 'PUT',
        body: { question: serializeQuestion(question), expectedVersion }
      })
    ),
  remove: async (id: string) =>
    apiRequest<{ id?: unknown }>(`/questions/${id}`, { method: 'DELETE' }).then((result) => {
      const identifier = typeof result.id === 'string' ? result.id : id;
      return identifier;
    })
};
