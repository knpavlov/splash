import { FinancialDynamicsRepository } from './financialDynamics.repository.js';
import { FinancialDynamicsService } from './financialDynamics.service.js';

const repository = new FinancialDynamicsRepository();
const service = new FinancialDynamicsService(repository);

export { service as financialDynamicsService };
