import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  FitQuestionCriterionRecord,
  FitQuestionRecord,
  FitQuestionWriteModel
} from './questions.types.js';

interface FitQuestionRow extends Record<string, unknown> {
  question_id: string;
  short_title: string;
  content: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  criterion_id: string | null;
  criterion_title: string | null;
  rating_1: string | null;
  rating_2: string | null;
  rating_3: string | null;
  rating_4: string | null;
  rating_5: string | null;
}

const selectQuestionBase = `
  SELECT
    q.id AS question_id,
    q.short_title,
    q.content,
    q.version,
    q.created_at,
    q.updated_at,
    c.id AS criterion_id,
    c.title AS criterion_title,
    c.rating_1,
    c.rating_2,
    c.rating_3,
    c.rating_4,
    c.rating_5
  FROM fit_questions q
  LEFT JOIN fit_question_criteria c ON c.question_id = q.id
`;

const toNullableString = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const mapRowsToQuestions = (rows: FitQuestionRow[]): FitQuestionRecord[] => {
  const questions = new Map<string, FitQuestionRecord>();
  const criteriaIndex = new Map<string, Map<string, FitQuestionCriterionRecord>>();

  for (const row of rows) {
    const questionId = row.question_id;
    let question = questions.get(questionId);
    if (!question) {
      question = {
        id: questionId,
        shortTitle: row.short_title,
        content: row.content,
        version: Number(row.version ?? 1),
        createdAt: (row.created_at instanceof Date ? row.created_at : new Date()).toISOString(),
        updatedAt: (row.updated_at instanceof Date ? row.updated_at : new Date()).toISOString(),
        criteria: []
      };
      questions.set(questionId, question);
      criteriaIndex.set(questionId, new Map());
    }

    if (!row.criterion_id) {
      continue;
    }

    const perQuestion = criteriaIndex.get(questionId)!;
    let criterion = perQuestion.get(row.criterion_id);

    if (!criterion) {
      criterion = {
        id: row.criterion_id,
        title: row.criterion_title ?? '',
        ratings: {}
      };
      perQuestion.set(row.criterion_id, criterion);
      question.criteria.push(criterion);
    }

    const ratingMap: Array<[1 | 2 | 3 | 4 | 5, string | null]> = [
      [1, row.rating_1],
      [2, row.rating_2],
      [3, row.rating_3],
      [4, row.rating_4],
      [5, row.rating_5]
    ];

    for (const [score, ratingValue] of ratingMap) {
      if (typeof ratingValue === 'string') {
        const trimmed = ratingValue.trim();
        if (trimmed) {
          criterion.ratings[score] = trimmed;
        }
      }
    }
  }

  return Array.from(questions.values());
};

const connectClient = async () =>
  (postgresPool as unknown as { connect: () => Promise<any> }).connect();

const insertCriteria = async (client: any, questionId: string, model: FitQuestionWriteModel) => {
  for (const criterion of model.criteria) {
    await client.query(
      `INSERT INTO fit_question_criteria (id, question_id, title, rating_1, rating_2, rating_3, rating_4, rating_5)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        criterion.id,
        questionId,
        criterion.title,
        toNullableString(criterion.ratings[1]),
        toNullableString(criterion.ratings[2]),
        toNullableString(criterion.ratings[3]),
        toNullableString(criterion.ratings[4]),
        toNullableString(criterion.ratings[5])
      ]
    );
  }
};

export class QuestionsRepository {
  async listQuestions(): Promise<FitQuestionRecord[]> {
    const result = await postgresPool.query<FitQuestionRow>(
      `${selectQuestionBase} ORDER BY q.updated_at DESC, q.created_at DESC, c.created_at ASC;`
    );
    return mapRowsToQuestions(result.rows ?? []);
  }

  async findQuestion(id: string): Promise<FitQuestionRecord | null> {
    const result = await postgresPool.query<FitQuestionRow>(
      `${selectQuestionBase} WHERE q.id = $1 ORDER BY c.created_at ASC;`,
      [id]
    );
    const questions = mapRowsToQuestions(result.rows ?? []);
    return questions.length > 0 ? questions[0] : null;
  }

  async createQuestion(model: FitQuestionWriteModel): Promise<FitQuestionRecord> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO fit_questions (id, short_title, content, version, created_at, updated_at)
         VALUES ($1, $2, $3, 1, NOW(), NOW());`,
        [model.id, model.shortTitle, model.content]
      );

      await insertCriteria(client, model.id, model);

      const rowsResult = (await client.query(
        `${selectQuestionBase} WHERE q.id = $1 ORDER BY c.created_at ASC;`,
        [model.id]
      )) as { rows?: FitQuestionRow[] };

      await client.query('COMMIT');
      const questions = mapRowsToQuestions(rowsResult.rows ?? []);
      if (!questions.length) {
        throw new Error('FAILED_TO_READ');
      }
      return questions[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateQuestion(
    model: FitQuestionWriteModel,
    expectedVersion: number
  ): Promise<'version-conflict' | FitQuestionRecord | null> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      const updateResult = (await client.query(
        `UPDATE fit_questions
            SET short_title = $1,
                content = $2,
                version = version + 1,
                updated_at = NOW()
          WHERE id = $3 AND version = $4
          RETURNING id;`,
        [model.shortTitle, model.content, model.id, expectedVersion]
      )) as { rows?: Array<{ id: string }> };

      if (!updateResult.rows || updateResult.rows.length === 0) {
        const existsResult = await client.query('SELECT id FROM fit_questions WHERE id = $1 LIMIT 1;', [model.id]);
        await client.query('ROLLBACK');
        if (!existsResult.rows || existsResult.rows.length === 0) {
          return null;
        }
        return 'version-conflict';
      }

      await client.query('DELETE FROM fit_question_criteria WHERE question_id = $1;', [model.id]);
      await insertCriteria(client, model.id, model);

      const rowsResult = (await client.query(
        `${selectQuestionBase} WHERE q.id = $1 ORDER BY c.created_at ASC;`,
        [model.id]
      )) as { rows?: FitQuestionRow[] };
      await client.query('COMMIT');
      const questions = mapRowsToQuestions(rowsResult.rows ?? []);
      return questions.length > 0 ? questions[0] : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteQuestion(id: string): Promise<boolean> {
    const result = await postgresPool.query('DELETE FROM fit_questions WHERE id = $1 RETURNING id;', [id]);
    return (result.rows ?? []).length > 0;
  }
}
