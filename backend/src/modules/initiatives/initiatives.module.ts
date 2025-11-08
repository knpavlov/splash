import { InitiativesRepository } from './initiatives.repository.js';
import { InitiativesService } from './initiatives.service.js';

const initiativesRepository = new InitiativesRepository();
export const initiativesService = new InitiativesService(initiativesRepository);
