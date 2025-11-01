import { randomUUID } from 'crypto';
import { postgresPool } from '../../shared/database/postgres.client.js';
import { CandidateRecord, CandidateResumeRecord, CandidateWriteModel } from './candidates.types.js';

interface CandidateJoinedRow extends Record<string, unknown> {
  candidate_id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  age: number | null;
  city: string | null;
  desired_position: string | null;
  target_practice: string | null;
  target_office: string | null;
  phone: string | null;
  email: string | null;
  experience_summary: string | null;
  total_experience_years: number | null;
  consulting_experience_years: number | null;
  consulting_companies: string | null;
  last_company: string | null;
  last_position: string | null;
  last_duration: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  resume_id: string | null;
  resume_file_name: string | null;
  resume_mime_type: string | null;
  resume_file_size: number | null;
  resume_data_url: string | null;
  resume_text_content: string | null;
  resume_uploaded_at: Date | null;
}

const selectCandidateBase = `
  SELECT c.id AS candidate_id,
         c.first_name,
         c.last_name,
         c.gender,
         c.age,
         c.city,
         c.desired_position,
         c.target_practice,
         c.target_office,
         c.phone,
         c.email,
         c.experience_summary,
         c.total_experience_years,
         c.consulting_experience_years,
         c.consulting_companies,
         c.last_company,
         c.last_position,
         c.last_duration,
         c.version,
         c.created_at,
         c.updated_at,
         r.id AS resume_id,
         r.file_name AS resume_file_name,
         r.mime_type AS resume_mime_type,
         r.file_size AS resume_file_size,
         r.data_url AS resume_data_url,
         r.text_content AS resume_text_content,
         r.uploaded_at AS resume_uploaded_at
    FROM candidates c
    LEFT JOIN candidate_resumes r ON r.candidate_id = c.id
`;

const toOptionalNumber = (value: number | null | undefined): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
};

const toOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const mapRowToCandidate = (row: CandidateJoinedRow): CandidateRecord => {
  let resume: CandidateResumeRecord | undefined;
  if (row.resume_id) {
    const uploadedAt = row.resume_uploaded_at ? row.resume_uploaded_at.toISOString() : new Date().toISOString();
    resume = {
      id: row.resume_id,
      fileName: row.resume_file_name ?? 'Resume',
      mimeType: row.resume_mime_type ?? 'application/octet-stream',
      size: Number(row.resume_file_size ?? 0),
      dataUrl: row.resume_data_url ?? '',
      uploadedAt,
      textContent: row.resume_text_content ?? undefined
    };
  }

  return {
    id: row.candidate_id,
    version: Number(row.version ?? 1),
    firstName: row.first_name,
    lastName: row.last_name,
    gender: toOptionalString(row.gender),
    age: toOptionalNumber(row.age),
    city: toOptionalString(row.city),
    desiredPosition: toOptionalString(row.desired_position),
    targetPractice: toOptionalString(row.target_practice),
    targetOffice: toOptionalString(row.target_office),
    phone: toOptionalString(row.phone),
    email: toOptionalString(row.email),
    experienceSummary: toOptionalString(row.experience_summary),
    totalExperienceYears: toOptionalNumber(row.total_experience_years),
    consultingExperienceYears: toOptionalNumber(row.consulting_experience_years),
    consultingCompanies: toOptionalString(row.consulting_companies),
    lastCompany: toOptionalString(row.last_company),
    lastPosition: toOptionalString(row.last_position),
    lastDuration: toOptionalString(row.last_duration),
    resume,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
};

const connectClient = async () =>
  (postgresPool as unknown as { connect: () => Promise<any> }).connect();

const fetchCandidateRows = async (client: any, id: string) => {
  const result = await client.query(`${selectCandidateBase} WHERE c.id = $1;`, [id]);
  return (result.rows ?? []) as CandidateJoinedRow[];
};

const upsertResume = async (client: any, candidateId: string, resume: CandidateResumeRecord) => {
  const resumeId = resume.id.trim() || randomUUID();
  const uploadedAt = new Date(resume.uploadedAt);
  const validUploadedAt = Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt;

  await client.query(
    `INSERT INTO candidate_resumes (id, candidate_id, file_name, mime_type, file_size, data_url, text_content, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (candidate_id) DO UPDATE
       SET id = EXCLUDED.id,
           file_name = EXCLUDED.file_name,
           mime_type = EXCLUDED.mime_type,
           file_size = EXCLUDED.file_size,
           data_url = EXCLUDED.data_url,
           text_content = EXCLUDED.text_content,
           uploaded_at = EXCLUDED.uploaded_at;`,
    [
      resumeId,
      candidateId,
      resume.fileName,
      resume.mimeType || 'application/octet-stream',
      Math.max(0, Number(resume.size ?? 0)),
      resume.dataUrl,
      resume.textContent ?? null,
      validUploadedAt.toISOString()
    ]
  );
};

const toNullableString = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableNumber = (value: number | undefined): number | null => {
  if (value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value;
};

export class CandidatesRepository {
  async listCandidates(): Promise<CandidateRecord[]> {
    const result = await postgresPool.query<CandidateJoinedRow>(
      `${selectCandidateBase} ORDER BY c.updated_at DESC, c.created_at DESC;`
    );
    return result.rows.map((row) => mapRowToCandidate(row));
  }

  async findCandidate(id: string): Promise<CandidateRecord | null> {
    const result = await postgresPool.query<CandidateJoinedRow>(`${selectCandidateBase} WHERE c.id = $1;`, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToCandidate(result.rows[0]);
  }

  async createCandidate(model: CandidateWriteModel): Promise<CandidateRecord> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO candidates (
            id,
            first_name,
            last_name,
            gender,
            age,
            city,
            desired_position,
            phone,
            target_practice,
            target_office,
            email,
            experience_summary,
            total_experience_years,
            consulting_experience_years,
            consulting_companies,
            last_company,
            last_position,
            last_duration,
            version,
            created_at,
            updated_at
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, 1, NOW(), NOW()
         );`,
        [
          model.id,
          model.firstName,
          model.lastName,
          toNullableString(model.gender),
          toNullableNumber(model.age),
          toNullableString(model.city),
          toNullableString(model.desiredPosition),
          toNullableString(model.targetPractice),
          toNullableString(model.targetOffice),
          toNullableString(model.phone),
          toNullableString(model.email),
          toNullableString(model.experienceSummary),
          toNullableNumber(model.totalExperienceYears),
          toNullableNumber(model.consultingExperienceYears),
          toNullableString(model.consultingCompanies),
          toNullableString(model.lastCompany),
          toNullableString(model.lastPosition),
          toNullableString(model.lastDuration)
        ]
      );

      if (model.resume) {
        await upsertResume(client, model.id, model.resume);
      }

      const rows = await fetchCandidateRows(client, model.id);
      await client.query('COMMIT');
      return mapRowToCandidate(rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateCandidate(
    model: CandidateWriteModel,
    expectedVersion: number
  ): Promise<'version-conflict' | CandidateRecord | null> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      const updateResult = await client.query(
        `UPDATE candidates
            SET first_name = $1,
                last_name = $2,
                gender = $3,
                age = $4,
                city = $5,
                desired_position = $6,
                phone = $7,
                target_practice = $8,
                target_office = $9,
                email = $10,
                experience_summary = $11,
                total_experience_years = $12,
                consulting_experience_years = $13,
                consulting_companies = $14,
                last_company = $15,
                last_position = $16,
                last_duration = $17,
                version = version + 1,
                updated_at = NOW()
          WHERE id = $18 AND version = $19
          RETURNING id;`,
        [
          model.firstName,
          model.lastName,
          toNullableString(model.gender),
          toNullableNumber(model.age),
          toNullableString(model.city),
          toNullableString(model.desiredPosition),
          toNullableString(model.phone),
          toNullableString(model.targetPractice),
          toNullableString(model.targetOffice),
          toNullableString(model.email),
          toNullableString(model.experienceSummary),
          toNullableNumber(model.totalExperienceYears),
          toNullableNumber(model.consultingExperienceYears),
          toNullableString(model.consultingCompanies),
          toNullableString(model.lastCompany),
          toNullableString(model.lastPosition),
          toNullableString(model.lastDuration),
          model.id,
          expectedVersion
        ]
      );

      if (updateResult.rowCount === 0) {
        const existsResult = await client.query('SELECT id FROM candidates WHERE id = $1 LIMIT 1;', [model.id]);
        await client.query('ROLLBACK');
        if (existsResult.rows.length === 0) {
          return null;
        }
        return 'version-conflict';
      }

      if (model.resume === null) {
        await client.query('DELETE FROM candidate_resumes WHERE candidate_id = $1;', [model.id]);
      } else if (model.resume) {
        await upsertResume(client, model.id, model.resume);
      }

      const rows = await fetchCandidateRows(client, model.id);
      await client.query('COMMIT');
      return rows.length > 0 ? mapRowToCandidate(rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteCandidate(id: string): Promise<boolean> {
    const result = await postgresPool.query('DELETE FROM candidates WHERE id = $1 RETURNING id;', [id]);
    return result.rows.length > 0;
  }
}
