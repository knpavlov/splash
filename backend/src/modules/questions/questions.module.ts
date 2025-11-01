import { QuestionsService } from './questions.service.js';
import { QuestionsRepository } from './questions.repository.js';

const repository = new QuestionsRepository();
export const questionsService = new QuestionsService(repository);
