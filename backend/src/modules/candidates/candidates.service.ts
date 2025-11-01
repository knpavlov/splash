import { randomUUID } from 'crypto';
import { CandidatesRepository } from './candidates.repository.js';
import { CandidateRecord, CandidateResumeRecord, CandidateWriteModel } from './candidates.types.js';

const readOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const TARGET_PRACTICE_OPTIONS = new Set(['PI', 'PEPI', 'ET', 'Tax', 'Restructuring']);

const readOptionalPractice = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return TARGET_PRACTICE_OPTIONS.has(trimmed) ? trimmed : undefined;
};

const readOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const ensurePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
};

const sanitizeResume = (value: unknown): CandidateResumeRecord => {
  if (!value || typeof value !== 'object') {
    throw new Error('INVALID_INPUT');
  }
  const payload = value as Record<string, unknown>;
  const idRaw = typeof payload.id === 'string' ? payload.id.trim() : '';
  const fileNameRaw = typeof payload.fileName === 'string' ? payload.fileName.trim() : '';
  if (!fileNameRaw) {
    throw new Error('INVALID_INPUT');
  }
  const mimeType = readOptionalString(payload.mimeType) ?? 'application/octet-stream';
  const size = Math.max(0, readOptionalNumber(payload.size) ?? 0);
  const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
  if (!dataUrl) {
    throw new Error('INVALID_INPUT');
  }
  const uploadedAtRaw = typeof payload.uploadedAt === 'string' ? payload.uploadedAt.trim() : '';
  const uploadedAtDate = uploadedAtRaw ? new Date(uploadedAtRaw) : new Date();
  const uploadedAt = Number.isNaN(uploadedAtDate.getTime()) ? new Date() : uploadedAtDate;
  const textContent = typeof payload.textContent === 'string' ? payload.textContent : undefined;

  return {
    id: idRaw || randomUUID(),
    fileName: fileNameRaw,
    mimeType,
    size,
    dataUrl,
    uploadedAt: uploadedAt.toISOString(),
    textContent
  };
};

const buildWriteModel = (payload: unknown): CandidateWriteModel => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_INPUT');
  }
  const source = payload as Record<string, unknown>;
  const idRaw = typeof source.id === 'string' ? source.id.trim() : '';
  const firstNameRaw = typeof source.firstName === 'string' ? source.firstName.trim() : '';
  const lastNameRaw = typeof source.lastName === 'string' ? source.lastName.trim() : '';

  if (!firstNameRaw || !lastNameRaw) {
    throw new Error('INVALID_INPUT');
  }

  let resume: CandidateResumeRecord | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(source, 'resume')) {
    const resumeValue = (source as { resume?: unknown }).resume;
    if (resumeValue === null) {
      resume = null;
    } else if (resumeValue !== undefined) {
      resume = sanitizeResume(resumeValue);
    }
  }

  return {
    id: idRaw || randomUUID(),
    firstName: firstNameRaw,
    lastName: lastNameRaw,
    gender: readOptionalString(source.gender),
    age: readOptionalNumber(source.age),
    city: readOptionalString(source.city),
    desiredPosition: readOptionalString(source.desiredPosition),
    targetPractice: readOptionalPractice(source.targetPractice),
    targetOffice: readOptionalString(source.targetOffice),
    phone: readOptionalString(source.phone),
    email: readOptionalString(source.email),
    experienceSummary: readOptionalString(source.experienceSummary),
    totalExperienceYears: readOptionalNumber(source.totalExperienceYears),
    consultingExperienceYears: readOptionalNumber(source.consultingExperienceYears),
    consultingCompanies: readOptionalString(source.consultingCompanies),
    lastCompany: readOptionalString(source.lastCompany),
    lastPosition: readOptionalString(source.lastPosition),
    lastDuration: readOptionalString(source.lastDuration),
    resume
  };
};

export class CandidatesService {
  constructor(private readonly repository: CandidatesRepository) {}

  async listCandidates(): Promise<CandidateRecord[]> {
    return this.repository.listCandidates();
  }

  async getCandidate(id: string): Promise<CandidateRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const candidate = await this.repository.findCandidate(trimmed);
    if (!candidate) {
      throw new Error('NOT_FOUND');
    }
    return candidate;
  }

  async createCandidate(payload: unknown): Promise<CandidateRecord> {
    const model = buildWriteModel(payload);
    return this.repository.createCandidate(model);
  }

  async updateCandidate(id: string, payload: unknown, expectedVersion: number): Promise<CandidateRecord> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const version = ensurePositiveInteger(expectedVersion);
    if (version === null) {
      throw new Error('INVALID_INPUT');
    }
    const model = buildWriteModel(payload);
    model.id = trimmed;
    const result = await this.repository.updateCandidate(model, version);
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    if (!result) {
      throw new Error('NOT_FOUND');
    }
    return result;
  }

  async deleteCandidate(id: string): Promise<string> {
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('INVALID_INPUT');
    }
    const deleted = await this.repository.deleteCandidate(trimmed);
    if (!deleted) {
      throw new Error('NOT_FOUND');
    }
    return trimmed;
  }
}
