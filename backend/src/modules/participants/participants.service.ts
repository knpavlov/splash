import { randomUUID } from 'crypto';
import {
  ParticipantInput,
  ParticipantRecord,
  ParticipantUpdateModel,
  ParticipantWriteModel
} from './participants.types.js';
import { ParticipantsRepository } from './participants.repository.js';

const normalizeOptional = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

export class ParticipantsService {
  constructor(private readonly repository: ParticipantsRepository) {}

  listParticipants(): Promise<ParticipantRecord[]> {
    return this.repository.listParticipants();
  }

  async createParticipant(input: ParticipantInput): Promise<ParticipantRecord> {
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    if (!displayName) {
      throw new Error('INVALID_INPUT');
    }

    const model: ParticipantWriteModel = {
      id: randomUUID(),
      displayName,
      email: normalizeOptional(input.email),
      role: normalizeOptional(input.role),
      hierarchyLevel1: normalizeOptional(input.hierarchyLevel1),
      hierarchyLevel2: normalizeOptional(input.hierarchyLevel2),
      hierarchyLevel3: normalizeOptional(input.hierarchyLevel3)
    };

    return this.repository.createParticipant(model);
  }

  async updateParticipant(id: string, patch: ParticipantInput): Promise<ParticipantRecord> {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('INVALID_INPUT');
    }
    const normalized: ParticipantUpdateModel = {};
    if (patch.displayName !== undefined) {
      const next = typeof patch.displayName === 'string' ? patch.displayName.trim() : '';
      if (!next) {
        throw new Error('INVALID_INPUT');
      }
      normalized.displayName = next;
    }
    if (patch.email !== undefined) {
      normalized.email = normalizeOptional(patch.email);
    }
    if (patch.role !== undefined) {
      normalized.role = normalizeOptional(patch.role);
    }
    if (patch.hierarchyLevel1 !== undefined) {
      normalized.hierarchyLevel1 = normalizeOptional(patch.hierarchyLevel1);
    }
    if (patch.hierarchyLevel2 !== undefined) {
      normalized.hierarchyLevel2 = normalizeOptional(patch.hierarchyLevel2);
    }
    if (patch.hierarchyLevel3 !== undefined) {
      normalized.hierarchyLevel3 = normalizeOptional(patch.hierarchyLevel3);
    }

    const result = await this.repository.updateParticipant(id.trim(), normalized);
    if (!result) {
      throw new Error('NOT_FOUND');
    }
    return result;
  }

  async deleteParticipant(id: string): Promise<string> {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('INVALID_INPUT');
    }
    const normalizedId = id.trim();
    const deleted = await this.repository.deleteParticipant(normalizedId);
    if (!deleted) {
      throw new Error('NOT_FOUND');
    }
    return normalizedId;
  }
}
