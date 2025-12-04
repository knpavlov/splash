import { apiRequest } from '../../../shared/api/httpClient';
import {
  FinancialDynamicsPreferences,
  FinancialDynamicsPreferencesUpdate
} from '../../../shared/types/financialDynamics';

export const financialDynamicsApi = {
  getPreferences: (accountId: string) =>
    apiRequest<FinancialDynamicsPreferences>('/financial-dynamics/preferences', {
      headers: { 'X-Account-Id': accountId }
    }),
  savePreferences: (accountId: string, payload: FinancialDynamicsPreferencesUpdate) =>
    apiRequest<FinancialDynamicsPreferences>('/financial-dynamics/preferences', {
      method: 'PUT',
      headers: { 'X-Account-Id': accountId },
      body: payload
    })
};
