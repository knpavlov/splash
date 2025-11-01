import { randomUUID } from 'crypto';
import { QuestionsRepository } from './questions.repository.js';
import { FitQuestionRecord, FitQuestionWriteModel } from './questions.types.js';

const readRequiredString = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('INVALID_INPUT');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('INVALID_INPUT');
  }
  return trimmed;
};

const readOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const ensurePositiveInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('INVALID_INPUT');
  }
  return value;
};

const sanitizeCriterion = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    throw new Error('INVALID_INPUT');
  }
  const payload = value as Record<string, unknown>;
  const idRaw = typeof payload.id === 'string' ? payload.id.trim() : '';
  const title = readRequiredString(payload.title);
  const ratingsSource =
    payload.ratings && typeof payload.ratings === 'object'
      ? (payload.ratings as Record<string, unknown>)
      : {};

  const ratings: FitQuestionWriteModel['criteria'][number]['ratings'] = {};
  for (const score of [1, 2, 3, 4, 5] as const) {
    const valueRaw = readOptionalString(ratingsSource[String(score)]);
    if (valueRaw) {
      ratings[score] = valueRaw;
    }
  }

  return {
    id: idRaw || randomUUID(),
    title,
    ratings
  };
};

const buildWriteModel = (payload: unknown): FitQuestionWriteModel => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_INPUT');
  }

  const source = payload as Record<string, unknown>;
  const idRaw = typeof source.id === 'string' ? source.id.trim() : '';
  const shortTitle = readRequiredString(source.shortTitle);
  const content = readRequiredString(source.content);
  const criteriaSource = Array.isArray(source.criteria) ? source.criteria : [];
  const criteria = criteriaSource.map((item) => sanitizeCriterion(item));

  return {
    id: idRaw || randomUUID(),
    shortTitle,
    content,
    criteria
  };
};

export class QuestionsService {
  constructor(private readonly repository: QuestionsRepository) {}

  async listQuestions(): Promise<FitQuestionRecord[]> {
    return this.repository.listQuestions();
  }

  async getQuestion(id: string): Promise<FitQuestionRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const question = await this.repository.findQuestion(trimmed);
    if (!question) {
      throw new Error('NOT_FOUND');
    }
    return question;
  }

  async createQuestion(payload: unknown): Promise<FitQuestionRecord> {
    const model = buildWriteModel(payload);
    return this.repository.createQuestion(model);
  }

  async updateQuestion(id: string, payload: unknown, expectedVersion: number): Promise<FitQuestionRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const version = ensurePositiveInteger(expectedVersion);
    const model = buildWriteModel(payload);
    model.id = trimmed;
    const result = await this.repository.updateQuestion(model, version);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }
    return result;
  }

  async deleteQuestion(id: string): Promise<string> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const deleted = await this.repository.deleteQuestion(trimmed);
    if (!deleted) {
      throw new Error('NOT_FOUND');
    }
    return trimmed;
  }
}
