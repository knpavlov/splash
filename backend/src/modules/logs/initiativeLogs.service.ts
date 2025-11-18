import { InitiativeLogsRepository, InitiativeLogFilters } from './initiativeLogs.repository.js';

export class InitiativeLogsService {
  constructor(private readonly repository: InitiativeLogsRepository) {}

  listLogs(accountId: string, filters: InitiativeLogFilters) {
    return this.repository.listEntries(accountId, filters);
  }

  markAsRead(accountId: string, eventIds: string[]) {
    return this.repository.markAsRead(accountId, eventIds);
  }
}
