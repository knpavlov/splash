import { WorkstreamsRepository } from './workstreams.repository.js';
import { WorkstreamsService } from './workstreams.service.js';

const repository = new WorkstreamsRepository();
export const workstreamsService = new WorkstreamsService(repository);
