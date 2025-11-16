import { FinancialsRepository } from './financials.repository.js';
import { FinancialsService } from './financials.service.js';

const repository = new FinancialsRepository();
export const financialsService = new FinancialsService(repository);
