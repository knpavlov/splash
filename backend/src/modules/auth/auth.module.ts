import { AuthService } from './auth.service.js';
import { accountsService } from '../accounts/accounts.module.js';
import { AccessCodesRepository } from './accessCodes.repository.js';

const codesRepository = new AccessCodesRepository();
export const authService = new AuthService(accountsService, codesRepository);
