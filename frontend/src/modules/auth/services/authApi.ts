import { apiRequest } from '../../../shared/api/httpClient';
import { AccountRole } from '../../../shared/types/account';

interface VerifyCodeResponse {
  token: string;
  email: string;
  role: AccountRole;
}

export const authApi = {
  requestCode: async (email: string) =>
    apiRequest<{ email: string }>('/auth/request-code', {
      method: 'POST',
      body: { email }
    }),
  verifyCode: async (email: string, code: string) =>
    apiRequest<VerifyCodeResponse>('/auth/verify-code', {
      method: 'POST',
      body: { email, code }
    })
};
