import { CasesService } from './cases.service.js';
import { CasesRepository } from './cases.repository.js';

const repository = new CasesRepository();
export const casesService = new CasesService(repository);
