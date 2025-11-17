import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  FinancialBlueprintModel,
  FinancialBlueprintRecord,
  FinancialLineItem,
  FinancialFiscalYearConfig,
  FinancialRatioDefinition
} from './financials.types.js';
import { createDefaultRatios, DEFAULT_FISCAL_YEAR_START_MONTH } from './financials.defaults.js';

type BlueprintRow = {
  id: string;
  definition: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
};

const mapRow = (row: BlueprintRow): FinancialBlueprintRecord => {
  const definition = (typeof row.definition === 'object' && row.definition !== null
    ? (row.definition as Record<string, unknown>)
    : {}) as {
    startMonth?: string;
    monthCount?: number;
    lines?: FinancialLineItem[];
    fiscalYear?: FinancialFiscalYearConfig;
    ratios?: FinancialRatioDefinition[];
  };

  const fiscalYearSource = definition.fiscalYear;
  const fiscalYear: FinancialFiscalYearConfig = (() => {
    if (fiscalYearSource && typeof fiscalYearSource === 'object') {
      const source = fiscalYearSource as Record<string, unknown>;
      const rawStart = Number(source.startMonth);
      const startMonth =
        Number.isFinite(rawStart) && rawStart >= 1 && rawStart <= 12
          ? Math.floor(rawStart)
          : DEFAULT_FISCAL_YEAR_START_MONTH;
      const label = typeof source.label === 'string' ? source.label : undefined;
      return label ? { startMonth, label } : { startMonth };
    }
    return { startMonth: DEFAULT_FISCAL_YEAR_START_MONTH };
  })();

  const ratios = Array.isArray(definition.ratios)
    ? (definition.ratios as FinancialRatioDefinition[])
    : createDefaultRatios();

  return {
    id: row.id,
    startMonth: typeof definition.startMonth === 'string' ? definition.startMonth : '2024-01',
    monthCount: typeof definition.monthCount === 'number' ? definition.monthCount : 36,
    lines: Array.isArray(definition.lines) ? (definition.lines as FinancialLineItem[]) : [],
    fiscalYear,
    ratios,
    version: Number(row.version ?? 1),
    createdAt: (row.created_at instanceof Date ? row.created_at : new Date()).toISOString(),
    updatedAt: (row.updated_at instanceof Date ? row.updated_at : new Date()).toISOString()
  };
};

export class FinancialsRepository {
  private readonly blueprintId = 'primary';

  async getBlueprint(): Promise<FinancialBlueprintRecord | null> {
    const result = await postgresPool.query<BlueprintRow>(
      `SELECT * FROM financial_blueprints WHERE id = $1 LIMIT 1;`,
      [this.blueprintId]
    );
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  }

  async insertBlueprint(model: FinancialBlueprintModel): Promise<FinancialBlueprintRecord> {
    const result = await postgresPool.query<BlueprintRow>(
      `INSERT INTO financial_blueprints (id, definition, version, created_at, updated_at)
       VALUES ($1, $2::jsonb, 1, NOW(), NOW())
       ON CONFLICT (id)
       DO UPDATE SET definition = EXCLUDED.definition,
                     version = financial_blueprints.version + 1,
                     updated_at = NOW()
       RETURNING *;`,
      [this.blueprintId, JSON.stringify(model)]
    );
    return mapRow(result.rows[0]);
  }

  async updateBlueprint(
    model: FinancialBlueprintModel,
    expectedVersion: number
  ): Promise<{ type: 'ok'; record: FinancialBlueprintRecord } | { type: 'version-conflict' }> {
    const result = await postgresPool.query<BlueprintRow>(
      `UPDATE financial_blueprints
          SET definition = $2::jsonb,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND version = $3
        RETURNING *;`,
      [this.blueprintId, JSON.stringify(model), expectedVersion]
    );
    if (!result.rows?.length) {
      return { type: 'version-conflict' };
    }
    return { type: 'ok', record: mapRow(result.rows[0]) };
  }
}
