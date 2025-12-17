import { postgresPool } from '../../shared/database/postgres.client.js';

export type LandingInquiryInsert = {
  id: string;
  intent: string;
  seats: number;
  annualBilling: boolean;
  contactName: string;
  contactEmail: string;
  company?: string | null;
  message?: string | null;
  meta?: unknown;
};

export class LandingRepository {
  async insertInquiry(payload: LandingInquiryInsert): Promise<{ id: string }> {
    const result = await postgresPool.query(
      `INSERT INTO landing_inquiries (
         id,
         intent,
         seats,
         annual_billing,
         contact_name,
         contact_email,
         company,
         message,
         meta
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id;`,
      [
        payload.id,
        payload.intent,
        payload.seats,
        payload.annualBilling,
        payload.contactName,
        payload.contactEmail,
        payload.company ?? null,
        payload.message ?? null,
        payload.meta ?? null
      ]
    );
    return { id: result.rows[0]?.id as string };
  }
}

