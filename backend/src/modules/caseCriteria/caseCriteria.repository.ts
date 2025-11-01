import { postgresPool } from '../../shared/database/postgres.client.js';
import { CaseCriterionRecord, CaseCriterionWriteModel } from './caseCriteria.types.js';

interface CaseCriterionRow extends Record<string, unknown> {
  id: string;
  title: string;
  rating_1: string | null;
  rating_2: string | null;
  rating_3: string | null;
  rating_4: string | null;
  rating_5: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const mapRowToRecord = (row: CaseCriterionRow): CaseCriterionRecord => {
  const ratings: CaseCriterionRecord['ratings'] = {};
  const ratingPairs: Array<[1 | 2 | 3 | 4 | 5, string | null]> = [
    [1, row.rating_1],
    [2, row.rating_2],
    [3, row.rating_3],
    [4, row.rating_4],
    [5, row.rating_5]
  ];

  for (const [score, value] of ratingPairs) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        ratings[score] = trimmed;
      }
    }
  }

  return {
    id: row.id,
    title: row.title,
    ratings,
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
};

export class CaseCriteriaRepository {
  async listCriteria(): Promise<CaseCriterionRecord[]> {
    const result = await postgresPool.query<CaseCriterionRow>(
      `SELECT id, title, rating_1, rating_2, rating_3, rating_4, rating_5, version, created_at, updated_at
         FROM case_criteria
        ORDER BY created_at ASC;`
    );
    return result.rows.map((row) => mapRowToRecord(row as CaseCriterionRow));
  }

  async createCriterion(model: CaseCriterionWriteModel): Promise<CaseCriterionRecord> {
    const result = await postgresPool.query<CaseCriterionRow>(
      `INSERT INTO case_criteria (id, title, rating_1, rating_2, rating_3, rating_4, rating_5)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, rating_1, rating_2, rating_3, rating_4, rating_5, version, created_at, updated_at;`,
      [
        model.id,
        model.title,
        model.ratings[1] ?? null,
        model.ratings[2] ?? null,
        model.ratings[3] ?? null,
        model.ratings[4] ?? null,
        model.ratings[5] ?? null
      ]
    );

    return mapRowToRecord(result.rows[0] as CaseCriterionRow);
  }

  async updateCriterion(
    model: CaseCriterionWriteModel,
    expectedVersion: number
  ): Promise<'version-conflict' | CaseCriterionRecord | null> {
    const result = await postgresPool.query(
      `UPDATE case_criteria
          SET title = $2,
              rating_1 = $3,
              rating_2 = $4,
              rating_3 = $5,
              rating_4 = $6,
              rating_5 = $7,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND version = $8
        RETURNING id, title, rating_1, rating_2, rating_3, rating_4, rating_5, version, created_at, updated_at;`,
      [
        model.id,
        model.title,
        model.ratings[1] ?? null,
        model.ratings[2] ?? null,
        model.ratings[3] ?? null,
        model.ratings[4] ?? null,
        model.ratings[5] ?? null,
        expectedVersion
      ]
    );

    const rows = result.rows as CaseCriterionRow[];
    if (!rows || rows.length === 0) {
      const exists = await postgresPool.query('SELECT 1 FROM case_criteria WHERE id = $1;', [model.id]);
      if (!exists.rows || exists.rows.length === 0) {
        return null;
      }
      return 'version-conflict';
    }

    return mapRowToRecord(rows[0]);
  }

  async deleteCriterion(id: string): Promise<boolean> {
    const result = await postgresPool.query('DELETE FROM case_criteria WHERE id = $1 RETURNING id;', [id]);
    return Boolean(result.rows && result.rows.length > 0);
  }
}
