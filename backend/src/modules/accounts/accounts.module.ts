import { AccountsService } from './accounts.service.js';
import { AccountsRepository } from './accounts.repository.js';

const repository = new AccountsRepository();
export const accountsService = new AccountsService(repository);
