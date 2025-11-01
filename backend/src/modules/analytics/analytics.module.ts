import { AnalyticsRepository } from './analytics.repository.js';
import { AnalyticsService } from './analytics.service.js';

const repository = new AnalyticsRepository();
export const analyticsService = new AnalyticsService(repository);
