import { createHash, randomUUID } from 'crypto';
import { postgresPool } from './postgres.client.js';

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'knpavlov@gmail.com';

const connectClient = async () =>
  (postgresPool as unknown as { connect: () => Promise<any> }).connect();

const createTables = async () => {
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      invitation_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ
    );
  `);

  await postgresPool.query(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT;
  `);

  await postgresPool.query(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS display_name TEXT;
  `);

  await postgresPool.query(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS interviewer_role TEXT;
  `);

  await postgresPool.query(`
    UPDATE accounts
       SET display_name = COALESCE(display_name, NULLIF(trim(concat_ws(' ', last_name, first_name)), ''))
     WHERE display_name IS NULL;
  `);

  await postgresPool.query(`
    UPDATE accounts
       SET first_name = COALESCE(first_name, NULLIF(split_part(display_name, ' ', 1), ''))
     WHERE display_name IS NOT NULL AND NULLIF(display_name, '') IS NOT NULL;
  `);

  await postgresPool.query(`
    UPDATE accounts
       SET last_name = COALESCE(
         last_name,
         NULLIF(trim(regexp_replace(display_name, '^\\s*\\S+\\s*', '')), '')
       )
     WHERE display_name IS NOT NULL AND NULLIF(display_name, '') IS NOT NULL;
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS access_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS case_folders (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS case_files (
      id UUID PRIMARY KEY,
      folder_id UUID NOT NULL REFERENCES case_folders(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      data_url TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS case_evaluation_criteria (
      id UUID PRIMARY KEY,
      folder_id UUID NOT NULL REFERENCES case_folders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      rating_1 TEXT,
      rating_2 TEXT,
      rating_3 TEXT,
      rating_4 TEXT,
      rating_5 TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS case_criteria (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      rating_1 TEXT,
      rating_2 TEXT,
      rating_3 TEXT,
      rating_4 TEXT,
      rating_5 TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    ALTER TABLE case_folders
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
  `);

  await postgresPool.query(`
    ALTER TABLE case_files
      ADD COLUMN IF NOT EXISTS mime_type TEXT,
      ADD COLUMN IF NOT EXISTS file_size INTEGER,
      ADD COLUMN IF NOT EXISTS data_url TEXT,
      ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await postgresPool.query(`
    ALTER TABLE case_criteria
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id UUID PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT,
      age INTEGER,
      city TEXT,
      desired_position TEXT,
      target_practice TEXT,
      target_office TEXT,
      phone TEXT,
      email TEXT,
      experience_summary TEXT,
      total_experience_years INTEGER,
      consulting_experience_years INTEGER,
      consulting_companies TEXT,
      last_company TEXT,
      last_position TEXT,
      last_duration TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS gender TEXT,
      ADD COLUMN IF NOT EXISTS age INTEGER,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS desired_position TEXT,
      ADD COLUMN IF NOT EXISTS target_practice TEXT,
      ADD COLUMN IF NOT EXISTS target_office TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS experience_summary TEXT,
      ADD COLUMN IF NOT EXISTS total_experience_years INTEGER,
      ADD COLUMN IF NOT EXISTS consulting_experience_years INTEGER,
      ADD COLUMN IF NOT EXISTS consulting_companies TEXT,
      ADD COLUMN IF NOT EXISTS last_company TEXT,
      ADD COLUMN IF NOT EXISTS last_position TEXT,
      ADD COLUMN IF NOT EXISTS last_duration TEXT,
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS candidate_resumes (
      id UUID PRIMARY KEY,
      candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      data_url TEXT NOT NULL,
      text_content TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS candidate_resumes_candidate_id_idx
      ON candidate_resumes(candidate_id);
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id UUID PRIMARY KEY,
      candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
      round_number INTEGER,
      interview_count INTEGER NOT NULL DEFAULT 0,
      interviews JSONB NOT NULL DEFAULT '[]'::JSONB,
      fit_question_id UUID,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      forms JSONB NOT NULL DEFAULT '[]'::JSONB,
      process_status TEXT NOT NULL DEFAULT 'draft',
      process_started_at TIMESTAMPTZ,
      round_history JSONB NOT NULL DEFAULT '[]'::JSONB,
      decision TEXT,
      decision_status TEXT
    );
  `);

  await postgresPool.query(`
    ALTER TABLE evaluations
      ADD COLUMN IF NOT EXISTS interview_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS interviews JSONB NOT NULL DEFAULT '[]'::JSONB,
      ADD COLUMN IF NOT EXISTS fit_question_id UUID,
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS forms JSONB NOT NULL DEFAULT '[]'::JSONB,
      ADD COLUMN IF NOT EXISTS process_status TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS process_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS round_history JSONB NOT NULL DEFAULT '[]'::JSONB,
      ADD COLUMN IF NOT EXISTS decision TEXT,
      ADD COLUMN IF NOT EXISTS decision_status TEXT;
  `);

  await postgresPool.query(`
    UPDATE evaluations
       SET decision_status = COALESCE(decision_status, 'pending')
     WHERE decision_status IS NULL;
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS evaluation_assignments (
      id UUID PRIMARY KEY,
      evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      interviewer_email TEXT NOT NULL,
      interviewer_name TEXT NOT NULL,
      case_folder_id UUID NOT NULL,
      fit_question_id UUID NOT NULL,
      round_number INTEGER NOT NULL DEFAULT 1,
      invitation_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (evaluation_id, slot_id)
    );
  `);

  await postgresPool.query(`
    ALTER TABLE evaluation_assignments
      ADD COLUMN IF NOT EXISTS case_folder_id UUID,
      ADD COLUMN IF NOT EXISTS fit_question_id UUID;
  `);

  await postgresPool.query(`
    ALTER TABLE evaluation_assignments
      ALTER COLUMN invitation_sent_at DROP NOT NULL;
  `);

  await postgresPool.query(`
    ALTER TABLE evaluation_assignments
      ALTER COLUMN invitation_sent_at DROP DEFAULT;
  `);

  await postgresPool.query(`
    WITH slot_data AS (
      SELECT
        ea.id,
        CASE
          WHEN slot.value ? 'caseFolderId'
            AND jsonb_typeof(slot.value->'caseFolderId') = 'string'
            AND slot.value->>'caseFolderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (slot.value->>'caseFolderId')::uuid
          ELSE NULL
        END AS case_id,
        CASE
          WHEN slot.value ? 'fitQuestionId'
            AND jsonb_typeof(slot.value->'fitQuestionId') = 'string'
            AND slot.value->>'fitQuestionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (slot.value->>'fitQuestionId')::uuid
          ELSE NULL
        END AS question_id
      FROM evaluation_assignments ea
      JOIN evaluations e ON e.id = ea.evaluation_id
      CROSS JOIN LATERAL jsonb_array_elements(e.interviews) AS slot(value)
      WHERE slot.value->>'id' = ea.slot_id
    )
    UPDATE evaluation_assignments ea
       SET case_folder_id = COALESCE(ea.case_folder_id, slot_data.case_id),
           fit_question_id = COALESCE(ea.fit_question_id, slot_data.question_id)
      FROM slot_data
     WHERE ea.id = slot_data.id;
  `);

  await postgresPool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'evaluation_assignments'
           AND column_name = 'case_folder_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM evaluation_assignments WHERE case_folder_id IS NULL
      ) THEN
        EXECUTE 'ALTER TABLE evaluation_assignments ALTER COLUMN case_folder_id SET NOT NULL';
      END IF;

      IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'evaluation_assignments'
           AND column_name = 'fit_question_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM evaluation_assignments WHERE fit_question_id IS NULL
      ) THEN
        EXECUTE 'ALTER TABLE evaluation_assignments ALTER COLUMN fit_question_id SET NOT NULL';
      END IF;
    END
    $$;
  `);

  await postgresPool.query(`
    ALTER TABLE evaluation_assignments
      ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 1;
  `);

  await postgresPool.query(`
    ALTER TABLE evaluation_assignments
      ADD COLUMN IF NOT EXISTS details_checksum TEXT,
      ADD COLUMN IF NOT EXISTS last_sent_checksum TEXT,
      ADD COLUMN IF NOT EXISTS last_delivery_error_code TEXT,
      ADD COLUMN IF NOT EXISTS last_delivery_error TEXT,
      ADD COLUMN IF NOT EXISTS last_delivery_attempt_at TIMESTAMPTZ;
  `);

  const checksumRows = await postgresPool.query<{
    id: string;
    interviewer_email: string;
    interviewer_name: string;
    case_folder_id: string | null;
    fit_question_id: string | null;
  }>(
    `SELECT id, interviewer_email, interviewer_name, case_folder_id, fit_question_id
       FROM evaluation_assignments
      WHERE details_checksum IS NULL;`
  );

  for (const row of checksumRows.rows) {
    if (!row.case_folder_id || !row.fit_question_id) {
      continue;
    }
    const hash = createHash('sha256');
    hash.update(row.interviewer_email ?? '');
    hash.update('|');
    hash.update(row.interviewer_name?.trim() ?? '');
    hash.update('|');
    hash.update(row.case_folder_id);
    hash.update('|');
    hash.update(row.fit_question_id);
    const checksum = hash.digest('hex');
    await postgresPool.query(`UPDATE evaluation_assignments SET details_checksum = $2 WHERE id = $1;`, [
      row.id,
      checksum
    ]);
  }

  await postgresPool.query(`
    UPDATE evaluation_assignments
       SET last_sent_checksum = details_checksum
     WHERE invitation_sent_at IS NOT NULL
       AND last_sent_checksum IS NULL;
  `);

  await postgresPool.query(`
    UPDATE evaluation_assignments
       SET last_delivery_attempt_at = invitation_sent_at
     WHERE invitation_sent_at IS NOT NULL
       AND last_delivery_attempt_at IS NULL;
  `);

  // Удаляем возможные дубли записей по слоту, оставляя самую свежую отправку
  await postgresPool.query(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY evaluation_id, slot_id
          ORDER BY invitation_sent_at DESC, created_at DESC, id DESC
        ) AS row_number
      FROM evaluation_assignments
    )
    DELETE FROM evaluation_assignments ea
      USING ranked
     WHERE ea.id = ranked.id
       AND ranked.row_number > 1;
  `);

  // Гарантируем наличие уникального ограничения для пары (evaluation_id, slot_id)
  await postgresPool.query(`
    DO $$
    DECLARE
      evaluation_id_att SMALLINT;
      slot_id_att SMALLINT;
    BEGIN
      SELECT attnum
        INTO evaluation_id_att
        FROM pg_attribute
       WHERE attrelid = 'evaluation_assignments'::regclass
         AND attname = 'evaluation_id'
         AND NOT attisdropped;

      SELECT attnum
        INTO slot_id_att
        FROM pg_attribute
       WHERE attrelid = 'evaluation_assignments'::regclass
         AND attname = 'slot_id'
         AND NOT attisdropped;

      IF evaluation_id_att IS NULL OR slot_id_att IS NULL THEN
        RETURN;
      END IF;

      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'evaluation_assignments'::regclass
           AND contype IN ('u', 'p')
           AND conkey = ARRAY[evaluation_id_att, slot_id_att]::smallint[]
      ) THEN
        EXECUTE 'ALTER TABLE evaluation_assignments
                  ADD CONSTRAINT evaluation_assignments_evaluation_slot_unique
                  UNIQUE (evaluation_id, slot_id)';
      END IF;
    END
    $$;
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      difficulty TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS fit_questions (
      id UUID PRIMARY KEY,
      short_title TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS fit_question_criteria (
      id UUID PRIMARY KEY,
      question_id UUID NOT NULL REFERENCES fit_questions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      rating_1 TEXT,
      rating_2 TEXT,
      rating_3 TEXT,
      rating_4 TEXT,
      rating_5 TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await postgresPool.query(`
    ALTER TABLE fit_questions
      ADD COLUMN IF NOT EXISTS short_title TEXT NOT NULL DEFAULT 'Untitled question',
      ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await postgresPool.query(`
    ALTER TABLE fit_questions
      ALTER COLUMN short_title DROP DEFAULT,
      ALTER COLUMN content DROP DEFAULT;
  `);

  await postgresPool.query(`
    ALTER TABLE fit_question_criteria
      ADD COLUMN IF NOT EXISTS rating_1 TEXT,
      ADD COLUMN IF NOT EXISTS rating_2 TEXT,
      ADD COLUMN IF NOT EXISTS rating_3 TEXT,
      ADD COLUMN IF NOT EXISTS rating_4 TEXT,
      ADD COLUMN IF NOT EXISTS rating_5 TEXT;
  `);
};

const syncSuperAdmin = async () => {
  const client = await connectClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, email FROM accounts WHERE role = 'super-admin' ORDER BY created_at ASC LIMIT 1;`
    );

    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO accounts (id, email, role, status, invitation_token, created_at, activated_at)
         VALUES ($1, $2, 'super-admin', 'active', 'seed', NOW(), NOW());`,
        [randomUUID(), SUPER_ADMIN_EMAIL]
      );
      await client.query('COMMIT');
      return;
    }

    const current = existing.rows[0] as { id: string; email: string };
    if (current.email === SUPER_ADMIN_EMAIL) {
      await client.query(
        `UPDATE accounts
            SET status = 'active',
                invitation_token = 'seed',
                activated_at = COALESCE(activated_at, NOW())
          WHERE id = $1;`,
        [current.id]
      );
      await client.query('COMMIT');
      return;
    }

    const conflict = await client.query(
      `SELECT 1 FROM accounts WHERE email = $1 AND role <> 'super-admin' LIMIT 1;`,
      [SUPER_ADMIN_EMAIL]
    );

    if (conflict.rowCount > 0) {
      console.warn(
        `Cannot update the super admin email: address ${SUPER_ADMIN_EMAIL} is already used by another account.`
      );
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE accounts
          SET email = $1,
              status = 'active',
              invitation_token = 'seed',
              activated_at = COALESCE(activated_at, NOW())
        WHERE id = $2;`,
      [SUPER_ADMIN_EMAIL, current.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const runMigrations = async () => {
  // In this lightweight version we run migrations sequentially during server startup
  await createTables();
  await syncSuperAdmin();
};
