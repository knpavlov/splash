import { EvaluationsService } from './evaluations.service.js';
import { EvaluationsRepository } from './evaluations.repository.js';
import { EvaluationWorkflowService } from './evaluationWorkflow.service.js';
import { accountsService } from '../accounts/accounts.module.js';
import { candidatesService } from '../candidates/candidates.module.js';
import { casesService } from '../cases/cases.module.js';
import { questionsService } from '../questions/questions.module.js';

const repository = new EvaluationsRepository();
export const evaluationsService = new EvaluationsService(repository);
export const evaluationWorkflowService = new EvaluationWorkflowService(
  repository,
  accountsService,
  candidatesService,
  casesService,
  questionsService
);
