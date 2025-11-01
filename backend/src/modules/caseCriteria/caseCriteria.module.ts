import { CaseCriteriaRepository } from './caseCriteria.repository.js';
import { CaseCriteriaService } from './caseCriteria.service.js';

const repository = new CaseCriteriaRepository();
export const caseCriteriaService = new CaseCriteriaService(repository);
