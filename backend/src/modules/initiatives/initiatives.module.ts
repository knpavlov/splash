import { InitiativesRepository } from './initiatives.repository.js';
import { InitiativesService } from './initiatives.service.js';
import { WorkstreamsRepository } from '../workstreams/workstreams.repository.js';

const initiativesRepository = new InitiativesRepository();
const workstreamsRepository = new WorkstreamsRepository();
export const initiativesService = new InitiativesService(initiativesRepository, workstreamsRepository);
