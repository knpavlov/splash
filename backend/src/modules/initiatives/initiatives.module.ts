import { InitiativesRepository } from './initiatives.repository.js';
import { InitiativesService } from './initiatives.service.js';
import { WorkstreamsRepository } from '../workstreams/workstreams.repository.js';
import { InitiativeFormSettingsRepository } from './initiativeFormSettings.repository.js';

const initiativesRepository = new InitiativesRepository();
const workstreamsRepository = new WorkstreamsRepository();
const initiativeFormSettingsRepo = new InitiativeFormSettingsRepository();
export const initiativesService = new InitiativesService(
  initiativesRepository,
  workstreamsRepository,
  initiativeFormSettingsRepo
);
export const initiativeFormSettingsRepository = initiativeFormSettingsRepo;
