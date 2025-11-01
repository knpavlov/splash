import { AccountRecord, InterviewerSeniority } from './accounts.types.js';
import { postgresPool } from '../../shared/database/postgres.client.js';

const toTitleCase = (value: string): string =>
  value.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());

const deriveNameFromEmail = (email: string): string | undefined => {
  const localPart = email.split('@')[0] ?? '';
  const normalized = localPart.replace(/[._-]+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return toTitleCase(normalized);
};

const readLegacyName = (row: any): string | undefined => {
  const parts = [row.last_name, row.first_name]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => Boolean(value));
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(' ');
};

const splitFullName = (value: string | undefined | null): { firstName?: string; lastName?: string } => {
  if (typeof value !== 'string') {
    return {};
  }
  const tokens = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => Boolean(token));
  if (!tokens.length) {
    return {};
  }
  const [first, ...rest] = tokens;
  const last = rest.join(' ').trim();
  return {
    firstName: first ? toTitleCase(first) : undefined,
    lastName: last ? toTitleCase(last) : undefined
  };
};

const normalizeInterviewerRole = (value: unknown): InterviewerSeniority | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  if (!upper) {
    return null;
  }
  return ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'].includes(upper)
    ? (upper as InterviewerSeniority)
    : null;
};

const normalizeRole = (value: unknown): AccountRecord['role'] => {
  if (typeof value !== 'string') {
    return 'user';
  }

  const normalized = value.trim().toLowerCase();
  const allowed: AccountRecord['role'][] = ['super-admin', 'admin', 'user'];

  return allowed.includes(normalized as AccountRecord['role'])
    ? (normalized as AccountRecord['role'])
    : 'user';
};

const mapRowToAccount = (row: any): AccountRecord => {
  const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : '';
  const legacyName = readLegacyName(row);
  const fallbackName =
    displayName || legacyName || (typeof row.email === 'string' ? deriveNameFromEmail(row.email) ?? '' : '');
  const firstNameRaw = typeof row.first_name === 'string' ? row.first_name.trim() : '';
  const lastNameRaw = typeof row.last_name === 'string' ? row.last_name.trim() : '';
  const derivedParts = splitFullName(displayName || legacyName || fallbackName);

  return {
    id: row.id,
    email: row.email,
    // Сохраняем роли в едином нижнем регистре, чтобы фронтенд и бэкенд использовали одинаковые ключи.
    role: normalizeRole(row.role),
    status: row.status,
    interviewerRole: normalizeInterviewerRole(row.interviewer_role),
    name: fallbackName || undefined,
    firstName: firstNameRaw || derivedParts.firstName,
    lastName: lastNameRaw || derivedParts.lastName,
    invitationToken: row.invitation_token,
    createdAt: new Date(row.created_at),
    activatedAt: row.activated_at ? new Date(row.activated_at) : undefined
  };
};

export class AccountsRepository {
  async listAccounts(): Promise<AccountRecord[]> {
    const result = await postgresPool.query('SELECT * FROM accounts ORDER BY created_at DESC;');
    return result.rows.map(mapRowToAccount);
  }

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const result = await postgresPool.query('SELECT * FROM accounts WHERE email = $1 LIMIT 1;', [email]);
    const row = result.rows[0];
    return row ? mapRowToAccount(row) : null;
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const result = await postgresPool.query('SELECT * FROM accounts WHERE id = $1 LIMIT 1;', [id]);
    const row = result.rows[0];
    return row ? mapRowToAccount(row) : null;
  }

  async insertAccount(record: AccountRecord): Promise<AccountRecord> {
    const result = await postgresPool.query(
      `INSERT INTO accounts (id, email, role, status, invitation_token, created_at, activated_at, display_name, first_name, last_name, interviewer_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *;`,
      [
        record.id,
        record.email,
        record.role,
        record.status,
        record.invitationToken,
        record.createdAt,
        record.activatedAt ?? null,
        record.name ?? null,
        record.firstName ?? null,
        record.lastName ?? null,
        record.interviewerRole ?? null
      ]
    );
    return mapRowToAccount(result.rows[0]);
  }

  async updateActivation(id: string, activatedAt: Date): Promise<AccountRecord | null> {
    const result = await postgresPool.query(
      `UPDATE accounts
         SET status = 'active',
             activated_at = $2
       WHERE id = $1
       RETURNING *;`,
      [id, activatedAt]
    );
    const row = result.rows[0];
    return row ? mapRowToAccount(row) : null;
  }

  async updateRole(id: string, role: 'admin' | 'user'): Promise<AccountRecord | null> {
    const result = await postgresPool.query(
      `UPDATE accounts
          SET role = $2
        WHERE id = $1
        RETURNING *;`,
      [id, role]
    );
    const row = result.rows[0];
    return row ? mapRowToAccount(row) : null;
  }

  async removeAccount(id: string): Promise<AccountRecord | null> {
    const result = await postgresPool.query('DELETE FROM accounts WHERE id = $1 RETURNING *;', [id]);
    const row = result.rows[0];
    return row ? mapRowToAccount(row) : null;
  }
}
