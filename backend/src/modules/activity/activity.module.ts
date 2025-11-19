import { ActivityRepository } from './activity.repository.js';
import { ActivityService } from './activity.service.js';
import { InitiativesRepository } from '../initiatives/initiatives.repository.js';
import { WorkstreamsRepository } from '../workstreams/workstreams.repository.js';

const repository = new ActivityRepository();
const initiativesRepository = new InitiativesRepository();
const workstreamsRepository = new WorkstreamsRepository();

export const activityService = new ActivityService(repository, initiativesRepository, workstreamsRepository);
