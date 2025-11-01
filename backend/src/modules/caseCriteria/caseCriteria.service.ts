import { randomUUID } from 'crypto';
import { CaseCriteriaRepository } from './caseCriteria.repository.js';
import { CaseCriterionRecord, CaseCriterionWriteModel } from './caseCriteria.types.js';

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

const buildWriteModel = (payload: unknown): CaseCriterionWriteModel => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_INPUT');
  }

  const source = payload as Record<string, unknown>;
  const idRaw = typeof source.id === 'string' ? source.id.trim() : '';
  const title = readRequiredString(source.title);

  const ratingsSource =
    source.ratings && typeof source.ratings === 'object'
      ? (source.ratings as Record<string, unknown>)
      : {};

  const ratings: CaseCriterionWriteModel['ratings'] = {};
  for (const score of [1, 2, 3, 4, 5] as const) {
    const ratingValue = readOptionalString(ratingsSource[String(score)]);
    if (ratingValue) {
      ratings[score] = ratingValue;
    }
  }

  return {
    id: idRaw || randomUUID(),
    title,
    ratings
  };
};

export class CaseCriteriaService {
  constructor(private readonly repository: CaseCriteriaRepository) {}

  async listCriteria(): Promise<CaseCriterionRecord[]> {
    return this.repository.listCriteria();
  }

  async createCriterion(payload: unknown): Promise<CaseCriterionRecord> {
    const model = buildWriteModel(payload);
    return this.repository.createCriterion(model);
  }

  async updateCriterion(
    id: string,
    payload: unknown,
    expectedVersion: number
  ): Promise<CaseCriterionRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const version = ensurePositiveInteger(expectedVersion);
    const model = buildWriteModel(payload);
    model.id = trimmed;

    const result = await this.repository.updateCriterion(model, version);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }
    return result;
  }

  async deleteCriterion(id: string): Promise<string> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const deleted = await this.repository.deleteCriterion(trimmed);
    if (!deleted) {
      throw new Error('NOT_FOUND');
    }
    return trimmed;
  }
}
