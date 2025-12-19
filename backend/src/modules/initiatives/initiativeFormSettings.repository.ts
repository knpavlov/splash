import { postgresPool } from '../../shared/database/postgres.client.js';
import { initiativeStageKeys } from './initiatives.types.js';
import { initiativeFormBlockKeys } from './initiativeFormSettings.types.js';
import type {
  InitiativeFormFieldRequirement,
  InitiativeFormSettingsMatrix,
  InitiativeFormStageSettings,
  InitiativeFormSettingsPayload
} from './initiativeFormSettings.types.js';
import type { InitiativeStageKey } from './initiatives.types.js';

type SettingsRow = {
  matrix: unknown;
  updated_at: Date;
};

const isRequirement = (value: unknown): value is InitiativeFormFieldRequirement =>
  value === 'hidden' || value === 'optional' || value === 'required';

const createDefaultStageSettings = (): InitiativeFormStageSettings =>
  initiativeFormBlockKeys.reduce((acc, blockKey) => {
    acc[blockKey] = 'optional';
    return acc;
  }, {} as InitiativeFormStageSettings);

const createDefaultMatrix = (): InitiativeFormSettingsMatrix =>
  ({
    stages: initiativeStageKeys.reduce((acc, stageKey) => {
      acc[stageKey] = createDefaultStageSettings();
      return acc;
    }, {} as Record<InitiativeStageKey, InitiativeFormStageSettings>)
  }) satisfies InitiativeFormSettingsMatrix;

const normalizeMatrix = (input: unknown): InitiativeFormSettingsMatrix => {
  const fallback = createDefaultMatrix();
  if (!input || typeof input !== 'object') {
    return fallback;
  }
  const matrixInput =
    (input as Partial<InitiativeFormSettingsMatrix>).stages && typeof (input as any).stages === 'object'
      ? ((input as any).stages as Record<string, unknown>)
      : (input as Record<string, unknown>);

  const stages = initiativeStageKeys.reduce((acc, stageKey) => {
    const stageInput = matrixInput?.[stageKey];
    const stageObj = stageInput && typeof stageInput === 'object' ? (stageInput as Record<string, unknown>) : {};
    acc[stageKey] = initiativeFormBlockKeys.reduce((blocks, blockKey) => {
      const value = stageObj?.[blockKey];
      blocks[blockKey] = isRequirement(value) ? value : 'optional';
      return blocks;
    }, {} as InitiativeFormStageSettings);
    return acc;
  }, {} as Record<InitiativeStageKey, InitiativeFormStageSettings>);

  return { stages };
};

export class InitiativeFormSettingsRepository {
  private readonly settingsId = 1;

  async getSettings(): Promise<InitiativeFormSettingsPayload> {
    const result = await postgresPool.query<SettingsRow>(
      `
        SELECT matrix, updated_at
          FROM initiative_stage_form_settings
         WHERE id = $1
         LIMIT 1;
      `,
      [this.settingsId]
    );

    const row = result.rows?.[0];
    if (row) {
      return { ...normalizeMatrix(row.matrix), updatedAt: row.updated_at.toISOString() };
    }

    const fallback = createDefaultMatrix();
    await postgresPool.query(
      `
        INSERT INTO initiative_stage_form_settings (id, matrix)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO NOTHING;
      `,
      [this.settingsId, JSON.stringify(fallback.stages)]
    );

    const inserted = await postgresPool.query<SettingsRow>(
      `
        SELECT matrix, updated_at
          FROM initiative_stage_form_settings
         WHERE id = $1
         LIMIT 1;
      `,
      [this.settingsId]
    );
    const insertedRow = inserted.rows?.[0];
    return {
      ...normalizeMatrix(insertedRow?.matrix ?? fallback),
      updatedAt: (insertedRow?.updated_at ?? new Date()).toISOString()
    };
  }

  async updateSettings(next: InitiativeFormSettingsMatrix): Promise<InitiativeFormSettingsPayload> {
    const normalized = normalizeMatrix(next);
    const result = await postgresPool.query<SettingsRow>(
      `
        UPDATE initiative_stage_form_settings
           SET matrix = $2::jsonb,
               updated_at = NOW()
         WHERE id = $1
     RETURNING matrix, updated_at;
      `,
      [this.settingsId, JSON.stringify(normalized.stages)]
    );

    const row = result.rows?.[0];
    if (row) {
      return { ...normalizeMatrix(row.matrix), updatedAt: row.updated_at.toISOString() };
    }
    return this.getSettings();
  }
}

