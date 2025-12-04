import { postgresPool } from '../../shared/database/postgres.client.js';
import { FinancialDynamicsPreferencesRow, FinancialDynamicsSettings } from './financialDynamics.types.js';

export class FinancialDynamicsRepository {
  async getPreferences(accountId: string): Promise<FinancialDynamicsPreferencesRow | null> {
    const result = await postgresPool.query<FinancialDynamicsPreferencesRow>(
      `SELECT account_id, settings, favorites, updated_at
         FROM account_financial_dynamics_preferences
        WHERE account_id = $1
        LIMIT 1;`,
      [accountId]
    );
    const row = result.rows?.[0];
    if (!row) {
      return null;
    }
    return {
      account_id: row.account_id,
      settings: row.settings ?? {},
      favorites: row.favorites ?? [],
      updated_at: row.updated_at ?? new Date()
    };
  }

  async upsertPreferences(
    accountId: string,
    settings: FinancialDynamicsSettings,
    favorites: string[]
  ): Promise<FinancialDynamicsPreferencesRow> {
    const result = await postgresPool.query<FinancialDynamicsPreferencesRow>(
      `INSERT INTO account_financial_dynamics_preferences (account_id, settings, favorites, updated_at)
       VALUES ($1, $2::jsonb, $3::text[], NOW())
       ON CONFLICT (account_id)
     DO UPDATE
           SET settings = EXCLUDED.settings,
               favorites = EXCLUDED.favorites,
               updated_at = NOW()
       RETURNING account_id, settings, favorites, updated_at;`,
      [accountId, settings, favorites]
    );
    const row = result.rows?.[0];
    return {
      account_id: accountId,
      settings: (row?.settings as Record<string, unknown>) ?? settings,
      favorites: row?.favorites ?? favorites,
      updated_at: row?.updated_at ?? new Date()
    };
  }
}
