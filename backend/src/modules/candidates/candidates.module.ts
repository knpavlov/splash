import { CandidatesService } from './candidates.service.js';
import { CandidatesRepository } from './candidates.repository.js';

const repository = new CandidatesRepository();
export const candidatesService = new CandidatesService(repository);
