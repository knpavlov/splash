import { apiRequest } from '../../../shared/api/httpClient';
import type {
  InitiativeFormSettingsMatrix,
  InitiativeFormSettingsPayload
} from '../../../shared/types/initiativeFormSettings';

export const initiativeFormSettingsApi = {
  get: async () => apiRequest<InitiativeFormSettingsPayload>('/initiatives/form-settings'),
  update: async (settings: InitiativeFormSettingsMatrix) =>
    apiRequest<InitiativeFormSettingsPayload>('/initiatives/form-settings', { method: 'PUT', body: settings })
};

