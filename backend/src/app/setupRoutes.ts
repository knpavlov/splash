import { Application } from 'express';
import { accountsRouter } from '../modules/accounts/accounts.router.js';
import { casesRouter } from '../modules/cases/cases.router.js';
import { candidatesRouter } from '../modules/candidates/candidates.router.js';
import { evaluationsRouter } from '../modules/evaluations/evaluations.router.js';
import { interviewerRouter } from '../modules/evaluations/interviewer.router.js';
import { questionsRouter } from '../modules/questions/questions.router.js';
import { caseCriteriaRouter } from '../modules/caseCriteria/caseCriteria.router.js';
import { analyticsRouter } from '../modules/analytics/analytics.router.js';
import { healthRouter } from '../shared/health.router.js';
import { authRouter } from '../modules/auth/auth.router.js';
import { demoRouter } from '../modules/demo/demo.router.js';

export const registerAppRoutes = (app: Application) => {
  // TODO: add middleware for authentication and request logging
  app.use('/health', healthRouter);
  app.use('/accounts', accountsRouter);
  app.use('/auth', authRouter);
  app.use('/cases', casesRouter);
  app.use('/candidates', candidatesRouter);
  app.use('/evaluations', evaluationsRouter);
  app.use('/interviewer', interviewerRouter);
  app.use('/questions', questionsRouter);
  app.use('/case-criteria', caseCriteriaRouter);
  app.use('/analytics', analyticsRouter);
  app.use('/demo', demoRouter);
};
