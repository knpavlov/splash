import { InitiativeLogsRepository } from './initiativeLogs.repository.js';
import { InitiativeLogsService } from './initiativeLogs.service.js';

const repository = new InitiativeLogsRepository();
export const initiativeLogsService = new InitiativeLogsService(repository);
