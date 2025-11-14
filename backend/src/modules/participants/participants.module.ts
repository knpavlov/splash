import { ParticipantsRepository } from './participants.repository.js';
import { ParticipantsService } from './participants.service.js';

const repository = new ParticipantsRepository();
export const participantsService = new ParticipantsService(repository);
