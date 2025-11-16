import { apiRequest, ApiError } from '../../../shared/api/httpClient';
import { FinancialBlueprint, FinancialBlueprintPayload } from '../../../shared/types/financials';
import { DomainErrorCode, DomainResult } from '../../../shared/types/results';

export const financialsApi = {
  async getBlueprint(): Promise<FinancialBlueprint> {
    return apiRequest<FinancialBlueprint>('/financials/blueprint');
  },

  async saveBlueprint(
    blueprint: FinancialBlueprintPayload,
    expectedVersion: number
  ): Promise<DomainResult<FinancialBlueprint>> {
    try {
      const record = await apiRequest<FinancialBlueprint>('/financials/blueprint', {
        method: 'PUT',
        body: { blueprint, expectedVersion }
      });
      return { ok: true, data: record };
    } catch (error) {
      if (error instanceof ApiError && error.code) {
        return { ok: false, error: error.code as DomainErrorCode };
      }
      return { ok: false, error: 'unknown' };
    }
  }
};
