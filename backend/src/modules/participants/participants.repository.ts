import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  ParticipantRecord,
  ParticipantUpdateModel,
  ParticipantWriteModel
} from './participants.types.js';

type ParticipantRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: string | null;
  hierarchy_level1: string | null;
  hierarchy_level2: string | null;
  hierarchy_level3: string | null;
  created_at: Date;
  updated_at: Date;
};

const mapRow = (row: ParticipantRow): ParticipantRecord => ({
  id: row.id,
  displayName: row.display_name,
  email: row.email,
  role: row.role,
  hierarchyLevel1: row.hierarchy_level1,
  hierarchyLevel2: row.hierarchy_level2,
  hierarchyLevel3: row.hierarchy_level3,
  createdAt: (row.created_at instanceof Date ? row.created_at : new Date()).toISOString(),
  updatedAt: (row.updated_at instanceof Date ? row.updated_at : new Date()).toISOString()
});

export class ParticipantsRepository {
  async listParticipants(): Promise<ParticipantRecord[]> {
    const result = await postgresPool.query<ParticipantRow>(
      'SELECT * FROM participants ORDER BY display_name ASC;'
    );
    return (result.rows ?? []).map((row) => mapRow(row));
  }

  async findParticipant(id: string): Promise<ParticipantRecord | null> {
    const result = await postgresPool.query<ParticipantRow>('SELECT * FROM participants WHERE id = $1 LIMIT 1;', [id]);
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  }

  async createParticipant(model: ParticipantWriteModel): Promise<ParticipantRecord> {
    const result = await postgresPool.query<ParticipantRow>(
      `INSERT INTO participants (id, display_name, email, role, hierarchy_level1, hierarchy_level2, hierarchy_level3, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *;`,
      [
        model.id,
        model.displayName,
        model.email,
        model.role,
        model.hierarchyLevel1,
        model.hierarchyLevel2,
        model.hierarchyLevel3
      ]
    );
    return mapRow(result.rows[0]);
  }

  async updateParticipant(id: string, patch: ParticipantUpdateModel): Promise<ParticipantRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    const pushField = (clause: string, value: unknown) => {
      fields.push(`${clause} = $${index}`);
      values.push(value);
      index += 1;
    };

    if (patch.displayName !== undefined) {
      pushField('display_name', patch.displayName);
    }
    if (patch.email !== undefined) {
      pushField('email', patch.email);
    }
    if (patch.role !== undefined) {
      pushField('role', patch.role);
    }
    if (patch.hierarchyLevel1 !== undefined) {
      pushField('hierarchy_level1', patch.hierarchyLevel1);
    }
    if (patch.hierarchyLevel2 !== undefined) {
      pushField('hierarchy_level2', patch.hierarchyLevel2);
    }
    if (patch.hierarchyLevel3 !== undefined) {
      pushField('hierarchy_level3', patch.hierarchyLevel3);
    }

    if (!fields.length) {
      const existing = await this.findParticipant(id);
      return existing;
    }

    const query = `
      UPDATE participants
         SET ${fields.join(', ')},
             updated_at = NOW()
       WHERE id = $${index}
       RETURNING *;`;
    const result = await postgresPool.query<ParticipantRow>(query, [...values, id]);
    if (!result.rows?.length) {
      return null;
    }
    return mapRow(result.rows[0]);
  }

  async deleteParticipant(id: string): Promise<boolean> {
    const result = await postgresPool.query<{ id: string }>('DELETE FROM participants WHERE id = $1 RETURNING id;', [id]);
    return Boolean(result.rows?.length);
  }
}
